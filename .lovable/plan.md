# Restaurar lançamento de pedido em mesa nova

## Problema
No painel "Controle de mesas" atualmente só são exibidas mesas **ocupadas**, conforme solicitado anteriormente. Com isso, não há mais como iniciar uma nova comanda/mesa, pois as mesas livres ficam invisíveis e não há outro caminho para abrir uma sessão.

## Solução
Adicionar um controle explícito para ocupar uma nova mesa sem voltar a exibir mesas livres no grid principal.

## O que será feito

1. **Botão "+ Ocupar mesa" no topo do `DiningTablesPanel`**
   - Visível apenas quando o caixa estiver aberto.
   - Abre um Dialog/Popover listando as mesas ativas e livres (número e estado).

2. **Dialog de seleção de mesa livre**
   - Grid compacto com as mesas disponíveis.
   - Ao clicar, chama `openDiningSession` e já abre a comanda da mesa escolhida.

3. **Manter o grid principal mostrando só mesas ocupadas**
   - Preserva o comportamento solicitado anteriormente.

4. **Mensagem de estado vazio ajustada**
   - Quando não houver mesas ocupadas, exibir algo como:
     "Nenhuma mesa ocupada. Clique em '+ Ocupar mesa' para iniciar uma comanda."

## Arquivos envolvidos
- `src/components/admin/DiningTablesPanel.tsx`
- `src/lib/dining.functions.ts` (reutiliza `openDiningSession` existente)

## Critério de pronto
- Conseguir abrir uma nova mesa sem que ela apareça no grid principal antes de ser ocupada.
- Fluxo continuar funcionando: adicionar produtos, fechar comanda e liberar mesa.
