# ADR-002 — Estratégia de Escalabilidade (HPA + Node Group)

- **Status:** Aceita
- **Data:** 2026-09

## Contexto

Com o crescimento da base de clientes e a expansão para múltiplas unidades, a aplicação precisa de **escalabilidade** e **alta disponibilidade**, absorvendo picos de carga (ex.: muitas ordens de serviço simultâneas) sem intervenção manual.

## Decisão

Escalabilidade em **duas camadas** no Amazon EKS:

1. **Horizontal Pod Autoscaler (HPA)** na aplicação:
   - `minReplicas: 2`, `maxReplicas: 5`;
   - métrica de **CPU** com alvo de **70%** de utilização;
   - baseado nos `requests/limits` definidos no Deployment.
2. **Node Group** do EKS com capacidade elástica, permitindo o cluster acomodar novas réplicas.

A aplicação nasce com **2 réplicas** (alta disponibilidade mínima) e escala até 5 conforme a carga de CPU.

## Consequências

- **Positivas:**
  - Absorção automática de picos; sem downtime para escalar.
  - Alta disponibilidade por padrão (≥2 réplicas em execução).
- **Negativas / mitigações:**
  - O HPA por CPU depende do **metrics-server** ativo no cluster — requisito operacional documentado.
  - Definir `requests/limits` corretos é essencial para o HPA funcionar bem — valores calibrados no Deployment.
  - Evolução possível: escalar também por memória ou por métricas customizadas (ex.: profundidade da fila de OS).
