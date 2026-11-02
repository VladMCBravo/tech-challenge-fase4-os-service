# ADR-001 — Padrão de Comunicação e API Gateway como Entrada Única

- **Status:** Aceita
- **Data:** 2026-09

## Contexto

A solução é composta por múltiplos componentes (aplicação no EKS e função serverless de autenticação) e precisa expor as APIs de forma segura e controlada, com um ponto de roteamento e proteção das rotas sensíveis.

## Decisão

Adotar comunicação **síncrona sobre HTTP/REST** com um **API Gateway (Amazon API Gateway — HTTP API)** como **ponto de entrada único**:

- `POST /auth` → integração com a **Lambda** de autenticação (`AWS_PROXY`);
- `ANY /{proxy+}` → integração **HTTP_PROXY** com o Load Balancer da aplicação no EKS.

A aplicação **não é exposta diretamente** à internet; todo o tráfego externo passa pelo Gateway. A autorização é feita por **JWT** validado na própria aplicação (`JwtAuthGuard`).

## Consequências

- **Positivas:**
  - Um único endpoint público, reduzindo a superfície de ataque.
  - Roteamento centralizado (auth vs. aplicação) e desacoplamento entre serverless e EKS.
  - Comunicação REST simples de consumir, testar (Swagger/Postman) e demonstrar.
- **Negativas / mitigações:**
  - A integração `HTTP_PROXY` aponta para o endereço do Load Balancer do EKS, que **pode mudar** (recriação do Service/ambiente) — mitigado por documentação e possibilidade de automatizar a atualização da integração.
  - Comunicação síncrona acopla a disponibilidade dos serviços no tempo da requisição — aceitável para o escopo; evolução futura poderia usar mensageria para fluxos assíncronos (ex.: notificações).
