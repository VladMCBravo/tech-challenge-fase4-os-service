# Documentação de Arquitetura — Tech Challenge FIAP Fase 3

Sistema de Gestão de Oficina Mecânica — arquitetura corporativa em nuvem (AWS).

## Índice

### Diagramas e modelo
- [01 — Diagrama de Componentes e visão de arquitetura](01-arquitetura-componentes.md)
- [02 — Diagramas de Sequência (autenticação por CPF e abertura de OS)](02-diagramas-sequencia.md)
- [03 — Modelo de Dados: ER, relacionamentos e ajustes](03-modelo-dados.md)

### RFCs (análise e justificativa de decisões)
- [RFC-001 — Escolha do Provedor de Nuvem (AWS)](rfcs/RFC-001-escolha-nuvem.md)
- [RFC-002 — Escolha do Banco de Dados (PostgreSQL)](rfcs/RFC-002-escolha-banco.md)
- [RFC-003 — Estratégia de Autenticação (CPF → Serverless → JWT)](rfcs/RFC-003-estrategia-autenticacao.md)
- [RFC-004 — Ferramenta de Observabilidade (Datadog)](rfcs/RFC-004-observabilidade.md)

### ADRs (decisões arquiteturais permanentes)
- [ADR-001 — Padrão de Comunicação e API Gateway](adrs/ADR-001-api-gateway-comunicacao.md)
- [ADR-002 — Estratégia de Escalabilidade (HPA)](adrs/ADR-002-escalabilidade-hpa.md)
- [ADR-003 — Organização de Logs e Traces](adrs/ADR-003-logs-traces.md)
- [ADR-004 — Gerenciamento de Estado do Terraform (S3)](adrs/ADR-004-terraform-state-remoto.md)

## Repositórios da solução

| Repositório | Responsabilidade |
|---|---|
| `tech-challenge-fase3-app` | Aplicação principal (API NestJS no EKS) |
| `tech-challenge-fase3-serverless-auth` | Autenticação por CPF (AWS Lambda) |
| `tech-challenge-fase3-infra-k8s` | EKS + API Gateway (Terraform) |
| `tech-challenge-fase3-infra-db` | RDS PostgreSQL (Terraform) |

> Os diagramas estão em **Mermaid** e renderizam automaticamente no GitHub.
