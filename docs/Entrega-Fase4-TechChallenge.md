# PÓS-GRADUAÇÃO EM ARQUITETURA DE SOFTWARE · FIAP (SOAT)
# Tech Challenge — Fase 4
**Sistema de Gestão de Oficina Mecânica — Arquitetura de Microsserviços, Persistência Poliglota e Saga Pattern**

---

## 1. Identificação

| Campo | Informação |
| :--- | :--- |
| **Integrante** | Vladmir Musa Costa Bravo |
| **RM** | 374193 |
| **Discord** | `@vladbravo` |
| **Curso** | Pós-graduação em Arquitetura de Software — FIAP (SOAT) |
| **Entrega** | Fase 4 — Tech Challenge |

---

## 2. Links dos Repositórios e Vídeo de Demonstração

A solução foi decomposta em microsserviços independentes, cada um com seu próprio repositório, infraestrutura como código (`/infra` em Terraform), manifestos Kubernetes (`/k8s`), banco de dados exclusivo, pipelines de CI/CD com validação de testes/qualidade (SonarQube/SonarCloud), `main` protegida por Pull Request e colaborador `soat-architecture`:

| Componente / Microsserviço | Banco de Dados | Infra & K8s Próprios | Repositório GitHub |
| :--- | :--- | :---: | :--- |
| **1. OS Service (Ordem de Serviço, Clientes, Veículos, Estoque)** | **PostgreSQL (SQL)** (`os_db`) | `/infra` + `/k8s` | `https://github.com/VladMCBravo/tech-challenge-fase4-os-service` |
| **2. Billing Service (Orçamento e Pagamento + Mercado Pago OAuth2/PIX)** | **PostgreSQL (SQL)** (`billing_db`) | `/infra` + `/k8s` | `https://github.com/VladMCBravo/tech-challenge-fase4-billing-service` |
| **3. Execution Service (Fila de Execução e Produção)** | **MongoDB (NoSQL)** (`execution_db`) | `/infra` + `/k8s` | `https://github.com/VladMCBravo/tech-challenge-fase4-execution-service` |
| **4. Function Serverless (Autenticação por CPF → JWT)** | — | Terraform | `https://github.com/VladMCBravo/tech-challenge-fase3-serverless-auth` |
| **5. Infraestrutura Kubernetes & API Gateway (Terraform)** | — | Terraform | `https://github.com/VladMCBravo/tech-challenge-fase3-infra-k8s` |
| **6. Infraestrutura Banco de Dados (Terraform)** | — | Terraform | `https://github.com/VladMCBravo/tech-challenge-fase3-infra-db` |

- **Link do Vídeo de Demonstração (até 15 min):** `<INSERIR_LINK_DO_YOUTUBE_AQUI>`

---

## 3. Diagrama Geral da Arquitetura Final

```mermaid
flowchart TB
    subgraph ClientLayer["Camada de Entrada"]
        User["Cliente / Atendente / Mecânico"]
        MP_Ext["Mercado Pago (OAuth2 Token, Checkout PIX & Webhook)"]
    end

    subgraph AWS["AWS Cloud (us-east-1) — Cluster Kubernetes (Amazon EKS / Kind CI)"]
        APIGW["Amazon API Gateway"]
        Lambda["AWS Lambda (Auth CPF -> JWT)"]

        subgraph K8s["Cluster Kubernetes (Pods com HPA + Datadog Agent)"]
            OS["OS Service (NestJS)\nPorta 3000"]
            BIL["Billing Service (NestJS)\nPorta 3001"]
            EXE["Execution Service (NestJS)\nPorta 3002"]
            RMQ(("RabbitMQ Broker\nExchange: oficina.saga"))
        end

        subgraph Databases["Persistência Poliglota Isolada (Database per Service)"]
            DB_OS[("PostgreSQL (SQL)\nos_db")]
            DB_BIL[("PostgreSQL (SQL)\nbilling_db")]
            DB_EXE[("MongoDB (NoSQL)\nexecution_db")]
        end

        DD["Datadog (APM Traces, Logs JSON, Métricas e Alertas)"]
    end

    User --> APIGW
    APIGW -->|"/auth"| Lambda
    APIGW -->|"/work-orders, /customers, /inventory"| OS
    APIGW -->|"/budgets"| BIL
    APIGW -->|"/executions"| EXE
    MP_Ext <-->|"OAuth2 client_id/secret + Checkout PIX + Webhook"| BIL

    OS --> DB_OS
    BIL --> DB_BIL
    EXE --> DB_EXE

    OS <-->|"os.budget.requested\nos.execution.requested"| RMQ
    BIL <-->|"payment.approved\npayment.failed"| RMQ
    EXE <-->|"execution.finished\nexecution.failed"| RMQ

    OS -.-> DD
    BIL -.-> DD
    EXE -.-> DD
```

---

## 4. Justificativa da Divisão dos Microsserviços e Tecnologias Utilizadas

1. **`os-service` (Ordem de Serviço + PostgreSQL SQL):**
   - **Por que separar:** Concentra o domínio cadastral e a abertura/rastreamento da OS, além da reserva de peças em estoque.
   - **Por que SQL (PostgreSQL):** Exige integridade referencial estrita e transações ACID locais na reserva e no estorno de movimentações de estoque (`InventoryItem` + `InventoryMovement` + `WorkOrder`).
