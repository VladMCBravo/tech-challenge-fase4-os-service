#!/usr/bin/env bash
# Prepara o ambiente da demonstração (vídeo) no cluster Kubernetes local (Kind),
# com os 3 microsserviços já implantados por scripts/deploy-k8s.sh de cada repositório:
#
#   1. Sobe o Datadog Agent (APM, logs JSON e DogStatsD) — requer o secret
#      "datadog-secret" com a API key (ver instrução abaixo)
#   2. Abre os port-forwards dos serviços e do painel do RabbitMQ
#   3. Mostra o estado do cluster e os endereços para a gravação
#
# Criar o secret sem expor a chave no histórico do terminal (zsh):
#   read -s "DD_KEY?API key: " && kubectl create secret generic datadog-secret \
#     --from-literal api-key="$DD_KEY" && unset DD_KEY
#
# Encerrar os port-forwards: ./scripts/demo-k8s.sh stop
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER_NAME="${DD_CLUSTER_NAME:-oficina-k8s-kind}"
PORTS=("os-service:3000" "billing-service:3001" "execution-service:3002")

if [[ "${1:-}" == "stop" ]]; then
  pkill -f "kubectl port-forward svc/" && echo "Port-forwards encerrados." || echo "Nenhum port-forward ativo."
  exit 0
fi

echo "==> Contexto Kubernetes: $(kubectl config current-context)"

echo "==> [1/3] Datadog Agent"
if kubectl get secret datadog-secret >/dev/null 2>&1; then
  sed "s|value: \"oficina-eks-cluster-v2\"|value: \"${CLUSTER_NAME}\"|" k8s/datadog-agent.yaml | kubectl apply -f -
  kubectl rollout status daemonset/datadog-agent --timeout=180s
  # Reinicia os serviços para o tracer (dd-trace) conectar ao agente recém-criado
  kubectl rollout restart deployment/os-service deployment/billing-service deployment/execution-service
  for d in os-service billing-service execution-service; do
    kubectl rollout status "deployment/$d" --timeout=240s
  done
else
  echo "   AVISO: secret 'datadog-secret' não encontrado — Datadog Agent não foi instalado."
fi

echo "==> [2/3] Port-forwards"
pkill -f "kubectl port-forward svc/" 2>/dev/null || true
for entry in "${PORTS[@]}"; do
  svc="${entry%%:*}"; port="${entry##*:}"
  nohup kubectl port-forward "svc/${svc}" "${port}:80" >/dev/null 2>&1 &
done
nohup kubectl port-forward svc/rabbitmq-service 15672:15672 >/dev/null 2>&1 &
sleep 3
for entry in "${PORTS[@]}"; do
  svc="${entry%%:*}"; port="${entry##*:}"
  status="$(curl -fsS "http://localhost:${port}/api/health/ready" 2>/dev/null || echo 'sem resposta')"
  echo "   ${svc} -> http://localhost:${port}/docs  | ready: ${status}"
done
echo "   RabbitMQ  -> http://localhost:15672 (guest / guest)"

echo "==> [3/3] Estado do cluster"
kubectl get pods,hpa -o wide
cat <<'EOF'

Pronto para gravar:
  • Saga ponta a ponta (3 cenários): STEP_DELAY=2 ./scripts/saga-e2e.sh
  • Datadog: APM > Traces / Service Map (os-service, billing-service, execution-service)
  • Encerrar port-forwards ao final: ./scripts/demo-k8s.sh stop
EOF
