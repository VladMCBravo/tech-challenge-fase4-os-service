# ADR-003 — Organização de Logs e Traces

- **Status:** Aceita
- **Data:** 2026-09

## Contexto

O sistema é distribuído (Gateway, Lambda, aplicação, banco). É preciso **acompanhar uma requisição** ao longo dos componentes, com **logs estruturados** e **correlação** (`correlationId`/`traceId`), além de traces para diagnóstico de latência e erros.

## Decisão

- **Logs estruturados em JSON** com `nestjs-pino` (biblioteca `pino`), um log por linha, legível por máquina.
- **Tracing distribuído** com `dd-trace` (Datadog APM), inicializado como **primeira instrução** do processo (`import './tracer'` antes de tudo), garantindo o auto-instrumento das bibliotecas HTTP/DB.
- **Correlação automática**: o `dd-trace` é configurado com `logInjection: true`, injetando `trace_id`/`span_id` em cada log. Assim, um log e o trace correspondente ficam ligados, permitindo navegar de um erro no log até o trace completo da requisição.
- **Serviço identificado** por `service` e `env` no tracer, para segmentar métricas e traces no Datadog.

## Consequências

- **Positivas:**
  - Rastreabilidade ponta a ponta de uma requisição (log ↔ trace).
  - Logs consultáveis e filtráveis (JSON) no Datadog.
  - Base para os dashboards de latência, erros e disponibilidade.
- **Negativas / mitigações:**
  - A ordem de inicialização importa: o tracer **deve** ser carregado antes dos demais módulos — garantido pela primeira linha do `main.ts`.
  - Métricas de **negócio** (volume de OS, tempo por etapa) exigem instrumentação adicional além do auto-instrumento — tratadas como métricas/consultas customizadas (ver RFC-004).
  - Cuidado para não logar dados sensíveis (ex.: tokens) — usar redação/filtragem quando necessário.
