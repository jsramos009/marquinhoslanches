## O que muda

### 1. Resumo do WhatsApp (pedido manual)
No formato atual sai:
```
Pedido:
1 - 1x X-BACON-ESPECIAL — R$ 28,00
2 - 1x REFRIGERANTE — R$ 6,00
```
Passa a sair:
```
Pedido:
1x X-BACON-ESPECIAL — R$ 28,00
1x REFRIGERANTE — R$ 6,00
```

### 2. Auto-aceitar pedidos
Hoje todo pedido novo entra como **"Aguardando confirmação"** e você precisa clicar em **"Aceitar"** pra ele virar **"Em produção"**. Vou remover essa etapa: assim que o pedido é criado (pelo cardápio ou lançado manualmente por você), ele já entra direto em **"Em produção"** (Aceito).

Efeitos:
- O botão azul **"→ Aceitar"** some da tela de pedidos e do dashboard — não aparece mais em nenhum lugar porque nunca vai existir pedido no status "recebido".
- Continuam existindo os botões **"→ A caminho"** e **"→ Finalizar"** pra tocar o fluxo.
- O botão **WhatsApp verde** de "saiu pra entrega" continua igual (aparece quando o pedido está em "A caminho / Pronto").
- A coluna "Aguardando confirmação" no kanban fica vazia (histórico antigo preservado). Se você quiser, num próximo passo, posso escondê-la.

## Detalhes técnicos

- **`src/routes/_authenticated/admin.novo-pedido.tsx`** — dentro de `buildCustomerSummary`, remover o prefixo `${idx + 1} - ` da linha do item. Volta a ser só `${quantity}x ${nome} — ${preço}`.
- **`src/lib/orders.functions.ts`** (`createOrder`) e **`src/lib/orders-public.functions.ts`** (`createPublicOrder`) — no `insert` da tabela `orders`, gravar `status: "em_producao"` em vez do default `"recebido"`. O trigger `stamp_order_status` já preenche `confirmed_at` corretamente.
- Nenhuma migração de banco é necessária — o enum já suporta `em_producao`, e os pedidos antigos ficam como estão.
- Nenhuma mudança em `admin.pedidos.tsx` / `admin.dashboard.tsx`: como não vai mais existir pedido com status `recebido`, o botão "Aceitar" simplesmente não é renderizado (já é condicional a `nextStatus === "em_producao"`).

## Fora do escopo
- Envio automático de mensagem no WhatsApp do cliente (isso continua exigindo clique — como conversamos, precisa de API tipo Twilio pra ser 100% automático).
