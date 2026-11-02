# language: pt
Funcionalidade: Fluxo Transacional de Ordem de Serviço com Saga Pattern
  Como uma oficina mecânica operando em arquitetura de microsserviços
  Eu quero coordenar o ciclo de vida da Ordem de Serviço via Saga Coreografada
  Para garantir consistência eventual entre OS, Orçamento/Pagamento e Execução, com rollback seguro de estoque em caso de falha

  Cenário: Fluxo completo de sucesso de uma Ordem de Serviço pela Saga
    Dado um cliente ativo "cliente-01" com um veículo "veiculo-01" e uma peça "peca-filtro" com 10 unidades em estoque
    Quando o atendente abre uma nova Ordem de Serviço e inicia o diagnóstico
    E adiciona o serviço "srv-troca-oleo" no valor de 150 e 2 unidades da peça "peca-filtro" no valor unitário de 50
    E move a Ordem de Serviço para aguardando aprovação disparando a Saga
    Então o estoque da peça "peca-filtro" deve ser reservado restando 8 unidades
    E o evento "os.budget.requested" deve ser publicado com valor total de 250
    Quando o evento "payment.approved" é recebido do microsserviço de Billing
    Então a Ordem de Serviço deve mudar para o status "IN_EXECUTION"
    E o evento "os.execution.requested" deve ser publicado para o microsserviço de Execução
    Quando o evento "execution.finished" é recebido do microsserviço de Execução e o veículo é entregue
    Então a Ordem de Serviço deve alcançar o status final "DELIVERED"

  Cenário: Compensação e Rollback da Saga quando o pagamento é recusado
    Dado um cliente ativo "cliente-01" com um veículo "veiculo-01" e uma peça "peca-pastilha" com 5 unidades em estoque
    Quando o atendente abre uma OS, inicia o diagnóstico, adiciona 2 unidades da peça "peca-pastilha" e solicita aprovação
    Então o estoque da peça "peca-pastilha" cai para 3 unidades e a OS fica em "WAITING_APPROVAL"
    Quando o evento "payment.failed" é recebido por recusa no Mercado Pago
    Então a transação compensatória deve estornar 2 unidades para a peça "peca-pastilha" restaurando o estoque para 5
    E um movimento de estoque do tipo "REVERSAL" deve ser registrado
    E a Ordem de Serviço deve mudar para o status "CANCELLED"
