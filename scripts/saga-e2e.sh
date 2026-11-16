#!/usr/bin/env bash
# Teste ponta a ponta da Saga coreografada passando pelos 3 microsserviços via RabbitMQ.
#
#   Cenário 1 (sucesso):  OS -> os.budget.requested -> Billing gera orçamento
#                         -> webhook Mercado Pago aprovado -> payment.approved
#                         -> OS IN_EXECUTION -> os.execution.requested -> fila no MongoDB
#                         -> execução finalizada -> execution.finished -> OS FINISHED
#   Cenário 2 (rollback): webhook Mercado Pago recusado -> payment.failed
#                         -> OS devolve peças ao estoque (REVERSAL) e fica CANCELLED
#   Cenário 3 (rollback): falha crítica na execução -> execution.failed
#                         -> Billing estorna o pagamento (REFUNDED) e a OS devolve
#                            as peças ao estoque e fica CANCELLED
#
# Cada OS recebe 1 serviço e 2 unidades de uma peça, para evidenciar a reserva
# (DECREASE) e a devolução (REVERSAL) de estoque feitas pela Saga.
#
# Uso (com os serviços expostos localmente, ex.: docker compose ou kubectl port-forward):
#   OS_URL=http://localhost:3000/api BILLING_URL=http://localhost:3001/api \
#   EXECUTION_URL=http://localhost:3002/api JWT_SECRET=... ./scripts/saga-e2e.sh
set -euo pipefail

OS_URL="${OS_URL:-http://localhost:3000/api}"
BILLING_URL="${BILLING_URL:-http://localhost:3001/api}"
EXECUTION_URL="${EXECUTION_URL:-http://localhost:3002/api}"
JWT_SECRET="${JWT_SECRET:-super-secret-jwt-oficina-soat}"

# JWT HS256 de administrador assinado com o mesmo segredo dos serviços
TOKEN="$(JWT_SECRET="$JWT_SECRET" node -e '
const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),now=Math.floor(Date.now()/1000);
const p=b({sub:"saga-e2e",email:"admin@oficina.local",role:"ADMIN",iat:now,exp:now+3600});
const s=c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url");
console.log(h+"."+p+"."+s)')"

api() { # api METHOD URL [JSON]
  curl -fsS -X "$1" "$2" -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' ${3:+-d "$3"}
}
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d);console.log(eval("o"+process.argv[1])??"")})' "$1"; }
wait_for() { # wait_for DESCRIÇÃO COMANDO VALOR_ESPERADO
  for _ in $(seq 1 30); do
    value="$(eval "$2" 2>/dev/null || true)"
    if [[ "$value" == "$3" ]]; then echo "   ✔ $1: $value"; return 0; fi
    sleep 1
  done
  echo "   ✘ $1: esperado '$3', obtido '${value:-<vazio>}'"; return 1
}

