## Objetivo
Usar a sessão de caixa — da abertura ao fechamento — como período oficial de trabalho, sem dividir pedidos à meia-noite.

## Diagnóstico confirmado
- A tela **Pedidos** filtra os cards pelo dia do calendário (`00:00`), por isso pedidos ainda abertos somem do quadro quando vira o dia, embora a atualização para “entregue” não tenha bloqueio no backend.
- O relatório atual é organizado principalmente por `created_at` e data do calendário, não pela sessão do caixa.
- A sessão atualmente aberta já atravessou mais de um dia e possui pedidos corretamente vinculados a ela; portanto, o vínculo existente pode ser usado como fonte confiável.
- O Dashboard também possui um cálculo de “Hoje” baseado no fuso do servidor, diferente do horário de São Paulo.

## Implementação
1. **Manter pedidos ativos após 00:00**
   - Alterar a tela de Pedidos para carregar os pedidos da sessão de caixa aberta, independentemente da data de criação.
   - Pedidos em produção ou prontos continuarão visíveis e poderão ser finalizados normalmente depois da meia-noite.
   - Quando não houver caixa aberto, manter uma recuperação segura dos pedidos recentes ainda não concluídos para que nenhum pedido fique inacessível.

2. **Relatório oficial por sessão de caixa**
   - Transformar a área de Relatórios para listar cada caixa com horário brasileiro de abertura e fechamento.
   - Ao abrir uma sessão, mostrar todos os pedidos vinculados, totais, entregas, retiradas, cancelamentos, fretes, pagamentos e produtos vendidos.
   - Sessão aberta será identificada como “Caixa em andamento” e usará o horário atual apenas para visualização; ao fechar, o período fica definitivamente delimitado por `opened_at` e `closed_at`.
   - Manter o filtro por dia somente como consulta complementar, sem usá-lo como fechamento oficial.

3. **Unificar fuso horário**
   - Centralizar os limites de data no fuso `America/Sao_Paulo`.
   - Corrigir o cálculo “Hoje” do Dashboard e reutilizar a mesma regra nos relatórios por data e de entregadores, eliminando a diferença de três horas.
   - Exibir todas as datas e horários no padrão brasileiro.

4. **Atualização após fechar o caixa**
   - Ao confirmar o fechamento, atualizar imediatamente relatório, pedidos e métricas do Dashboard.
   - O próximo caixa aberto iniciará um novo relatório; pedidos novos serão vinculados apenas a essa nova sessão.

## Validação
- Simular pedido criado antes de 00:00 e finalizado depois de 00:00, confirmando que ele permanece no quadro.
- Confirmar que o pedido pertence ao mesmo caixa e aparece uma única vez no relatório dessa sessão.
- Conferir abertura, fechamento, valores, fretes, status e horários em `pt-BR`/São Paulo.