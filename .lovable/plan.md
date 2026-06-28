## O que vou fazer

### 1. Banco — forma de pagamento e troco
Adicionar em `orders`:
- `payment_method` — enum (`pix`, `cartao_credito`, `cartao_debito`, `dinheiro`, `nao_informado`)
- `change_for` — numérico opcional (valor pra qual precisa de troco, só quando dinheiro)

Atualizar `createOrder` (server fn) pra aceitar esses campos e `listRecentOrders` pra retorná-los.

### 2. Checkout do cardápio (homepage pública `/`)
No `CartDialog`, **acima do bloco "Observações do pedido"**, adicionar bloco "Como vai pagar?":
- 4 botões grandes com a mesma animação dos chips de adicionais já existentes: **PIX**, **Cartão crédito**, **Cartão débito**, **Dinheiro**.
- Quando "Dinheiro" estiver ativo, aparece campo "Precisa de troco pra quanto?" (opcional — se vazio, "Sem troco").
- Mantém o resto do fluxo (entrega/retirada, observações, envio pro WhatsApp) intacto.
- A mensagem do WhatsApp passa a incluir "Pagamento: PIX" / "Dinheiro — troco pra R$ 50,00" etc.

### 3. Dashboard `/admin/dashboard` — Cards de pedidos do dia (3×4)
Acima do gráfico "Faturamento", grid responsivo (desktop 4 colunas × 3 linhas = 12 cards mais recentes do dia; mobile rola). Cada card quadrado mostra:
- Nome do cliente (ou "Sem nome")
- Resumo dos itens (ex.: "2× X-Tudo, 1× Coca 2L")
- Valor total pago
- Forma de pagamento (badge: PIX / Cartão / Dinheiro + troco se houver)
- Hora do pedido, status (badge colorido)
- **Botão "Imprimir comanda"** → abre janela de impressão otimizada para impressora térmica 80mm

### 4. Impressão térmica 80mm
- Componente `ThermalReceipt` (oculto fora do print) com CSS `@media print`: largura 80mm, fonte monoespaçada, sem cores, header com nome do estabelecimento, nome do cliente, itens detalhados (com adicionais), total, forma de pagamento, **troco destacado quando houver** (essencial pro motoboy), horário da impressão, número resumido do pedido.
- Botão imprime via `window.print()` após renderizar o recibo daquele pedido específico (usando estado isolado).

### 5. Link público curto
A slug do link `.lovable.app` é definida na hora de publicar. Quando você clicar em **Publish**, vou usar a slug **`marquinhos-lanches`** — fica `https://marquinhos-lanches.lovable.app` (curto, com o nome). A homepage já é o cardápio, então o link raiz já serve. Não precisa de rota nova.

---

## Detalhes técnicos
- Migração: `ALTER TABLE orders ADD COLUMN payment_method`, `change_for numeric`. Sem mudança de RLS.
- `src/lib/orders.functions.ts`: amplia `inputValidator` de `createOrder` + select de `listRecentOrders`.
- `src/routes/index.tsx`: adiciona estado `paymentMethod` e `changeFor` no `CartDialog`, novo bloco UI, inclui no payload do WhatsApp.
- `src/routes/_authenticated/admin.dashboard.tsx`: nova seção `TodayOrdersGrid` usando `listRecentOrders({ sinceHours: 24 })` filtrado por hoje, com botão de imprimir.
- Novo `src/components/admin/ThermalReceipt.tsx` + estilos print-only em `src/styles.css`.
- Fora de escopo agora: integração ESC/POS direta (WebUSB) — fica na próxima fase se a impressão via diálogo do navegador não atender.

Posso seguir?