new_cpf() { node -e '
const n=Array.from({length:9},()=>Math.floor(Math.random()*10));
const d=(a)=>{const s=a.reduce((t,v,i)=>t+v*(a.length+1-i),0)%11;return s<2?0:11-s};
n.push(d(n));n.push(d(n));console.log(n.join(""))'; }
new_plate() { node -e 'const L="ABCDEFGHJKLMNPRSTUVWXYZ",r=s=>s[Math.floor(Math.random()*s.length)],D="0123456789";console.log(r(L)+r(L)+r(L)+r(D)+r(L)+r(D)+r(D))'; }

STEP_DELAY="${STEP_DELAY:-0}"   # ex.: STEP_DELAY=2 para pausar entre etapas na gravação
pause() { sleep "$STEP_DELAY"; }

setup_catalog() {
  SERVICE_ID="$(api POST "$OS_URL/services" "{\"name\":\"Revisão de freios $RANDOM\",\"basePrice\":150,\"estimatedTimeMinutes\":60}" | json .id)"
  PART_ID="$(api POST "$OS_URL/inventory-items" "{\"code\":\"PAST-$RANDOM$RANDOM\",\"name\":\"Jogo de pastilhas\",\"itemType\":\"PART\",\"unitPrice\":50,\"quantityAvailable\":10}" | json .id)"
  echo "   Catálogo: serviço $SERVICE_ID · peça $PART_ID com 10 unidades em estoque"
}
stock() { api GET "$OS_URL/inventory-items" | json ".find(i=>i.id===\"$PART_ID\").quantityAvailable"; }

open_work_order() {
  local customer vehicle wo
  customer="$(api POST "$OS_URL/customers" "{\"name\":\"Cliente Saga E2E\",\"documentType\":\"CPF\",\"document\":\"$(new_cpf)\",\"email\":\"saga@oficina.local\"}" | json .id)"
  vehicle="$(api POST "$OS_URL/vehicles" "{\"customerId\":\"$customer\",\"plate\":\"$(new_plate)\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2022}" | json .id)"
  wo="$(api POST "$OS_URL/work-orders" "{\"customerId\":\"$customer\",\"vehicleId\":\"$vehicle\",\"initialNotes\":\"Teste E2E da Saga\"}" | json .id)"
  api POST "$OS_URL/work-orders/$wo/diagnosis/start" >/dev/null
  api POST "$OS_URL/work-orders/$wo/service-items" "{\"serviceId\":\"$SERVICE_ID\",\"quantity\":1}" >/dev/null
  api POST "$OS_URL/work-orders/$wo/part-items" "{\"inventoryItemId\":\"$PART_ID\",\"plannedQuantity\":2}" >/dev/null
  echo "$wo"
}
request_approval() { # reserva o estoque e dispara os.budget.requested
  local before; before="$(stock)"
  api POST "$OS_URL/work-orders/$1/awaiting-approval" >/dev/null
  wait_for "OS aguardando aprovação" "os_status $1" "WAITING_APPROVAL"
  wait_for "Estoque reservado (DECREASE de 2 unidades)" "stock" "$((before - 2))"
  wait_for "Billing gerou orçamento via RabbitMQ (os.budget.requested)" "budget_status $1" "PENDING"
  echo "   Total do orçamento: R$ $(api GET "$BILLING_URL/budgets/work-order/$1" | json .totalAmount) (serviço 150 + 2 peças x 50)"
  pause
}
approve_payment() {
  api POST "$BILLING_URL/budgets/webhook/mercadopago" "{\"workOrderId\":\"$1\",\"mercadoPagoId\":\"mp_e2e_$RANDOM\",\"status\":\"approved\"}" >/dev/null
  wait_for "Webhook Mercado Pago aprovado: orçamento APPROVED" "budget_status $1" "APPROVED"
  wait_for "OS em execução (payment.approved)" "os_status $1" "IN_EXECUTION"
  wait_for "OS na fila do MongoDB (os.execution.requested)" "execution_status $1" "QUEUED"
  pause
}
os_status() { api GET "$OS_URL/work-orders/$1" | json .status; }
budget_status() { api GET "$BILLING_URL/budgets/work-order/$1" | json .status; }
execution_status() { api GET "$EXECUTION_URL/executions/work-order/$1" | json .status; }

payment_status() { api GET "$BILLING_URL/budgets/work-order/$1" | json ".payments[0].status"; }

echo "==> Preparação"
setup_catalog

echo "==> Cenário 1: fluxo completo de sucesso"
WO="$(open_work_order)"; echo "   OS criada: $WO"
request_approval "$WO"
approve_payment "$WO"
api PATCH "$EXECUTION_URL/executions/work-order/$WO/progress" '{"stage":"IN_REPAIR","mechanicName":"Carlos","notes":"Troca das pastilhas"}' >/dev/null
wait_for "Mecânico em reparo (MongoDB)" "execution_status $WO" "IN_REPAIR"
api PATCH "$EXECUTION_URL/executions/work-order/$WO/finish" '{"mechanicName":"Carlos","notes":"Reparo concluído"}' >/dev/null
wait_for "Execução concluída no MongoDB" "execution_status $WO" "COMPLETED"
wait_for "OS finalizada (execution.finished)" "os_status $WO" "FINISHED"
api POST "$OS_URL/work-orders/$WO/deliver" >/dev/null
wait_for "Veículo entregue" "os_status $WO" "DELIVERED"
pause

echo "==> Cenário 2: pagamento recusado no Mercado Pago -> compensação"
WO2="$(open_work_order)"; echo "   OS criada: $WO2"
request_approval "$WO2"
BEFORE="$(stock)"
api POST "$BILLING_URL/budgets/webhook/mercadopago" "{\"workOrderId\":\"$WO2\",\"status\":\"rejected\",\"reason\":\"Cartão recusado\"}" >/dev/null
wait_for "Orçamento rejeitado no Billing" "budget_status $WO2" "REJECTED"
wait_for "Estoque devolvido (REVERSAL de 2 unidades)" "stock" "$((BEFORE + 2))"
wait_for "OS cancelada pela compensação (payment.failed)" "os_status $WO2" "CANCELLED"
pause

echo "==> Cenário 3: falha crítica na execução -> estorno do pagamento + compensação"
WO3="$(open_work_order)"; echo "   OS criada: $WO3"
request_approval "$WO3"
approve_payment "$WO3"
BEFORE="$(stock)"
api PATCH "$EXECUTION_URL/executions/work-order/$WO3/fail" '{"mechanicName":"Carlos","reason":"Trinca estrutural irreparável no disco de freio"}' >/dev/null
wait_for "Execução marcada como FAILED no MongoDB" "execution_status $WO3" "FAILED"
wait_for "Pagamento estornado no Mercado Pago (execution.failed)" "payment_status $WO3" "REFUNDED"
wait_for "Orçamento cancelado no Billing" "budget_status $WO3" "CANCELLED"
wait_for "Estoque devolvido (REVERSAL de 2 unidades)" "stock" "$((BEFORE + 2))"
wait_for "OS cancelada pela compensação (execution.failed)" "os_status $WO3" "CANCELLED"

echo "Saga validada ponta a ponta nos 3 microsserviços (sucesso + 2 compensações)."
