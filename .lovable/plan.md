# Plano — 3 melhorias no painel

## 1. Abrir/Fechar caixa manualmente

Hoje o relatório usa o dia do calendário (America/Sao_Paulo), então um pedido às 00:01 já cai no dia seguinte. Vou criar o conceito de **sessão de caixa** para agrupar pedidos pelo período real de operação, não pela data.

**Banco**
- Nova tabela `cash_sessions` (`opened_at`, `closed_at`, `opened_by`, `closed_by`, `opening_note`, `closing_note`).
- Coluna `cash_session_id` em `orders` (nullable, FK). Ao criar um pedido (público ou manual), se houver sessão aberta, vincula automaticamente.
- RLS: staff/admin lê e escreve.

**Painel**
- Novo botão no topo do Dashboard: **"Abrir caixa" / "Fechar caixa"** com badge do horário de abertura.
- Ao fechar, mostra um resumo (pedidos, faturamento, fretes, entregas concluídas, canceladas) e pede confirmação.
- Na tela de **Relatórios**, novo seletor: "Por dia" (comportamento atual) **ou** "Por sessão de caixa" (lista das sessões fechadas, cada uma vira um relatório completo). O relatório do caixa usa exatamente as mesmas métricas já existentes, filtradas por `cash_session_id`.

## 2. Painel de Clientes (com autopreenchimento)

Hoje já existe autofill via `localStorage` do próprio cliente. Vou centralizar no servidor para que **o admin** também aproveite ao lançar pedidos manuais.

**Banco**
- Nova tabela `customers` (`phone` único, `name`, `last_address`, `last_neighborhood`, `orders_count`, `total_spent`, `last_order_at`).
- Atualização automática (trigger ou dentro do `createOrder`/`createManualOrder`): a cada pedido novo, faz upsert por telefone, atualiza nome/endereço/bairro e incrementa contadores.

**Painel**
- Novo item no menu lateral: **"Clientes"**.
- Tabela com busca por nome ou telefone, mostrando: nome, telefone, último endereço + bairro, nº de pedidos, total gasto, último pedido.
- Ações: ver histórico de pedidos daquele telefone; editar nome/endereço manualmente.

**Novo pedido manual**
- No campo telefone (ou novo campo "Buscar cliente") — ao digitar 3+ dígitos ou letras, mostra sugestões da tabela `customers`. Ao selecionar, preenche nome, endereço, bairro e modo (entrega/retirada) do último pedido.

## 3. Relatório de Entregadores

Baseado no PDF enviado: métricas por entregador em um período.

**Banco**
- Nova tabela `couriers` (`name`, `phone`, `active`).
- Coluna `courier_id` em `orders` (nullable).

**Painel**
- Item no menu **"Entregadores"** (admin): CRUD simples (nome, telefone, ativo).
- Na tela de **Pedidos**, no card de cada pedido de entrega: dropdown "Entregador" para atribuir/trocar (só aparece quando o status é "pronto" ou depois).
- Nova aba dentro de **Relatórios** → **"Entregadores"**:
  - Filtro de período com **datas inicial e final** (não só um dia).
  - Cards no topo: **Faturamento dos fretes**, **Ticket médio de frete**, **Total de entregas**, **Entregadores ativos**.
  - Tabela: Nº pedido, Valor do pedido, Pagamento, Valor do frete, Bairro, Entregador, Data/hora — mesmo layout do PDF.
  - Botões: **Copiar** (texto pro WhatsApp) e **Exportar PDF** no mesmo padrão do arquivo enviado.

## Ordem de implementação
1. Migração (3 tabelas + colunas + RLS + GRANT).
2. Painel de Clientes + autofill no novo pedido.
3. Caixa manual (abrir/fechar + filtro no relatório).
4. Entregadores (CRUD, atribuição, relatório + PDF).

## Pontos que confirmo antes de codar

- **Caixa único?** Um caixa aberto por vez pra toda a loja (não por usuário). Ok?
- **Pedidos antes da migração** ficam sem `cash_session_id` — no relatório por sessão eles não aparecem; continuam disponíveis no relatório por dia. Ok?
- **Entregador único por pedido** (sem divisão), ok?
