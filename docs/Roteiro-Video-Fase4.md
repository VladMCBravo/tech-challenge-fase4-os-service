# Roteiro do Vídeo — Fase 4 (até 15 minutos)

O vídeo precisa demonstrar (enunciado da Fase 4):
1. Fluxo completo de uma OS passando pelos microsserviços;
2. Execução do Saga Pattern e tratamento de falhas;
3. Deploy automatizado de pelo menos um microsserviço com validação de testes;
4. Monitoramento e rastreamento dos fluxos distribuídos.

> **Ambiente:** por limitação do AWS Academy, e conforme orientação do Prof. Alex Faiotto, a demonstração usa Kubernetes local (**Kind**). O deploy automatizado é feito pelo próprio pipeline do GitHub Actions, que também sobe um cluster Kind.

---

## Checklist antes de gravar (≈ 15 min)

| # | O que | Como |
|---|---|---|
| 1 | Docker Desktop aberto e cluster Kind no ar | `kubectl config use-context kind-oficina-k8s && kubectl get pods` (11 pods `Running`) |
| 2 | Secret do Datadog criado (uma vez só) | `read -s "DD_KEY?API key: " && kubectl create secret generic datadog-secret --from-literal api-key="$DD_KEY" && unset DD_KEY` |
| 3 | Agente do Datadog e port-forwards | `./scripts/demo-k8s.sh` (no repositório os-service) |
| 4 | Gerar dados no Datadog (traces, logs e métricas) | rode `./scripts/saga-e2e.sh` **2 ou 3 vezes** 10 min antes de gravar |
| 5 | Abas no navegador | Swagger `localhost:3000/docs`, `:3001/docs`, `:3002/docs` · RabbitMQ `localhost:15672` (guest/guest) · GitHub dos 3 repositórios · Actions do os-service · SonarCloud · Datadog (APM, Service Map, Logs e dashboard “Oficina Mecânica”) |
| 6 | Terminal com fonte grande | `STEP_DELAY=2 ./scripts/saga-e2e.sh` pronto para rodar |

---

## 00:00 – 01:00 · Abertura e disparo do pipeline
- Apresentação: nome, RM, objetivo da Fase 4.
- **Disparar o pipeline** já no começo, porque ele leva cerca de 6 min: GitHub → os-service → **Actions → CI/CD → Run workflow (main)**. Voltamos a ele no fim.

## 01:00 – 03:00 · Arquitetura e divisão dos microsserviços
- Diagrama geral (PDF de entrega) e os **diagramas de cada README** (componentes + sequência da Saga).
- 3 repositórios independentes, cada um com banco próprio (**database per service**):
  - **os-service** → PostgreSQL `os_db` (OS, clientes, veículos, estoque — integridade ACID na reserva/estorno de peças);
  - **billing-service** → PostgreSQL `billing_db` (orçamento e pagamento — precisão decimal, auditoria) + Mercado Pago (OAuth2 `client_id`/`client_secret` → token; mock aceito pela coordenação);
  - **execution-service** → **MongoDB** `execution_db` (fila de execução como documento agregado com `steps[]`).
- Comunicação: REST síncrono para comandos externos + **RabbitMQ** (exchange topic `oficina.saga`) entre os serviços. Nenhum serviço acessa o banco do outro.
- **Saga coreografada**: cada serviço reage a eventos e publica os seus — sem orquestrador central, sem ponto único de falha. Justificativa no README e no PDF.

## 03:00 – 07:30 · Fluxo completo de uma OS + Saga (ao vivo)
1. Terminal: `kubectl get pods,hpa` → 3 serviços com 2 réplicas, PostgreSQL ×2, MongoDB, RabbitMQ, Datadog Agent.
2. RabbitMQ (`localhost:15672`) → aba **Exchanges** (`oficina.saga`) e **Queues** (uma fila por serviço, 2 consumidores cada).
3. Rodar `STEP_DELAY=2 ./scripts/saga-e2e.sh` e narrar o **Cenário 1**:
   - OS aberta, diagnóstico, serviço + 2 peças;
   - aguardando aprovação → **estoque reservado (10 → 8)** e `os.budget.requested` publicado;
   - Billing consome o evento e gera o orçamento (R$ 250) com token OAuth2 do Mercado Pago;
   - webhook do Mercado Pago **aprovado** → `payment.approved` → OS `IN_EXECUTION`;
   - execution-service coloca a OS na **fila do MongoDB** → mecânico `IN_REPAIR` → `COMPLETED` → `execution.finished` → OS `FINISHED` → `DELIVERED`.
4. (Opcional, se sobrar tempo) mostrar no Swagger do billing `GET /api/budgets/work-order/{id}` com o `paymentUrl` e o QR Code, e no execution `GET /api/executions/queue`.

## 07:30 – 10:00 · Tratamento de falhas e compensação
O mesmo script continua com os rollbacks:
- **Cenário 2 — pagamento recusado:** webhook `rejected` → `payment.failed` → os-service executa a transação compensatória: **estoque devolvido (REVERSAL)** e OS `CANCELLED`.
- **Cenário 3 — falha crítica na execução:** `execution.failed` → billing **estorna o pagamento no Mercado Pago (`REFUNDED`)** e cancela o orçamento; os-service devolve o estoque e cancela a OS.
- Reforçar: cada serviço desfaz apenas a sua parte (compensação local), coordenado por eventos.

## 10:00 – 12:30 · Monitoramento e rastreamento distribuído (Datadog)
- **APM → Service Map**: os-service, billing-service e execution-service ligados pelo RabbitMQ.
- **APM → Traces**: abrir um trace de `POST /api/work-orders/{id}/awaiting-approval` e mostrar o span de publicação no RabbitMQ e o consumo no billing.
- **Logs**: logs em **JSON** com `dd.trace_id` → clicar e ir do log para o trace (correlação).
- **Dashboard “Oficina Mecânica”**: volume de OS, tempo médio por etapa (diagnóstico/execução/finalização), latência, erros e compensações da Saga.

## 12:30 – 14:30 · CI/CD, testes e qualidade
- Voltar ao run disparado no início (**Actions**):
  - `test-and-quality`: testes unitários + **BDD (jest-cucumber, Gherkin)** + **e2e da API**, cobertura mínima de 80%, build e **SonarCloud com Quality Gate**;
  - `build-and-deploy`: imagem Docker → cluster **Kind** → `scripts/deploy-k8s.sh` → rollout das 2 réplicas, **health checks** (`database: up`, `messaging: connected`), pods/services/HPA.
- Proteção da `main`: merge só via **Pull Request** com `test-and-quality` e `build-and-deploy` obrigatórios — mostrar um PR com “All checks have passed” e o comentário do SonarCloud.
- **SonarCloud**: os 3 projetos com Quality Gate aprovado e cobertura (os 87,5% · billing 87,2% · execution 82,9%).

## 14:30 – 15:00 · Encerramento
- Resumo: 3 microsserviços, SQL + NoSQL, mensageria, Saga coreografada com compensação, CI/CD com deploy automatizado em Kubernetes, testes > 80% com BDD, SonarCloud e Datadog.
- Links no PDF de entrega.
