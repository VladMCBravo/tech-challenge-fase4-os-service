# Tech Challenge Fase 4 — OS Service (`tech-challenge-fase4-os-service`)

Microsserviço responsável pelo gerenciamento de **Ordens de Serviço (OS)**, **Clientes**, **Veículos**, **Catálogo de Serviços** e **Controle/Reserva de Estoque**, coordenando o início e o encerramento do fluxo transacional distribuído via **Saga Pattern Coreografado**.

- **Participante:** Vladmir Musa Costa Bravo (RM 374193)
- **Curso:** Pós-graduação em Arquitetura de Software — FIAP (SOAT)

---

## 1. Arquitetura de Microsserviços (Fase 4)

A solução foi decomposta em **3 microsserviços independentes**, cada um com seu próprio repositório, infraestrutura Terraform (`/infra`), manifestos Kubernetes (`/k8s`), pipeline de CI/CD (`.github/workflows/deploy.yml`) e **banco de dados exclusivo (Database per Service — Poliglota SQL + NoSQL)**:

| Microsserviço | Repositório | Banco de Dados | Infra & K8s | Porta | Responsabilidades |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **OS Service** | `tech-challenge-fase4-os-service` | **PostgreSQL (SQL)** (`os_db`) | `/infra` + `/k8s` | `3000` | Abertura de OS, clientes, veículos, serviços, reserva/estorno de estoque e ciclo de vida da OS. |
| **Billing Service** | `tech-challenge-fase4-billing-service` | **PostgreSQL (SQL)** (`billing_db`) | `/infra` + `/k8s` | `3001` | Geração de orçamento, autenticação OAuth2 (`client_id`/`client_secret`) e cobrança PIX/Checkout via **Mercado Pago**, aprovação/rejeição e reembolso. |
| **Execution Service** | `tech-challenge-fase4-execution-service` | **MongoDB (NoSQL)** (`execution_db`) | `/infra` + `/k8s` | `3002` | Fila priorizada de produção, etapas de diagnóstico/reparo e conclusão/falha da execução. |

```mermaid
flowchart TB
    Client["Cliente / Atendente / Mecânico"] --> APIGW["Amazon API Gateway"]
    APIGW --> AuthLambda["AWS Lambda (Serverless Auth CPF -> JWT)"]
    APIGW --> OS["OS Service (NestJS :3000)"]
    APIGW --> BIL["Billing Service (NestJS :3001)"]
    APIGW --> EXE["Execution Service (NestJS :3002)"]

    OS --> DB_OS[("PostgreSQL (SQL)\nos_db")]
    BIL --> DB_BIL[("PostgreSQL (SQL)\nbilling_db")]
    BIL --> MP["Mercado Pago API\n(OAuth2 Token / Checkout / PIX / Webhook)"]
    EXE --> DB_EXE[("MongoDB (NoSQL)\nexecution_db")]

    OS <-->|"Eventos Saga"| RMQ(("RabbitMQ\nExchange: oficina.saga"))
    BIL <-->|"Eventos Saga"| RMQ
    EXE <-->|"Eventos Saga"| RMQ

    OS -.->|"Traces, Métricas, Logs JSON"| DD["Datadog Observability"]
    BIL -.->|"Traces, Métricas, Logs JSON"| DD
    EXE -.->|"Traces, Métricas, Logs JSON"| DD
```

> **Isolamento de Dados:** Nenhum microsserviço acessa diretamente o banco de dados de outro. Toda sincronização de estado entre `OS Service`, `Billing Service` e `Execution Service` ocorre exclusivamente via eventos assíncronos no **RabbitMQ** (`exchange: oficina.saga`).

---

## 2. Saga Pattern — Estratégia Escolhida e Justificativa

### Escolha: **Saga Coreografada (Event-Driven Choreography via RabbitMQ)**

