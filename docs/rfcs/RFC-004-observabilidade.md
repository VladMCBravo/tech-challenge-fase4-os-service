# RFC-004 — Ferramenta de Observabilidade

- **Status:** Aceita
- **Data:** 2026-09
- **Autores:** Grupo Tech Challenge — FIAP SOAT

## Contexto

A aplicação precisa de **monitoramento e observabilidade**: latência das APIs, consumo de CPU/memória do Kubernetes, healthchecks, disponibilidade, falhas no processamento de OS, **logs estruturados (JSON) com correlação** e **dashboards de negócio** (volume diário de OS, tempo médio por etapa, erros de integração), demonstrados no vídeo.

## Opções consideradas

| Opção | Avaliação |
|---|---|
| **Datadog** (escolhida) | APM + logs + métricas + dashboards + alertas numa só plataforma; SDK Node (`dd-trace`) com **injeção automática de `trace_id` nos logs**; integração com Kubernetes; camada gratuita para o escopo acadêmico. |
| **New Relic** | Equivalente em capacidades; boa alternativa; equipe tinha mais familiaridade com Datadog. |
| **Stack open-source (Prometheus + Grafana + Loki + Tempo)** | Poderosa e sem custo de licença, porém exige operar e integrar vários componentes — mais esforço de setup do que o escopo justifica. |

## Decisão

Adotar o **Datadog** como plataforma de observabilidade, com:
- **APM** via `dd-trace` na aplicação NestJS (latência, throughput, erros, traces distribuídos);
- **Logs estruturados em JSON** (`nestjs-pino`) com **correlação por `trace_id`/`span_id`** (injeção automática do `dd-trace`);
- **Métricas de infraestrutura** do cluster (CPU/memória) e **healthchecks/uptime**;
- **Dashboards de negócio**: volume diário de OS, tempo médio nas etapas (diagnóstico, execução, finalização) e falhas de integração.

## Justificativa

- **Plataforma única** cobre APM, logs, métricas e dashboards, reduzindo integração.
- **Correlação nativa** entre logs e traces (`trace_id`), atendendo diretamente ao requisito de acompanhar uma requisição por todos os componentes.
- **Baixo atrito** de instrumentação em Node.js (basta iniciar o `dd-trace` no boot da aplicação).

## Consequências

- **Positivas:** visibilidade ponta a ponta com pouco código; dashboards prontos para o vídeo.
- **Negativas / mitigações:** as métricas de **negócio** (volume de OS, tempo por etapa) não vêm automaticamente do APM — exigem **instrumentação customizada** (métricas/consultas específicas). Detalhes da estratégia de logs e traces em **ADR-003**.
