# Marquinhos Lanches Menu

Crie o cardápio digital público da Marquinhos Lanches (hamburgueria). Esta é a PRIMEIRA fase de um sistema maior — por agora, construa SOMENTE a vitrine pública do cardápio (não construir ainda painel administrativo, dashboard ou lógica de pedidos no backend).

## Identidade visual
Baseado no cardápio impresso atual da marca: fundo preto, faixa lateral vermelho escuro (#7a1f1f aproximado), tipografia amarela/dourada (#f2c14e aproximado) em destaque para títulos e preços, texto descritivo em branco. Logo redondo "Marquinhos Lanches" com ilustração de hambúrguer. Tom: hamburgueria de bairro, robusto, saboroso, não minimalista-clean — pode ter personalidade forte e cor vibrante, é uma hamburgueria, não um restaurante fine dining.

## Estrutura de dados (produtos)

Categorias: "Hambúrgueres Especiais", "Hambúrgueres Tradicionais", "Hot Dogs", "Bebidas"

### Hambúrgueres Especiais
- Fran-Bacon — R$ 24,00 — Molho barbecue, frango, bacon, ovo, presunto, mussarela, cheddar, tomate, alface, milho e batata palha
- Bacon Especial — R$ 25,00 — Molho barbecue, hambúrguer, bacon, ovo, presunto, mussarela, catupiry, tomate, alface, milho e batata palha
- X-Filé — R$ 30,00 — Molho barbecue, filé, ovo, presunto, mussarela, catupiry, tomate, alface, milho e batata palha
- X-Tudo — R$ 28,00 — Molho barbecue, hambúrguer, bacon, salsicha, ovo, presunto, mussarela, catupiry, tomate, alface, milho e batata palha
- X-Rango — R$ 33,00 — Molho barbecue, 2 hambúrguer, bacon, salsicha, 2 ovo, presunto, mussarela, catupiry, tomate, alface, milho e batata palha
- X-Marquinhos — R$ 40,00 — 2 pão, condimentos, 3 hambúrguer, 3 ovos, 2 presunto, 2 mussarela, 2 salsicha, bacon, 2 tomate, alface, milho e batata palha
- X-Tudão — R$ 30,00 — Molho verde, 2 hambúrguer, 2 ovos, 2 muçarela, 2 presunto, cheddar, frango, calabresa, tomate, alface, milho e batata palha
- X-Lombinho — R$ 30,00 — Condimentos, lombo de porco, cheddar, muçarela dupla, creme coleslaw e cebola

### Hambúrgueres Tradicionais
- X-Frango — R$ 22,00 — Frango, ovo, presunto, mussarela, catupiry, tomate, alface, milho e batata palha
- X-Bacon — R$ 24,00 — Hambúrguer, bacon, presunto, mussarela, catupiry, tomate, alface, milho e batata palha
- X-Calabresa — R$ 22,00 — Hambúrguer, calabresa, presunto, mussarela, catupiry, tomate, alface, milho e batata palha

### Hot Dogs
- Rot Dog ao Molho — R$ 12,00 — Mussarela, presunto, molho rot dog, salsicha, milho, batata palha
- Rot Dog na Chapa — R$ 16,00 — Mussarela, presunto, salsicha, milho, batata palha e bacon

### Bebidas
- Água mineral — R$ 5,00
- Guaraná lt — R$ 5,00
- Coca 600ml — R$ 8,00
- Guaraná 600ml — R$ 6,00
- Coca lata — R$ 7,00
- H2 limoneto — R$ 8,00
- Refrigerante 1lt — R$ 10,00
- Coca 2lt — R$ 15,00
- Guaraná 2lt — R$ 13,00
- Suco natural 500ml — R$ 12,00

### Adicionais (aplicáveis a QUALQUER hambúrguer ou hot dog do cardápio, escolha múltipla do cliente)
- Muçarela — +R$ 3,00
- Presunto — +R$ 2,00
- Ovo — +R$ 2,00
- Abacaxi — +R$ 4,00
- Salsicha — +R$ 2,00
- Calabresa — +R$ 4,00
- Frango — +R$ 4,00
- Hambúrguer — +R$ 5,00
- Bacon — +R$ 6,00
- Filé — +R$ 6,00

Cada produto deve ter campo de custo (cost) no banco, mas deixe nulo/vazio por agora — ainda não temos esse dado e será preenchido depois via painel administrativo (não inventar valores). Cada produto também precisa de campo para foto (image_url), que por agora pode ficar com placeholder, pois as fotos reais serão enviadas depois.

## Requisitos de UX (baseados em pesquisa de mercado para cardápios digitais de delivery)
- Mobile-first obrigatório: 70%+ do tráfego real é mobile. Botões grandes (mínimo 44px de área de toque), zero necessidade de pinch/zoom.
- Categorias fixas (sticky) no topo da tela, barra horizontal, permitindo navegação rápida entre seções com um toque, sem precisar abrir menu escondido (hambúrguer menu reduz conclusão de tarefa, evitar).
- Foto do produto sempre visível ao lado/perto do preço e botão de adicionar, nunca como elemento puramente decorativo.
- Performance: carregamento rápido, sem elementos pesados desnecessários.
- Cada produto, ao ser clicado, expande para mostrar a lista de adicionais com checkboxes (quantidade e preço somando no total do item).
- Carrinho persistente (ex: barra fixa inferior mostrando "X itens — R$ XX,00 — Ver carrinho") conforme o cliente adiciona itens.
- Tela de carrinho/revisão do pedido antes de finalizar, com campo para nome do cliente, telefone, endereço de entrega (ou indicação de retirada no local), e observações gerais.
- Botão final "Fazer pedido" deve estar preparado para no futuro gerar uma mensagem formatada para WhatsApp (não implementar a integração de envio ainda — apenas estruture o carrinho e o resumo do pedido de forma que isso seja fácil de conectar depois).

## Contato da loja
WhatsApp/Delivery: (94) 99103-2483

## O que NÃO fazer nesta fase
- Não construir painel administrativo nem dashboard de gestão ainda
- Não implementar envio real para WhatsApp ainda (isso vem na próxima fase)
- Não inventar custos de produtos
- Não remover do banco os itens descontinuados (X-Burguer, X-Salada, X-Salada Especial, Misto Quente, Bauru) — se quiser incluí-los para referência futura, marque como inativos/ocultos, não exclua

Construa com Supabase como banco de dados (produtos, categorias, adicionais já estruturados em tabelas), pensando que nas próximas fases vamos adicionar: painel de pedidos do dia, sistema de status de pedido, link individual de acompanhamento do cliente, e dashboard de análise de margem/lucratividade (menu engineering).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://marquinhoslanches.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/df502fba-7463-48d0-9ae2-5f7b72f6c226).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
