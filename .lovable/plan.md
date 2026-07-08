## Problema

Hoje, quando o cliente escolhe PIX no cardápio:

1. Ele confirma o pedido → aparece uma tela com QR Code e chave PIX.
2. O pedido **só** é registrado / enviado ao WhatsApp da loja quando o cliente aperta o botão "Já paguei / enviar comprovante".
3. Muitos clientes pagam o PIX e fecham a página, então você nunca recebe o pedido no WhatsApp.

## Objetivo

Tratar PIX como as outras formas de pagamento: o cliente já é mandado direto para o WhatsApp com o pedido, e a mensagem do WhatsApp já traz o **código PIX copia e cola** (e o valor) para ele colar no banco e pagar.

## Mudanças

**Arquivo:** `src/routes/index.tsx`

1. **Remover a etapa intermediária de PIX** no checkout:
   - Não abrir mais a tela `step === "pix"` com QR Code / botão "já paguei".
   - No fluxo do PIX, chamar o mesmo caminho das outras formas: registra o pedido no banco e abre o WhatsApp direto.
   - Botão final passa a dizer sempre "Enviar pedido pelo WhatsApp" (inclusive quando `payment === "pix"`), e a legenda embaixo troca para algo como *"Você será redirecionado para o WhatsApp. O código PIX virá junto na mensagem."*

2. **Incluir o código PIX na mensagem do WhatsApp** quando a forma escolhida for PIX. A mensagem atual do pedido ganha um bloco extra no final, mais ou menos assim:

   ```text
   💳 Pagamento: PIX
   Valor: R$ 45,00

   🔑 Chave PIX: +5594991032483
   (nome: Marquinhos Lanches)

   📋 PIX copia e cola:
   00020126...6304ABCD

   Copie o código acima, cole no app do seu banco e finalize o pagamento.
   Depois é só me mandar o comprovante por aqui. 🙏
   ```

   O código PIX (`buildPixPayload`) continua sendo gerado com o valor total do pedido, a chave e o nome já configurados em Configurações.

3. **Limpeza:** remover estados que ficam sem uso (`step`, `pixQr`, `pixCopied`, geração do QR em `useEffect`, função `copyPixKey`, botão "Já paguei / anexar comprovante") ou mantê-los apenas se ainda forem usados em outra parte. Nada muda em admin, backend, tabelas ou formas de pagamento diferentes de PIX.

## O que **não** muda

- Nada no painel administrativo, nos pedidos manuais, nas outras formas de pagamento (cartão, dinheiro), no cálculo de frete, nas configurações de PIX (chave, nome, cidade continuam vindo de Configurações) ou no banco de dados.
- O QR Code deixa de aparecer no cardápio do cliente (por escolha sua). Se quiser manter o QR também disponível, me avise antes de eu implementar.

## Detalhes técnicos

- `payment === "pix"` passa a cair no mesmo branch de `submitPublicOrder` + `sendWhatsapp()` das outras formas.
- `sendWhatsapp` recebe um `extra` opcional com o bloco PIX (chave + copia e cola + valor) montado com `buildPixPayload({ key, amount: grandTotal, merchantName, merchantCity })`.
- A tela `step === "pix"` e o `useEffect` que gera o QR são removidos; `useMemo` do `pixPayload` continua, pois agora ele é usado para montar a mensagem do WhatsApp.
