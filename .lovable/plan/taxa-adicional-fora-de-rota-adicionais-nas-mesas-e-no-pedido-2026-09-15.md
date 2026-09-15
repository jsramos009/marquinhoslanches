# Taxa adicional fora de rota + adicionais nas mesas e no pedido manual

## 1. Taxa adicional (endereço fora de rota)

No lançamento de pedido manual, quando o modo for **Entrega**, aparece um novo campo ao lado do bairro:
**"Taxa adicional (fora de rota)"** — valor em reais, opcional, começa em 0.

- O resumo lateral passa a mostrar duas linhas: `Frete (bairro)` e `Taxa adicional`.
- O total do pedido soma: itens − desconto + frete + taxa adicional.
- O resumo enviado ao cliente no WhatsApp e a comanda impressa mostram a taxa adicional como linha própria, logo abaixo do frete.
- O valor fica salvo no pedido, então aparece igual na edição do pedido, nos relatórios e no fechamento de caixa.

## 2. Adicionais em todos os produtos

Hoje, no pedido manual, os adicionais só aparecem para produtos da categoria hambúrguer, e só no momento de adicionar o item. Nas mesas, só aparecem para produtos que tenham adicionais vinculados um a um no cadastro.

Mudanças nos dois fluxos (novo pedido manual e mesas):

- Qualquer produto marcado como "aceita adicionais" mostra a lista de adicionais.
- Se o produto não tiver adicionais vinculados no cadastro, mostra todos os adicionais ativos.
- Os adicionais ficam editáveis depois do item já estar no carrinho (marcar/desmarcar direto no resumo), não só no momento de adicionar.
- O preço do item no resumo já soma os adicionais escolhidos, como no cardápio do cliente.

## Detalhes técnicos

- Migração: `ALTER TABLE public.orders ADD COLUMN delivery_extra_fee numeric NOT NULL DEFAULT 0;`
- `src/lib/orders.functions.ts`: aceitar/retornar `delivery_extra_fee` em criar, editar e listar; incluir no cálculo de `total`.
- `src/routes/_authenticated/admin.novo-pedido.tsx`: campo de taxa adicional, linha no resumo, linha no texto do WhatsApp, envio no submit e preload na edição; remover a restrição `hamburgerCategoryIds` e usar `accepts_addons`; painel de adicionais por item no resumo lateral.
- `src/components/admin/DiningTablesPanel.tsx`: fallback para todos os adicionais ativos quando `addon_ids` estiver vazio e produto aceitar adicionais.
- `src/lib/print.functions.ts` e `src/lib/print-domain.ts`: incluir a taxa adicional no bloco de totais.
- Relatórios/caixa que somam `delivery_fee` passam a considerar também a taxa adicional.
