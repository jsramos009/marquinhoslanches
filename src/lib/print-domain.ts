export type PrintJobStatus = "pending" | "printing" | "printed" | "failed";
export type PrintDocumentType = "kitchen_ticket" | "customer_receipt";

export type PrintLineAddon = {
  name: string;
  quantity: number;
  unit_price?: number;
};

export type PrintLineItem = {
  id?: string;
  name: string;
  quantity: number;
  unit_price?: number;
  line_total?: number;
  notes?: string | null;
  addons: PrintLineAddon[];
};

export type ThermalPayload = {
  source: "online_order" | "dining_batch" | "dining_receipt";
  order_id?: string;
  session_id?: string;
  batch_id?: string;
  table_number?: number;
  batch_number?: number;
  customer_name?: string | null;
  created_at?: string;
  opened_at?: string;
  closed_at?: string;
  delivery_mode?: string;
  delivery_address?: string | null;
  delivery_neighborhood?: string | null;
  notes?: string | null;
  subtotal?: number;
  discount?: number;
  delivery_fee?: number;
  service_charge_percent?: number;
  service_charge_amount?: number;
  total?: number;
  payment_method?: string;
  secondary_payment_method?: string | null;
  cash_amount?: number | null;
  change_for?: number | null;
  non_fiscal_notice?: string;
  items: PrintLineItem[];
};

export type PrintJob = {
  id: string;
  job_key: string;
  source_kind: ThermalPayload["source"];
  source_id: string;
  document_type: PrintDocumentType;
  payload: ThermalPayload;
  auto_print: boolean;
  status: PrintJobStatus;
  attempts: number;
  station_id: string | null;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
};

export const PRINT_PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao_credito: "Cartão (Crédito)",
  cartao_debito: "Cartão (Débito)",
  dinheiro: "Dinheiro",
  misto: "Pagamento misto",
  nao_informado: "Não informado",
};

export function onlineScanWindow(
  activatedAt: string,
  lastScanAt: string | null,
  scanCompletedAt: Date,
  overlapMs = 5 * 60_000,
) {
  const activation = new Date(activatedAt).getTime();
  const previous = new Date(lastScanAt ?? activatedAt).getTime();
  if (!Number.isFinite(activation) || !Number.isFinite(previous)) {
    throw new Error("Cursor de impressão inválido.");
  }
  return {
    from: new Date(Math.max(activation, previous - overlapMs)).toISOString(),
    through: scanCompletedAt.toISOString(),
  };
}

export function isCompleteOnlineOrder(order: {
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  items: { line_total: number }[];
}) {
  if (!order.items.length) return false;
  const itemSubtotal = order.items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const expectedTotal = itemSubtotal - Number(order.discount) + Number(order.delivery_fee);
  return (
    Math.abs(itemSubtotal - Number(order.subtotal)) <= 0.01 &&
    Math.abs(expectedTotal - Number(order.total)) <= 0.01
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number | undefined) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function thermalHtml(payload: ThermalPayload, documentType: PrintDocumentType) {
  const isKitchen = documentType === "kitchen_ticket";
  const title = isKitchen
    ? "COZINHA"
    : payload.source === "dining_receipt" && !payload.closed_at
      ? "COMANDA"
      : "RECIBO";
  const reference = payload.table_number
    ? `MESA ${payload.table_number}${payload.batch_number ? ` · LOTE ${payload.batch_number}` : ""}`
    : `PEDIDO #${escapeHtml(payload.order_id?.slice(0, 8).toUpperCase())}`;
  const items = payload.items
    .map((item) => {
      const addons = item.addons?.length
        ? `<div class="sub">+ ${item.addons.map((addon) => `${addon.quantity}x ${escapeHtml(addon.name)}`).join(", ")}</div>`
        : "";
      const notes = item.notes ? `<div class="note">OBS: ${escapeHtml(item.notes)}</div>` : "";
      const price = isKitchen ? "" : `<span>${money(item.line_total)}</span>`;
      return `<div class="item"><div class="row"><strong>${item.quantity}x ${escapeHtml(item.name)}</strong>${price}</div>${addons}${notes}</div>`;
    })
    .join("");
  const totals = isKitchen
    ? ""
    : `<div class="rule"></div>
       <div class="row"><span>Subtotal</span><span>${money(payload.subtotal)}</span></div>
       ${Number(payload.discount) > 0 ? `<div class="row"><span>Desconto</span><span>- ${money(payload.discount)}</span></div>` : ""}
       ${Number(payload.delivery_fee) > 0 ? `<div class="row"><span>Entrega</span><span>${money(payload.delivery_fee)}</span></div>` : ""}
       ${Number(payload.service_charge_amount) > 0 ? `<div class="row"><span>Taxa (${Number(payload.service_charge_percent)}%)</span><span>${money(payload.service_charge_amount)}</span></div>` : ""}
       <div class="row total"><span>TOTAL</span><span>${money(payload.total)}</span></div>
       <div class="rule"></div>
       <div class="row"><span>Pagamento</span><strong>${escapeHtml(PRINT_PAYMENT_LABEL[payload.payment_method ?? ""] ?? payload.payment_method ?? "Não informado")}</strong></div>
       ${payload.payment_method === "misto" && payload.cash_amount != null ? `<div class="row"><span>Dinheiro</span><span>${money(payload.cash_amount)}</span></div><div class="row"><span>${escapeHtml(PRINT_PAYMENT_LABEL[payload.secondary_payment_method ?? ""] ?? "Outro")}</span><span>${money(Number(payload.total) - payload.cash_amount)}</span></div>` : ""}
       ${payload.change_for ? `<div class="row"><span>Troco para</span><span>${money(payload.change_for)}</span></div><div class="row"><span>Troco</span><strong>${money(Math.max(0, payload.change_for - Number(payload.total)))}</strong></div>` : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:72mm;margin:0;padding:2mm;color:#000;background:#fff;font:11pt/1.25 "Courier New",monospace}.center{text-align:center}.title{font-size:16pt;font-weight:800}.ref{font-size:15pt;font-weight:800;margin:2mm 0}.rule{border-top:1px dashed #000;margin:1.5mm 0}.row{display:flex;justify-content:space-between;gap:3mm}.item{margin:1.5mm 0}.sub{font-size:9pt;padding-left:2mm}.note{font-size:10pt;font-weight:700;margin-top:1mm}.total{font-size:14pt;font-weight:800}.footer{font-size:9pt;margin-top:2mm}
  </style></head><body><div class="center title">MARQUINHOS LANCHES</div><div class="center">${title}</div><div class="center ref">${reference}</div><div class="rule"></div>${items}${payload.notes ? `<div class="rule"></div><strong>OBS:</strong><div>${escapeHtml(payload.notes)}</div>` : ""}${payload.delivery_mode === "delivery" ? `<div class="rule"></div><strong>ENTREGA</strong><div>${escapeHtml(payload.delivery_address)}</div><div>${escapeHtml(payload.delivery_neighborhood)}</div>` : ""}${totals}<div class="center footer">${escapeHtml(payload.non_fiscal_notice ?? (isKitchen ? "" : "DOCUMENTO NÃO FISCAL"))}</div></body></html>`;
}
