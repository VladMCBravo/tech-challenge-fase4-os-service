# Diagramas de Sequência

## 1. Fluxo de Autenticação por CPF

Este é o fluxo central da Fase 3. O cliente se autentica pelo **CPF**; uma **Function Serverless** valida o CPF, consulta o cliente no banco e emite um **JWT**; esse token é então usado para consumir as **APIs protegidas**.

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant GW as API Gateway
    participant L as Lambda (AuthFunction)
    participant DB as RDS PostgreSQL
    participant APP as API NestJS (EKS)

    Note over C,APP: Etapa 1 — Autenticação (obter o token)
    C->>GW: POST /auth { cpf }
    GW->>L: Invoca a Lambda
    L->>L: Valida os dígitos do CPF
    alt CPF inválido
        L-->>C: 400 CPF inválido
    else CPF válido
        L->>DB: SELECT ... FROM customers WHERE document = cpf
        alt Cliente não encontrado
            DB-->>L: 0 linhas
            L-->>C: 404 Cliente não encontrado
        else Cliente inativo
            DB-->>L: isActive = false
            L-->>C: 403 Cliente inativo
        else Cliente ativo
            DB-->>L: { id, name, document, isActive }
            L->>L: Gera JWT (HS256) com o segredo compartilhado
            L-->>C: 200 { token }
        end
    end

    Note over C,APP: Etapa 2 — Consumo de API protegida
    C->>GW: GET /api/... (Authorization: Bearer <JWT>)
    GW->>APP: Encaminha requisição
    APP->>APP: JwtAuthGuard valida a assinatura do JWT
    alt Token inválido/ausente
        APP-->>C: 401 Unauthorized
    else Token válido
        APP->>DB: Consulta/persiste dados (Prisma)
        DB-->>APP: Resultado
        APP-->>C: 200 Dados
    end
```

**Pontos-chave de segurança:**
- A Lambda assina o JWT com o **mesmo `JWT_SECRET`** da aplicação; por isso o `JwtAuthGuard` do NestJS aceita o token emitido pela função serverless.
- O RDS é **privado**: tanto a Lambda quanto os pods do EKS o acessam apenas de dentro da VPC.
- O API Gateway é o **único ponto exposto** à internet.

## 2. Fluxo de Abertura de Ordem de Serviço (OS)

Fluxo de negócio principal: um atendente autenticado abre uma OS informando cliente, veículo e serviços. A API valida os dados, persiste a OS e seus itens e retorna a identificação única.

```mermaid
sequenceDiagram
    autonumber
    actor U as Atendente (autenticado)
    participant GW as API Gateway
    participant APP as API NestJS (EKS)
    participant UC as CreateWorkOrderUseCase
    participant DB as RDS PostgreSQL

    U->>GW: POST /api/work-orders (Bearer JWT)\n{ customerId, vehicleId, services[] }
    GW->>APP: Encaminha requisição
    APP->>APP: JwtAuthGuard valida o token
    APP->>APP: ValidationPipe valida o DTO

    APP->>UC: execute(dto)
    UC->>DB: Verifica cliente ativo
    UC->>DB: Verifica veículo do cliente
    alt Cliente/veículo inválidos
        DB-->>UC: não encontrado
        UC-->>U: 400 / 404 (erro de validação)
    else Dados válidos
        UC->>DB: BEGIN (transação)
        UC->>DB: INSERT work_orders (status=RECEIVED, code, openedAt)
        UC->>DB: INSERT work_order_service_items (itens de serviço)
        UC->>DB: COMMIT
        DB-->>UC: OS criada { id, code }
        UC-->>APP: OS { id, code, status }
        APP-->>U: 201 { id, code, status: "RECEIVED" }
    end

    Note over U,DB: O acompanhamento posterior segue o ciclo:\nRECEIVED → IN_DIAGNOSIS → WAITING_APPROVAL → IN_EXECUTION → FINISHED → DELIVERED
```

**Observações:**
- A OS nasce no status `RECEIVED` e evolui pelos status do domínio; as transições registram os carimbos de tempo (`diagnosisStartedAt`, `executionStartedAt`, `finishedAt`, `deliveredAt`) usados nas métricas de **tempo médio por etapa** (dashboards de observabilidade).
- O orçamento (`Budget`) é gerado a partir dos itens de serviço/peças e enviado ao cliente para aprovação, conforme o fluxo das Fases 1 e 2.
