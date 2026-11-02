# ADR-004 — Gerenciamento de Estado do Terraform (State Remoto no S3)

- **Status:** Aceita
- **Data:** 2026-09

## Contexto

Os repositórios de infraestrutura (`infra-k8s` e `infra-db`) provisionam recursos via Terraform em pipelines de CI/CD. Sem um **state remoto**, cada execução do pipeline começa com estado vazio (o state local é efêmero no runner) e o Terraform **tenta recriar** recursos que já existem — resultando em erros como `DBSubnetGroupAlreadyExists`/`InvalidGroup.Duplicate` e até em recursos duplicados (ex.: múltiplas VPCs com o mesmo nome).

## Decisão

Adotar **state remoto no Amazon S3** para os repositórios de infraestrutura:

- Bucket S3 dedicado ao state (`backend "s3"`), com uma `key` por componente (ex.: `infra-db/terraform.tfstate`).
- Para os recursos que **já existiam** (criados manualmente antes do state remoto), fazer **`terraform import`** uma vez, trazendo-os para o state — tornando o `apply` **idempotente** (sem tentar recriar).
- Busca de recursos existentes (VPC/subnets) fixada por **ID** quando o filtro por tag se torna ambíguo (efeito colateral de execuções anteriores sem state).

## Consequências

- **Positivas:**
  - `plan`/`apply` idempotentes e reproduzíveis; pipeline de infraestrutura estável e verde.
  - Estado compartilhado e versionado, base para colaboração.
  - Elimina a criação de recursos duplicados.
- **Negativas / mitigações:**
  - O bucket de state precisa existir **antes** do primeiro `init` (passo único de bootstrap).
  - Sem *state locking* (DynamoDB), execuções concorrentes poderiam colidir — aceitável no contexto acadêmico (uso individual); evolução: adicionar tabela de lock.
  - No AWS Academy, o `id` da conta pode mudar em reset — o nome do bucket e IDs fixados precisam ser revisados nesse caso (documentado no README do `infra-db`).