**Justificativa Arquitetural:**
1. **Desacoplamento e Autonomia:** Em uma arquitetura com 3 domínios bem delimitados (`OS`, `Billing`, `Execution`), a coreografia evita um ponto único de falha (SPOF) e elimina o acoplamento temporal que existiria em um orquestrador central acoplado a chamadas remotas bloqueantes.
2. **Menor Custo Operacional e Simplicidade Evolutiva:** Os 3 microsserviços reagem a eventos de domínio publicados na exchange `oficina.saga` do RabbitMQ, mantendo cada serviço coeso em sua responsabilidade única.
3. **Transações Compensatórias Explícitas (Rollback Seguro):**
   - **Reserva de Estoque na Abertura para Aprovação (`moveToAwaitingApproval`):** Antes de publicar `os.budget.requested`, o `os-service` valida a disponibilidade e realiza a baixa preventiva (`DECREASE`) no estoque.
   - **Compensação 1 — Falha de Pagamento / Recusa de Orçamento (`payment.failed`):** Caso o pagamento seja recusado no Mercado Pago ou rejeitado pelo cliente, o `billing-service` publica `payment.failed`. O `os-service` consome o evento, **estorna automaticamente as peças ao estoque (`REVERSAL`)** e altera o status da OS para `CANCELLED`.
   - **Compensação 2 — Falha Crítica na Execução (`execution.failed`):** Caso o mecânico identifique impossibilidade de reparo no `execution-service`, o evento `execution.failed` é publicado. O `billing-service` consome o evento e **estorna o pagamento no Mercado Pago (`REFUNDED`)**, enquanto o `os-service` **estorna o estoque (`REVERSAL`)** e cancela a OS (`CANCELLED`).

---

## 3. Evidências de Testes Unitários, BDD e Cobertura (`> 80%`)

O serviço possui **12 suítes de testes (127 testes passando, 0 falhas)**, incluindo especificação **BDD em Gherkin** (`src/work-orders/features/work-order-saga.feature` e `src/work-orders/work-order-saga.bdd.spec.ts`):

```text
PASS src/app.controller.spec.ts
PASS src/auth/auth.service.spec.ts
PASS src/customers/customers.service.spec.ts
PASS src/inventory/inventory.service.spec.ts
PASS src/messaging/rabbitmq.service.spec.ts
PASS src/services/services.service.spec.ts
PASS src/shared/validators/document.validator.spec.ts
PASS src/shared/validators/plate.validator.spec.ts
PASS src/vehicles/vehicles.service.spec.ts
PASS src/work-orders/application/use-cases/work-order-use-cases.spec.ts
PASS src/work-orders/work-order-saga.bdd.spec.ts
PASS src/work-orders/work-orders.service.spec.ts

------------------------------------------------|---------|----------|---------|---------|-------------------------------------------
File                                            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s                         
------------------------------------------------|---------|----------|---------|---------|-------------------------------------------
All files                                       |   94.45 |    79.67 |   98.46 |   95.27 |                                           
 src                                            |       0 |      100 |       0 |       0 |                                           
 src/auth                                       |   95.23 |    81.25 |     100 |   94.73 |                                           
 src/customers                                  |   95.65 |    88.23 |     100 |   95.45 |                                           
 src/inventory                                  |   97.14 |    78.94 |     100 |   97.05 |                                           
 src/messaging                                  |   98.14 |    90.19 |     100 |     100 |                                           
 src/observability                              |   85.71 |       75 |     100 |   84.21 |                                           
 src/services                                   |   93.54 |    77.77 |     100 |    93.1 |                                           
 src/shared/validators                          |   94.91 |    79.16 |     100 |     100 |                                           
 src/vehicles                                   |   89.79 |    73.07 |     100 |   89.36 |                                           
 src/work-orders                                |   93.51 |    72.72 |   96.96 |   93.95 |                                           
 src/work-orders/application/use-cases          |     100 |      100 |     100 |     100 |                                           
 src/work-orders/infrastructure/database/prisma |     100 |     62.5 |     100 |     100 |                                           
 src/work-orders/infrastructure/email           |     100 |      100 |     100 |     100 |                                           
------------------------------------------------|---------|----------|---------|---------|-------------------------------------------
Test Suites: 12 passed, 12 total
Tests:       127 passed, 127 total
```

---

## 4. CI/CD, Deploy Automatizado em Kubernetes e Nota sobre AWS Academy

Pipeline: [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) — disparado automaticamente em `push` e `pull_request` na `main` (e `workflow_dispatch`). A `main` é protegida: o merge só acontece via Pull Request com os dois jobs abaixo aprovados.

| Job | O que faz |
|---|---|
| `test-and-quality` | `npm ci` → testes unitários + BDD com cobertura (`npm run test:cov`) → build → análise SonarQube/SonarCloud |
| `build-and-deploy` | build da imagem Docker → cria cluster Kubernetes **Kind** → instala o metrics-server (HPA) → executa [`scripts/deploy-k8s.sh`](./scripts/deploy-k8s.sh) |

