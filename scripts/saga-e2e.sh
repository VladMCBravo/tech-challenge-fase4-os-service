#!/usr/bin/env bash
# Teste ponta a ponta da Saga coreografada passando pelos 3 microsserviços via RabbitMQ.
#
#   Cenário 1 (sucesso):  OS -> os.budget.requested -> Billing gera orçamento
#                         -> webhook Mercado Pago aprovado -> payment.approved
#                         -> OS IN_EXECUTION -> os.execution.requested -> fila no MongoDB
#                         -> execução finalizada -> execution.finished -> OS FINISHED
#   Cenário 2 (rollback): webhook Mercado Pago recusado -> payment.failed
#                         -> OS devolve peças ao estoque e fica CANCELLED
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

open_work_order() {
  local customer vehicle
  customer="$(api POST "$OS_URL/customers" "{\"name\":\"Cliente Saga E2E\",\"documentType\":\"CPF\",\"document\":\"$(new_cpf)\",\"email\":\"saga@oficina.local\"}" | json .id)"
  vehicle="$(api POST "$OS_URL/vehicles" "{\"customerId\":\"$customer\",\"plate\":\"$(new_plate)\",\"brand\":\"Fiat\",\"model\":\"Argo\",\"year\":2022}" | json .id)"
  api POST "$OS_URL/work-orders" "{\"customerId\":\"$customer\",\"vehicleId\":\"$vehicle\",\"initialNotes\":\"Teste E2E da Saga\"}" | json .id
}
os_status() { api GET "$OS_URL/work-orders/$1" | json .status; }
budget_status() { api GET "$BILLING_URL/budgets/work-order/$1" | json .status; }
execution_status() { api GET "$EXECUTION_URL/executions/work-order/$1" | json .status; }

echo "==> Cenário 1: fluxo completo de sucesso"
WO="$(open_work_order)"; echo "   OS criada: $WO"
api POST "$OS_URL/work-orders/$WO/diagnosis/start" >/dev/null
api POST "$OS_URL/work-orders/$WO/awaiting-approval" >/dev/null
wait_for "OS aguardando aprovação" "os_status $WO" "WAITING_APPROVAL"
wait_for "Billing gerou orçamento (os.budget.requested)" "budget_status $WO" "PENDING"
api POST "$BILLING_URL/budgets/webhook/mercadopago" "{\"workOrderId\":\"$WO\",\"mercadoPagoId\":\"mp_e2e_$RANDOM\",\"status\":\"approved\"}" >/dev/null
wait_for "Orçamento aprovado no Billing" "budget_status $WO" "APPROVED"
wait_for "OS em execução (payment.approved)" "os_status $WO" "IN_EXECUTION"
wait_for "OS na fila do MongoDB (os.execution.requested)" "execution_status $WO" "QUEUED"
api PATCH "$EXECUTION_URL/executions/work-order/$WO/finish" '{"mechanicName":"Carlos","notes":"Reparo concluído"}' >/dev/null
wait_for "Execução concluída no MongoDB" "execution_status $WO" "COMPLETED"
wait_for "OS finalizada (execution.finished)" "os_status $WO" "FINISHED"

echo "==> Cenário 2: pagamento recusado -> compensação"
WO2="$(open_work_order)"; echo "   OS criada: $WO2"
api POST "$OS_URL/work-orders/$WO2/diagnosis/start" >/dev/null
api POST "$OS_URL/work-orders/$WO2/awaiting-approval" >/dev/null
wait_for "Billing gerou orçamento (os.budget.requested)" "budget_status $WO2" "PENDING"
api POST "$BILLING_URL/budgets/webhook/mercadopago" "{\"workOrderId\":\"$WO2\",\"status\":\"rejected\",\"reason\":\"Cartão recusado\"}" >/dev/null
wait_for "Orçamento rejeitado no Billing" "budget_status $WO2" "REJECTED"
wait_for "OS cancelada pela compensação (payment.failed)" "os_status $WO2" "CANCELLED"

echo "Saga validada ponta a ponta nos 3 microsserviços."
