# RFC-003 — Estratégia de Autenticação (CPF → Serverless → JWT)

- **Status:** Aceita
- **Data:** 2026-09
- **Autores:** Grupo Tech Challenge — FIAP SOAT

## Contexto

As rotas sensíveis da aplicação devem ser protegidas por autenticação. O requisito é específico: a autenticação do cliente ocorre por **CPF**, através de uma **Function Serverless** que valida o CPF, consulta a existência e o status do cliente na base e, se autorizado, emite um **JWT** que passa a ser exigido pelas APIs protegidas.

## Opções consideradas

| Opção | Avaliação |
|---|---|
| **Autenticação por CPF em uma Lambda dedicada, emitindo JWT** (escolhida) | Isola a autenticação; escala de forma independente; separa a responsabilidade da aplicação; atende exatamente ao requisito. |
| Autenticação embutida na própria API (sem serverless) | Não atende ao requisito de Function Serverless; acopla auth ao monólito. |
| Autorizador gerenciado (ex.: Cognito) | Poderoso, mas o requisito pede explicitamente validação por **CPF** e função serverless própria; Cognito adicionaria complexidade sem aderência ao enunciado. |

## Decisão

Implementar uma **AWS Lambda** (`AuthFunction`) exposta pelo API Gateway em `POST /auth`, que:
1. **Valida os dígitos verificadores do CPF**;
2. **Consulta** a tabela `customers` no RDS (existência + `isActive`);
3. Emite um **JWT (HS256)** assinado com um segredo compartilhado com a aplicação.

A aplicação valida o token via `JwtAuthGuard` (estratégia Passport-JWT). O **mesmo `JWT_SECRET`** é usado na Lambda e na aplicação — condição para que o token emitido pela função seja aceito nas rotas protegidas.

## Justificativa

- **Aderência total ao requisito** (CPF + serverless + JWT).
- **Separação de responsabilidades**: a autenticação escala e falha de forma isolada da aplicação.
- **Custo e escalabilidade**: função serverless paga por invocação e escala automaticamente.
- **Simplicidade de verificação**: HS256 com segredo compartilhado permite que qualquer serviço com o segredo valide o token, sem chamada extra ao emissor.

## Consequências

- **Positivas:** fluxo desacoplado, escalável e alinhado ao enunciado.
- **Negativas / mitigações:**
  - O segredo HS256 precisa ser **idêntico** nos dois lados — gerido como variável de ambiente/secret. (Evolução possível: RS256 com par de chaves, evitando compartilhar segredo.)
  - A Lambda acessa um **RDS privado**, exigindo execução **dentro da VPC** com regras de rede corretas (ver **ADR-004** e nota sobre o `egress` do Security Group).
  - Rotação de segredo exige atualizar ambos os componentes.