2. **`billing-service` (Orçamento e Pagamento + PostgreSQL SQL + Mercado Pago OAuth2/PIX):**
   - **Por que separar:** Isola o contexto financeiro, regras de cobrança, obtenção de token OAuth2 via `client_id` / `client_secret` (`POST /api/budgets/mercadopago/oauth/token`), geração de preferência Checkout Pro / PIX no **Mercado Pago** (com fallback Mock resiliente quando o ambiente de testes externo está indisponível) e recebimento de Webhooks de pagamento.
   - **Por que SQL (PostgreSQL):** Dados financeiros (`budgets` e `payments`) demandam tipagem decimal exata (`Decimal(10,2)`), auditoria transacional e consistência forte.
3. **`execution-service` (Execução e Produção + MongoDB NoSQL):**
   - **Por que separar:** O pátio/chão de oficina possui alta frequência de leituras da fila priorizada e escrita contínua de apontamentos dos mecânicos durante o diagnóstico e o reparo.
   - **Por que NoSQL (MongoDB):** Cada execução é modelada como um documento autocontido (`execution_tasks`) que agrega os itens a executar e a linha do tempo de etapas (`steps[]`), eliminando JOINs e oferecendo alta performance para a fila de produção (`IN_REPAIR > IN_DIAGNOSIS > QUEUED`).

---

## 5. Estratégia Escolhida para o Saga Pattern (Coreografia via RabbitMQ)

Foi adotado o **Saga Pattern Coreografado (Event-Driven Choreography)** utilizando o **RabbitMQ** (`exchange: oficina.saga`, tipo `topic`).

### 5.1 Fluxo de Sucesso (Happy Path)
1. **Abertura e Reserva (`os-service`):** O atendente move a OS diagnosticada para `WAITING_APPROVAL`. O `os-service` reserva o estoque das peças (`DECREASE`) em transação local e publica `os.budget.requested`.
2. **Orçamento, Token OAuth2 e Cobrança (`billing-service`):** Consome `os.budget.requested`, gera o orçamento (`PENDING`), autentica via `client_id` / `client_secret` (`getAccessToken`) e cria a preferência de pagamento/PIX no **Mercado Pago**.
3. **Confirmação de Pagamento (`billing-service` → `os-service` + `execution-service`):** Ao receber confirmação via Webhook do Mercado Pago (`POST /api/budgets/webhook/mercadopago`), o `billing-service` aprova o orçamento/pagamento e publica `payment.approved`.
   - O `os-service` consome `payment.approved`, muda o status da OS para `IN_EXECUTION` e publica `os.execution.requested`.
   - O `execution-service` consome o evento e enfileira a OS no **MongoDB** com status `QUEUED`.
4. **Conclusão (`execution-service` → `os-service`):** Quando o mecânico finaliza o reparo (`PATCH /api/executions/work-order/:id/finish`), o `execution-service` marca `COMPLETED` no MongoDB e publica `execution.finished`. O `os-service` consome o evento e atualiza a OS para `FINISHED`.

### 5.2 Fluxos de Compensação e Rollback (Tratamento de Falhas)
- **Cenário de Falha 1 — Pagamento Recusado no Mercado Pago (`payment.failed`):**
  - O `billing-service` marca o pagamento como `REJECTED` e publica `payment.failed`.
  - **Transação Compensatória (`os-service`):** Consome `payment.failed`, devolve automaticamente a quantidade reservada ao estoque (`InventoryMovementType.REVERSAL`) e altera o status da OS para `CANCELLED`.
- **Cenário de Falha 2 — Impossibilidade Técnica na Execução (`execution.failed`):**
  - O `execution-service` marca a tarefa no MongoDB como `FAILED` e publica `execution.failed`.
  - **Transação Compensatória 1 (`billing-service`):** Consome `execution.failed`, aciona a API de reembolso do Mercado Pago, muda o pagamento para `REFUNDED` e o orçamento para `CANCELLED`.
  - **Transação Compensatória 2 (`os-service`):** Consome `execution.failed`, estorna as peças ao estoque (`REVERSAL`) e altera a OS para `CANCELLED`.

---

## 6. Qualidade, Testes Unitários (`> 80%`), BDD e CI/CD Kubernetes

| Microsserviço | Suítes / Testes | Cobertura (Lines) | BDD / SonarQube / Deploy K8s Automatizado |
| :--- | :---: | :---: | :--- |
| **`os-service`** | 11 suítes / 117 testes | **90,50%** | Fluxo completo + Rollback em Gherkin (`work-order-saga.feature`) + SonarQube + Deploy K8s (Kind/EKS) |
| **`billing-service`** | 1 suíte / 10 testes | **83,68%** | OAuth2 Token (`client_id`/`client_secret`) + Checkout/PIX Mercado Pago + Rollback `REFUNDED` + SonarQube + Deploy K8s |
| **`execution-service`** | 1 suíte / 7 testes | **81,40%** | Fila NoSQL MongoDB + Eventos Saga + Rollback + SonarQube + Deploy K8s |

> **Nota sobre Deploy Automatizado e AWS Academy:** Os workflows `.github/workflows/deploy.yml` dos 3 repositórios executam em `push`, `pull_request` e `workflow_dispatch`, realizando deploy automatizado em cluster Kubernetes via **Kind (`helm/kind-action`)** (com validação de Pods, Services e HPA no próprio pipeline) e no **Amazon EKS** quando as credenciais de sessão do AWS Academy estão ativas.
