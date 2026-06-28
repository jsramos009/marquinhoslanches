## Resumo

Como o pedido vai ser lançado manualmente no painel (e a conversão de cliente acontece fora, via WhatsApp), o "funil de conversão" dentro do sistema vira **funil de status do pedido** (recebido → em produção → pronto → entregue/cancelado). Isso é o que de fato dá pra medir aqui.

## 1. Banco de dados (1 migração)

Tabelas novas em `public`:

- **`orders`** — um pedido
  - `customer_name` (texto livre, opcional)
  - `channel` enum: `whatsapp` | `balcao` | `telefone` | `outro` (default `whatsapp`)
  - `status` enum: `recebido` | `em_producao` | `pronto` | `entregue` | `cancelado`
  - `subtotal`, `discount`, `total` (numeric, calculados no servidor ao salvar)
  - `notes` (texto)
  - `created_by` (uuid → auth.users — quem lançou)
  - `confirmed_at`, `ready_at`, `delivered_at`, `cancelled_at` (preenchidos quando o status muda)

- **`order_items`** — uma linha do pedido
  - `order_id`, `product_id`, `product_name_snapshot`, `unit_price_snapshot`, `quantity`, `line_total`

- **`order_item_addons`** — adicionais por item
  - `order_item_id`, `addon_id`, `addon_name_snapshot`, `unit_price_snapshot`, `quantity`

Snapshots de nome/preço para que renomear ou reprecificar um produto não distorça o histórico.

Índices: `orders(created_at desc)`, `orders(status)`, `order_items(product_id)`.

RLS: tudo restrito a `has_role(auth.uid(), 'admin')` OR `has_role(auth.uid(), 'staff')` — leitura e escrita. Sem acesso anônimo. GRANTs corretos em cada tabela.

Trigger: `updated_at` automático; gatilho que carimba `confirmed_at/ready_at/delivered_at/cancelled_at` quando `status` muda.

## 2. Server functions (`src/lib/orders.functions.ts`)

Tudo com `requireSupabaseAuth` + checagem de staff/admin:

- `createOrder({ customer_name, channel, items: [{ product_id, quantity, addons: [{ addon_id, quantity }] }], discount, notes })` — calcula totais no servidor a partir do preço atual do produto/adicional, insere `orders` + `order_items` + `order_item_addons`.
- `updateOrderStatus({ order_id, status })`
- `cancelOrder({ order_id, reason })`
- `listTodayOrders()` — pedidos do dia, ordenados.
- `getDashboardMetrics({ range: 'today' | '7d' | '30d' | 'mtd' })` — retorna:
  - faturamento total, ticket médio, nº de pedidos
  - série diária (para gráfico de linha) + variação % vs período anterior equivalente
  - top 10 produtos por receita e por quantidade
  - produtos sem venda no período (com cadastro ativo)
  - contagem por status (funil)
  - tempo médio entre `created_at` → `ready_at` e `ready_at` → `delivered_at`

Todos os agregados em SQL (uma função RPC `dashboard_metrics(range)` em Postgres) para evitar puxar linhas cruas pro Worker.

## 3. Telas

### `/admin/pedidos` (substitui o placeholder atual)
- Header com botão "Novo pedido" + filtros (status, canal, data).
- Lista em cards/colunas estilo kanban por status (`recebido` | `em_producao` | `pronto` | `entregue`); cancelados numa aba separada.
- Cada card: cliente, itens resumidos, total, tempo desde criação. Botões para avançar status.
- Realtime: revalida via `router.invalidate()` a cada 30s (sem websocket por enquanto).

### `/admin/pedidos/novo` (drawer ou rota dedicada)
- Form: cliente, canal, busca de produto (com adicionais quando aplicável), quantidade, desconto, observação.
- Mostra subtotal/total ao vivo.
- Submete `createOrder`.

### `/admin/dashboard` (nova rota, vira a home do admin)
Blocos:
1. **KPIs** (4 cards): faturamento, ticket médio, nº pedidos, variação % vs período anterior.
2. **Gráfico de linha** — faturamento por dia no range selecionado (Recharts).
3. **Operacional do dia** — contagem por status + tempo médio de preparo.
4. **Funil de status** — barras horizontais: recebido → em_producao → pronto → entregue, com % de drop pra cancelado.
5. **Top produtos** — tabela top 10 por receita (toggle: receita | quantidade).
6. **Produtos parados** — lista de produtos ativos sem venda no período.

Seletor de range no topo (hoje / 7d / 30d / mês corrente).

### Navegação
Sidebar admin minimal com: Dashboard · Pedidos · Cardápio (placeholder) · Acessos. Staff vê Dashboard + Pedidos. Admin vê tudo.

## 4. Detalhes técnicos

- Recharts com tokens do design system (`hsl(var(--primary))` etc.), sem cores hardcoded.
- TanStack Query: `ensureQueryData` no loader, `useSuspenseQuery` no componente.
- Agregação no banco via função SQL (`dashboard_metrics`) — não puxa linhas cruas pro app.
- Status muda só pra frente por padrão; admin pode reabrir cancelados (botão secundário).
- Cancelamento exige motivo (texto).
- Sem notificação por e-mail/WhatsApp nesta fase.

## 5. Fora de escopo (próxima etapa, se quiser)

- Integração WhatsApp Business (receber pedido automaticamente).
- Custos/margem por produto (já existe coluna `cost` em `products`, mas não vou plotar margem agora).
- Exportação CSV/PDF do dashboard.
- Histórico de mudança de status por usuário (audit log).
- Realtime via Supabase channels (hoje é polling 30s).

Confirma que posso seguir? Se quiser cortar algo (ex: pular kanban e fazer só lista simples, ou adiar tela de "novo pedido" e me deixar só semear dados de teste) me avisa antes de eu começar.