O script [`scripts/deploy-k8s.sh`](./scripts/deploy-k8s.sh) faz o deploy completo e **falha o pipeline** se algo não subir:
1. Sobe as dependências próprias do serviço — `k8s/postgres.yaml` (PostgreSQL `os_db`) e `k8s/rabbitmq.yaml` (broker da Saga) — e espera ficarem prontas;
2. Aplica `secret.yaml`, `deployment.yaml`, `service.yaml` e `hpa.yaml`;
3. Espera o `kubectl rollout status` do `os-service` (2 réplicas Ready);
4. Testa os health checks pelo Service: `GET /api/health` e `GET /api/health/ready` (banco **e** RabbitMQ conectados — `"messaging":"connected"`);
5. Imprime as evidências: deployments, pods, services, HPA e logs de conexão com o RabbitMQ.

Para rodar localmente contra qualquer cluster (ex.: Kind): `kind create cluster && docker build -t oficina-os-service:latest . && kind load docker-image oficina-os-service:latest && ./scripts/deploy-k8s.sh`.

**Nota sobre o AWS Academy:** as sessões do laboratório expiram e os créditos são limitados, então — conforme orientação dos professores — o deploy automatizado do pipeline é feito em Kubernetes local (**Kind**) dentro do próprio GitHub Actions, com manifests, script de deploy e evidências de pods/services/health checks nos logs de cada execução. Os mesmos manifestos são aplicáveis no Amazon EKS provisionado pelo Terraform (`/infra` e repositório `tech-challenge-fase3-infra-k8s`); nesse caso o `DATABASE_URL`/`MONGODB_URI` do Secret aponta para o banco gerenciado.

---

## 5. Como Executar

### Localmente (Ecossistema Completo com os 3 Microsserviços)
```bash
docker compose -f docker-compose.fase4.yml up --build
```
- **Swagger OS Service:** `http://localhost:3000/docs`
- **Swagger Billing Service:** `http://localhost:3001/docs`
- **Swagger Execution Service:** `http://localhost:3002/docs`
- **RabbitMQ Management:** `http://localhost:15672` (`guest` / `guest`)
- **Collection Postman:** [`postman-collection-fase4.json`](./postman-collection-fase4.json)

### Testes e Cobertura
```bash
npm ci
DATABASE_URL="postgresql://user:pass@localhost:5432/os_db" npx prisma generate
npm run test:cov
```

### Deploy Kubernetes (Kind / EKS)
Automatizado via GitHub Actions ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)) ou manualmente com o mesmo script do pipeline:
```bash
kind create cluster --name oficina-k8s
docker build -t oficina-os-service:latest . && kind load docker-image oficina-os-service:latest --name oficina-k8s
./scripts/deploy-k8s.sh   # PostgreSQL + RabbitMQ + Deployment/Service/HPA + health checks + evidências
```

### Teste ponta a ponta da Saga (3 microsserviços + RabbitMQ)
Com os 3 serviços no ar (docker compose ou Kubernetes com `kubectl port-forward`), o script [`scripts/saga-e2e.sh`](./scripts/saga-e2e.sh) executa os dois cenários da Saga e valida cada transição de estado:
```bash
OS_URL=http://localhost:3000/api BILLING_URL=http://localhost:3001/api EXECUTION_URL=http://localhost:3002/api ./scripts/saga-e2e.sh
```
```text
==> Cenário 1: fluxo completo de sucesso
   ✔ OS aguardando aprovação: WAITING_APPROVAL
   ✔ Billing gerou orçamento (os.budget.requested): PENDING
   ✔ Orçamento aprovado no Billing: APPROVED
   ✔ OS em execução (payment.approved): IN_EXECUTION
   ✔ OS na fila do MongoDB (os.execution.requested): QUEUED
   ✔ Execução concluída no MongoDB: COMPLETED
   ✔ OS finalizada (execution.finished): FINISHED
==> Cenário 2: pagamento recusado -> compensação
   ✔ Billing gerou orçamento (os.budget.requested): PENDING
   ✔ Orçamento rejeitado no Billing: REJECTED
   ✔ OS cancelada pela compensação (payment.failed): CANCELLED
Saga validada ponta a ponta nos 3 microsserviços.
```
