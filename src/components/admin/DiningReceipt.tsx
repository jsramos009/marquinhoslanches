import { formatBRL } from "@/components/admin/AdminShell";
import { PRINT_PAYMENT_LABEL, type ThermalPayload } from "@/lib/print-domain";

export function DiningReceipt({ payload }: { payload: ThermalPayload }) {
  const change = payload.change_for
    ? Math.max(0, payload.change_for - Number(payload.total ?? 0))
    : null;
  return (
    <div className="thermal-receipt">
      <div className="t-center t-bold t-lg">MARQUINHOS LANCHES</div>
      <div className="t-center">RECIBO DA MESA</div>
      <div className="t-center t-bold t-lg">MESA {payload.table_number}</div>
      <div className="t-divider" />
      <div>
        Abertura: {payload.opened_at ? new Date(payload.opened_at).toLocaleString("pt-BR") : "—"}
      </div>
      <div>
        Fechamento: {payload.closed_at ? new Date(payload.closed_at).toLocaleString("pt-BR") : "—"}
      </div>
      <div className="t-divider" />
      {payload.items.map((item, index) => (
        <div key={item.id ?? `${item.name}-${index}`} className="t-item">
          <div className="t-row">
            <span>
              {item.quantity}x {item.name}
            </span>
            <span>{formatBRL(Number(item.line_total ?? 0))}</span>
          </div>
          {item.addons.length > 0 && (
            <div className="t-sub">
              + {item.addons.map((addon) => `${addon.quantity}x ${addon.name}`).join(", ")}
            </div>
          )}
        </div>
      ))}
      <div className="t-divider" />
      <div className="t-row">
        <span>Subtotal</span>
        <span>{formatBRL(Number(payload.subtotal ?? 0))}</span>
      </div>
      {Number(payload.service_charge_amount) > 0 && (
        <div className="t-row">
          <span>Taxa ({Number(payload.service_charge_percent)}%)</span>
          <span>{formatBRL(Number(payload.service_charge_amount))}</span>
        </div>
      )}
      <div className="t-row t-bold t-lg">
        <span>TOTAL</span>
        <span>{formatBRL(Number(payload.total ?? 0))}</span>
      </div>
      <div className="t-divider" />
      <div className="t-row">
        <span>Pagamento</span>
        <span className="t-bold">
          {PRINT_PAYMENT_LABEL[payload.payment_method ?? ""] ?? "Não informado"}
        </span>
      </div>
      {payload.payment_method === "misto" && payload.cash_amount != null && (
        <>
          <div className="t-row">
            <span>Dinheiro</span>
            <span>{formatBRL(payload.cash_amount)}</span>
          </div>
          <div className="t-row">
            <span>{PRINT_PAYMENT_LABEL[payload.secondary_payment_method ?? ""] ?? "Outro"}</span>
            <span>{formatBRL(Number(payload.total ?? 0) - payload.cash_amount)}</span>
          </div>
        </>
      )}
      {payload.change_for && (
        <>
          <div className="t-row">
            <span>Troco para</span>
            <span>{formatBRL(payload.change_for)}</span>
          </div>
          <div className="t-row t-bold">
            <span>TROCO</span>
            <span>{formatBRL(change ?? 0)}</span>
          </div>
        </>
      )}
      <div className="t-divider" />
      <div className="t-center t-bold">{payload.non_fiscal_notice ?? "DOCUMENTO NÃO FISCAL"}</div>
    </div>
  );
}
