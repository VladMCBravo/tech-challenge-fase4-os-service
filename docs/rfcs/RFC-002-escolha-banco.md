# RFC-002 — Escolha do Banco de Dados

- **Status:** Aceita
- **Data:** 2026-09
- **Autores:** Grupo Tech Challenge — FIAP SOAT

## Contexto

O domínio da oficina é **fortemente relacional**: clientes possuem veículos; ordens de serviço referenciam clientes, veículos, serviços e peças; orçamentos derivam dos itens da OS; o estoque exige controle transacional de movimentações. É necessário um banco **gerenciado**, com integridade referencial, transações ACID e bom desempenho de consultas, além de justificativa formal da escolha.

## Opções consideradas

| Opção | Avaliação |
|---|---|
| **PostgreSQL** | Relacional robusto, ACID, tipos ricos (`Decimal`, `enum`), ótimos índices, amplamente suportado (Prisma, RDS). Gratuito e maduro. |
| **MySQL** | Também relacional e suportado no RDS; tipagem de `enum`/`decimal` menos flexível; ecossistema de extensões menor. |
| **SQL Server** | Excelente, porém licenciamento e custo maiores; excessivo para o escopo. |
| **NoSQL (ex.: DynamoDB/Mongo)** | Inadequado: o domínio depende de relacionamentos e consultas com junções; modelagem relacional é mais natural e íntegra aqui. |

## Decisão

Utilizar **PostgreSQL 14** no **Amazon RDS** (gerenciado, privado na VPC).

## Justificativa

- **Aderência ao domínio relacional**: chaves estrangeiras e integridade referencial garantem consistência entre OS, itens, orçamentos e estoque.
- **Transações ACID**: operações compostas (abrir OS + itens, gerar orçamento, dar baixa no estoque) exigem atomicidade.
- **Tipos adequados**: `Decimal(10,2)` para valores monetários (sem erro de ponto flutuante) e `enum` nativo para status/tipos.
- **Performance**: índices em `status`, `openedAt`, `customerId`, etc., sustentam a fila de OS e os relatórios de tempo médio por etapa (dashboards).
- **Ecossistema**: excelente suporte no **Prisma** (ORM da aplicação) e no **RDS** (backups automáticos, patching, alta disponibilidade opcional Multi-AZ).

Modelo detalhado, relacionamentos e ajustes de consistência/performance em `03-modelo-dados.md`.

## Consequências

- **Positivas:** consistência forte, consultas expressivas, operação gerenciada.
- **Negativas / mitigações:** banco relacional escala verticalmente com mais atrito que soluções NoSQL — mitigado por índices adequados, réplica de leitura (se necessário) e pela característica do workload (transacional, volume moderado). O acesso é **privado** (sem internet), acessível apenas via VPC (EKS e Lambda).
