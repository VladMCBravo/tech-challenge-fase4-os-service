# RFC-001 — Escolha do Provedor de Nuvem

- **Status:** Aceita
- **Data:** 2026-09
- **Autores:** Grupo Tech Challenge — FIAP SOAT

## Contexto

A Fase 3 exige provisionar, em nuvem, um conjunto de componentes gerenciados: **API Gateway**, **Function Serverless**, **banco de dados gerenciado**, **cluster Kubernetes com escalabilidade** e **provisionamento por Terraform**. A escolha do provedor é livre, mas precisa atender a todos esses requisitos de forma integrada e com automação de deploy.

## Opções consideradas

| Provedor | Prós | Contras |
|---|---|---|
| **AWS** | Ecossistema maduro e integrado (EKS, RDS, Lambda, API Gateway, ECR); ampla documentação; suportado pelo **AWS Academy Learner Lab** disponibilizado no curso; forte suporte do Terraform (provider `aws`). | Curva de permissões do Learner Lab (role fixa `LabRole`, credenciais temporárias). |
| **Google Cloud** | GKE muito bom; boa experiência de Kubernetes. | Menos aderência ao ambiente/credenciais fornecidos pelo curso. |
| **Azure** | AKS + Azure Functions competentes; boa integração com DevOps. | Idem — sem o laboratório fornecido, aumentaria o atrito de setup. |

## Decisão

Adotar a **AWS** como provedor, usando os serviços gerenciados: **Amazon EKS** (Kubernetes), **Amazon RDS** (PostgreSQL), **AWS Lambda** (autenticação serverless), **Amazon API Gateway** (roteamento), **Amazon ECR** (registro de imagens), tudo provisionado com **Terraform**.

## Justificativa

- **Cobertura completa dos requisitos** com serviços de primeira linha e integrados entre si.
- **Ambiente disponibilizado pelo curso** (AWS Academy), reduzindo custo e atrito de acesso.
- **Terraform** possui o provider AWS mais maduro do mercado, essencial para o requisito de IaC.
- Experiência prévia do grupo com o ecossistema AWS nas fases anteriores.

## Consequências

- **Positivas:** integração nativa entre os componentes; um único provider Terraform; menor esforço de operação.
- **Negativas / mitigações:** o **Learner Lab** usa credenciais temporárias (renovadas a cada sessão) e a role `LabRole` — mitigado documentando o fluxo de atualização de segredos no CI e fixando a role nos recursos. Recursos como o endpoint do Load Balancer podem mudar entre sessões — mitigado por documentação e automação.
