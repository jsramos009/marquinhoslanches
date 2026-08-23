import type { ThermalPayload } from "@/lib/print-domain";

export function KitchenTicket({ payload }: { payload: ThermalPayload }) {
  const reference = payload.table_number
    ? `MESA ${payload.table_number}${payload.batch_number ? ` · LOTE ${payload.batch_number}` : ""}`
    : `PEDIDO #${payload.order_id?.slice(0, 8).toUpperCase() ?? "—"}`;
  return (
    <div className="thermal-receipt">
      <div className="t-center t-bold t-lg">MARQUINHOS LANCHES</div>
      <div className="t-center t-bold">COZINHA</div>
      <div className="t-center t-bold t-lg">{reference}</div>
      <div className="t-divider" />
      {payload.items.map((item, index) => (
        <div key={item.id ?? `${item.name}-${index}`} className="t-item">
          <div className="t-bold">
            {item.quantity}x {item.name}
          </div>
          {item.addons.length > 0 && (
            <div className="t-sub">
              + {item.addons.map((addon) => `${addon.quantity}x ${addon.name}`).join(", ")}
            </div>
          )}
          {item.notes && <div className="t-sub t-bold">OBS: {item.notes}</div>}
        </div>
      ))}
      {payload.notes && (
        <>
          <div className="t-divider" />
          <div className="t-bold">OBS:</div>
          <div>{payload.notes}</div>
        </>
      )}
      {payload.delivery_mode === "delivery" && (
        <>
          <div className="t-divider" />
          <div className="t-bold">ENTREGA</div>
          <div>{payload.delivery_address}</div>
          <div>{payload.delivery_neighborhood}</div>
        </>
      )}
    </div>
  );
}
