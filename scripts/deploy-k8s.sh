#!/usr/bin/env bash
# Deploy automatizado do microsserviço em Kubernetes + evidências.
# Executado pelo pipeline (.github/workflows/deploy.yml) em um cluster Kind e
# também pode ser rodado localmente contra qualquer cluster (kubectl context atual).
#
# Etapas:
#   1. Sobe as dependências do serviço (banco próprio + RabbitMQ) e espera ficarem prontas
#   2. Aplica Secret, Deployment, Service e HPA
#   3. Espera o rollout (falha o pipeline se os pods não ficarem Ready)
#   4. Testa os health checks (liveness/readiness + conexão com o RabbitMQ)
#   5. Imprime as evidências (deployments, pods, services, HPA, logs da Saga)
#
# Variáveis opcionais:
#   IMAGE       imagem a usar no Deployment (padrão: imagem local carregada no Kind)
#   LOCAL_PORT  porta local do port-forward (padrão: 18080)
set -euo pipefail

# --- Configuração do microsserviço ---------------------------------------
SERVICE="os-service"
ECR_IMAGE="538889416411.dkr.ecr.us-east-1.amazonaws.com/oficina-os-service:latest"
DEPENDENCY_MANIFESTS=("k8s/postgres.yaml" "k8s/rabbitmq.yaml")
DEPENDENCY_DEPLOYMENTS=("os-postgres" "rabbitmq")
# -------------------------------------------------------------------------

IMAGE="${IMAGE:-oficina-${SERVICE}:latest}"
LOCAL_PORT="${LOCAL_PORT:-18080}"
cd "$(dirname "$0")/.."

dump_diagnostics() {
  echo "::group::Diagnóstico de falha"
  kubectl get all -o wide || true
  kubectl describe pods -l "app=${SERVICE}" || true
  kubectl logs -l "app=${SERVICE}" --all-containers --tail=100 --prefix || true
  echo "::endgroup::"
}
trap 'dump_diagnostics' ERR

echo "==> [1/5] Dependências do ${SERVICE} (banco próprio + RabbitMQ)"
for manifest in "${DEPENDENCY_MANIFESTS[@]}"; do
  kubectl apply -f "$manifest"
done
for deployment in "${DEPENDENCY_DEPLOYMENTS[@]}"; do
  kubectl rollout status "deployment/${deployment}" --timeout=240s
done

echo "==> [2/5] Secret, Deployment, Service e HPA (imagem: ${IMAGE})"
kubectl apply -f k8s/secret.yaml
sed -e "s|${ECR_IMAGE}|${IMAGE}|g" \
    -e 's|imagePullPolicy: Always|imagePullPolicy: IfNotPresent|g' \
    k8s/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

echo "==> [3/5] Aguardando rollout do ${SERVICE}"
kubectl rollout status "deployment/${SERVICE}" --timeout=300s

echo "==> [4/5] Health checks via Service ${SERVICE}"
kubectl port-forward "svc/${SERVICE}" "${LOCAL_PORT}:80" >/dev/null 2>&1 &
PF_PID=$!
trap 'kill ${PF_PID} 2>/dev/null || true' EXIT

check() {
  local path="$1" expected="$2"
  for _ in $(seq 1 30); do
    if body="$(curl -fsS "http://localhost:${LOCAL_PORT}${path}" 2>/dev/null)" \
      && grep -q "$expected" <<<"$body"; then
      echo "   GET ${path} -> ${body}"
      return 0
    fi
    sleep 2
  done
  echo "   GET ${path} falhou (esperado: ${expected}). Última resposta: ${body:-<sem resposta>}"
  return 1
}
check /api/health '"status":"ok"'
check /api/health/ready '"messaging":"connected"'

echo "==> [5/5] Evidências do deploy"
kubectl get deployments,pods,svc,hpa -o wide
echo "--- Logs de conexão com RabbitMQ / banco"
kubectl logs -l "app=${SERVICE}" -c api --tail=200 --prefix \
  | grep -Ei "rabbitmq|consumindo|mongodb|nest application successfully started" || true

echo "Deploy do ${SERVICE} concluído com sucesso."
