import type { OrderRow, OrderPaymentMethod } from "@/lib/orders.functions";

const PAY_LABEL: Record<OrderPaymentMethod, string> = {
  pix: "PIX",
  cartao_credito: "Cartão (Crédito)",
  cartao_debito: "Cartão (Débito)",
  dinheiro: "Dinheiro",
  nao_informado: "Não informado",
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ThermalReceipt({ order }: { order: OrderRow }) {
  const printedAt = new Date();
  const created = new Date(order.created_at);
  const shortId = order.id.slice(0, 8).toUpperCase();
  const change =
    order.payment_method === "dinheiro" && order.change_for && order.change_for > 0
      ? order.change_for - order.total
      : null;

  return (
    <div className="thermal-receipt">
      <div className="t-center t-bold t-lg">MARQUINHOS LANCHES</div>
      <div className="t-center t-sm">Comanda do Pedido</div>
      <div className="t-divider" />
      <div>Pedido: #{shortId}</div>
      <div>Cliente: {order.customer_name || "—"}</div>
      <div>Aberto: {created.toLocaleString("pt-BR")}</div>
      <div>Impresso: {printedAt.toLocaleString("pt-BR")}</div>
      <div className="t-divider" />
      {order.items.map((it) => (
        <div key={it.id} className="t-item">
          <div className="t-row">
            <span>
              {it.quantity}x {it.product_name_snapshot}
            </span>
            <span>{brl(it.line_total)}</span>
          </div>
          {it.addons.length > 0 && (
            <div className="t-sub">
              + {it.addons.map((a) => `${a.quantity}x ${a.addon_name_snapshot}`).join(", ")}
            </div>
          )}
        </div>
      ))}
      <div className="t-divider" />
      {order.discount > 0 && (
        <div className="t-row">
          <span>Subtotal</span>
          <span>{brl(order.subtotal)}</span>
        </div>
      )}
      {order.discount > 0 && (
        <div className="t-row">
          <span>Desconto</span>
          <span>- {brl(order.discount)}</span>
        </div>
      )}
      <div className="t-row t-bold t-lg">
        <span>TOTAL</span>
        <span>{brl(order.total)}</span>
      </div>
      <div className="t-divider" />
      <div className="t-row">
        <span>Pagamento:</span>
        <span className="t-bold">{PAY_LABEL[order.payment_method]}</span>
      </div>
      {order.payment_method === "dinheiro" && order.change_for && order.change_for > 0 && (
        <>
          <div className="t-row">
            <span>Pagar com:</span>
            <span>{brl(order.change_for)}</span>
          </div>
          <div className="t-row t-bold">
            <span>** TROCO **</span>
            <span>{brl(Math.max(0, change ?? 0))}</span>
          </div>
        </>
      )}
      {order.payment_method === "dinheiro" &&
        (!order.change_for || order.change_for <= 0) && (
          <div className="t-center t-bold">SEM TROCO</div>
        )}
      {order.notes && (
        <>
          <div className="t-divider" />
          <div className="t-bold">Obs.:</div>
          <div className="t-sub">{order.notes}</div>
        </>
      )}
      <div className="t-divider" />
      <div className="t-center t-sm">Obrigado pela preferência!</div>
    </div>
  );
}