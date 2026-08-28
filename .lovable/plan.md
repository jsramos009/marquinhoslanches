# Comandas, impressão e lançamento manual

## O que está errado hoje (verificado no código)

- No lançamento manual, a observação de cada lanche **não é salva no banco**: ao enviar o pedido só vão `product_id`, `quantidade` e adicionais. A observação de item é jogada fora e o endereço é grudado no campo geral de observações do pedido (`Observações + "Endereço: ..."` no mesmo texto). Por isso a impressão sai tudo misturado.
- A tabela de itens do pedido não tem campo de observação (as mesas têm; os pedidos não).
- No lançamento manual os adicionais só aparecem para produtos de categoria "hambúrguer" e apenas num diálogo no momento de adicionar — não dá para editar depois, diferente do cardápio do cliente.
- Reimpressão: o job de impressão é criado com chave única e, se já estiver como "impresso" ou "falhou", o botão recusa com mensagem de erro em vez de reimprimir.

## O que será feito

### 1. Separar observações do endereço (banco + telas)
- Nova coluna de observação em cada item do pedido.
- O lançamento manual passa a salvar a observação de cada lanche no item, e o endereço deixa de ser colado nas observações gerais (já existem campos próprios de endereço/bairro).
- Migração para separar dados antigos: extrair a linha "Endereço: ..." das observações gerais para o campo de endereço quando este estiver vazio.
- Edição de pedido volta a carregar a observação de cada item.

### 2. Comanda térmica redetalhada
Novo layout do documento impresso, em blocos claramente separados e com mais negrito/tamanho para impressora térmica:
1. Cabeçalho: Marquinhos Lanches, tipo (COZINHA / COMANDA / RECIBO), referência (pedido ou mesa), data/hora.
2. Bloco CLIENTE / ENTREGA: nome, telefone, bairro, endereço e observação de entrega.
3. Bloco ITENS: cada lanche em negrito, adicionais indentados e "OBS:" do lanche logo abaixo, em negrito.
4. Bloco OBSERVAÇÕES GERAIS do pedido (separado dos itens).
5. Bloco TOTAIS e pagamento (troco / pagamento dividido).
Mesmo layout na versão HTML enviada à impressora e na versão de fallback do navegador.

### 3. Impressão e reimpressão sempre disponíveis
- Botão de impressão passa a permitir **reimprimir**: se o job já estiver impresso ou com falha, ele é reaberto (nova tentativa) em vez de dar erro.
- Correção dos bugs atuais: job travado em "imprimindo" com claim expirado é liberado; falha de QZ não deixa mais o pedido preso; mensagens de erro claras; fallback de impressão pelo navegador continua funcionando.
- Botão "Imprimir/Reimprimir" também nas mesas e na lista de pedidos.

### 4. Lançamento manual e mesas: cards menores + adicionais iguais ao cardápio
- Grade de produtos com cards compactos (mais colunas por linha, imagem menor) no novo pedido e nas mesas.
- Cada produto marcado mostra a quantidade selecionada no próprio card (badge), com + / − direto no card.
- Adicionais disponíveis para **qualquer produto que aceite adicionais** (não só hambúrguer), editáveis depois de adicionado, como no cardápio do cliente — tanto no novo pedido quanto nas mesas.
- Campo de observação por item ao lado dos adicionais, em ambos os fluxos.

## Detalhes técnicos

- Migração: `ALTER TABLE public.order_items ADD COLUMN notes text;` + backfill/limpeza do `orders.notes` para `orders.delivery_address`.
- `src/lib/orders.functions.ts`: aceitar e retornar `notes` por item em criar/editar/listar.
- `src/lib/print.functions.ts`: incluir `notes` do item e campos de cliente/telefone no payload; nova ação de reimpressão (reset do job para `pending` e limpeza de claim vencido).
- `src/lib/print-domain.ts`: reescrita de `thermalHtml` com os blocos acima; `PrintLineItem.notes` já existe.
- `src/components/admin/KitchenTicket.tsx`, `DiningReceipt.tsx`, `ThermalReceipt.tsx`: mesmo agrupamento de blocos.
- `src/routes/_authenticated/admin.novo-pedido.tsx` e `src/components/admin/DiningTablesPanel.tsx`: grade compacta, badge de quantidade, painel de adicionais/observação por item.
