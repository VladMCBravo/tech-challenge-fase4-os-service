# Roteiro do Vídeo de Demonstração — Fase 4 (Até 15 minutos)

Este roteiro cobre exatamente os 4 tópicos exigidos no PDF da Fase 4 para o vídeo de demonstração, além das orientações do **Prof. Alex Faiotto** e do **Coordenador Maurício Romão**.

---

## Bloco 1 — Visão Geral da Arquitetura, Isolamento e Repositórios (00:00 – 02:30)
1. Mostrar o diagrama do arquivo `docs/Entrega-Fase4-TechChallenge.md` (ou do PDF `Entrega-Fase4-TechChallenge.pdf`).
2. Explicar a divisão em **3 repositórios independentes**, cada um com sua pasta `/infra` (Terraform), `/k8s` (Manifestos Kubernetes) e banco exclusivo:
   - `tech-challenge-fase4-os-service` (**PostgreSQL** `os_db`)
   - `tech-challenge-fase4-billing-service` (**PostgreSQL** `billing_db` + integração **Mercado Pago OAuth2 + Checkout/PIX**)
   - `tech-challenge-fase4-execution-service` (**MongoDB NoSQL** `execution_db`)
3. Destacar que **nenhum microsserviço acessa o banco do outro** e que a comunicação assíncrona ocorre via **RabbitMQ** (`exchange: oficina.saga`).

---

## Bloco 2 — Fluxo Completo de uma OS passando pelos 3 Microsserviços + Token Mercado Pago (02:30 – 06:30)
1. No Swagger/Postman do **OS Service (`:3000`)**:
   - Criar uma Ordem de Serviço (`POST /api/work-orders`), iniciar diagnóstico (`POST /api/work-orders/:id/diagnosis/start`), adicionar serviço e peça.
   - Chamar `POST /api/work-orders/:id/awaiting-approval`: mostrar que o estoque da peça foi reservado (`DECREASE`) e o evento `os.budget.requested` foi publicado no RabbitMQ.
2. No Swagger/Postman do **Billing Service (`:3001`)**:
   - Demonstrar a obtenção do token OAuth2 do Mercado Pago via `client_id` e `client_secret` (`POST /api/budgets/mercadopago/oauth/token` — item `2.0` da Collection Postman).
   - Consultar `GET /api/budgets/work-order/:workOrderId`: mostrar que o orçamento foi gerado automaticamente com o `paymentUrl` e `qrCode` do **Mercado Pago**.
   - Simular o Webhook do Mercado Pago (`POST /api/budgets/webhook/mercadopago` com `"status": "approved"`): mostrar que o pagamento muda para `APPROVED` e o evento `payment.approved` é emitido.
3. No Swagger/Postman do **Execution Service (`:3002` — MongoDB NoSQL)**:
   - Consultar `GET /api/executions/queue`: mostrar que a OS entrou automaticamente na fila NoSQL no MongoDB.
   - Atualizar o progresso (`PATCH /api/executions/work-order/:workOrderId/progress`) e finalizar o reparo (`PATCH /api/executions/work-order/:workOrderId/finish`), disparando `execution.finished`.
4. Voltar ao **OS Service (`:3000`)**:
   - Consultar a OS (`GET /api/work-orders/:id`) e mostrar que o status mudou automaticamente para `FINISHED` e registrar a entrega (`POST /api/work-orders/:id/deliver` → `DELIVERED`).

---

## Bloco 3 — Execução do Saga Pattern e Tratamento de Falhas / Rollback (06:30 – 10:00)
1. **Demonstração de Rollback 1 (Falha no Pagamento Mercado Pago):**
   - Abrir uma segunda OS com 2 unidades de uma peça em estoque e enviar para `awaiting-approval` (mostrar o estoque caindo).
   - No **Billing Service**, acionar o Webhook do Mercado Pago com `"status": "rejected"` (`POST /api/budgets/webhook/mercadopago`).
   - Mostrar nos logs e no `GET /api/work-orders/:id` que o `os-service` consumiu `payment.failed`, **estornou as 2 unidades ao estoque (`REVERSAL`)** e mudou a OS para `CANCELLED`.
2. **Demonstração de Rollback 2 (Falha na Execução da Oficina):**
   - Em uma OS em execução no **Execution Service**, chamar `PATCH /api/executions/work-order/:workOrderId/fail` informando uma falha técnica.
   - Mostrar que o `billing-service` estornou o pagamento no Mercado Pago (`status: REFUNDED`) e o `os-service` estornou o estoque e cancelou a OS (`status: CANCELLED`).

---

## Bloco 4 — CI/CD Automatizado com Deploy K8s (Kind/EKS), Testes (>80% + BDD), SonarQube e Datadog (10:00 – 14:00)
1. Mostrar no terminal/GitHub Actions a execução dos testes (`npm run test:cov`) nos 3 repositórios:
   - `os-service`: **90,50%** de cobertura + cenários **BDD Gherkin** (`work-order-saga.feature`).
   - `billing-service`: **83,68%** de cobertura (incluindo fluxo OAuth2 `client_id`/`client_secret` + Checkout/PIX + Rollback).
   - `execution-service`: **81,40%** de cobertura.
2. Mostrar na aba **Actions** do GitHub a pipeline `.github/workflows/deploy.yml` (com suporte a `push`, `pull_request` e `workflow_dispatch`) executando Build, Testes, SonarQube e o job `deploy-k8s` subindo o cluster Kubernetes automatizado (`Kind` / `EKS`), aplicando os manifestos `/k8s` e exibindo os Pods, Services e HPA ativos, além da regra de proteção da branch `main`.
3. Mostrar no **Datadog** (ou logs JSON estruturados com `trace_id` e métricas `oficina.*`) o rastreamento distribuído dos fluxos e o contador de compensações da Saga (`oficina.errors{type:saga_compensation}`).
