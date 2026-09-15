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
  customer_phone?: string | null;
  customer_address?: string | null;
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
  delivery_extra_fee?: number;
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

export function canonicalManualPrintJobKey(
  source: "online_order" | "dining_receipt",
  sourceId: string,
) {
  return source === "online_order" ? `online-order:${sourceId}` : `manual-dining:${sourceId}`;
}

export function deduplicateLegacyPrintJobs(jobs: PrintJob[]) {
  const selected = new Map<string, PrintJob>();
  const passthrough: PrintJob[] = [];

  for (const job of jobs) {
    const isOnlineTicket =
      job.source_kind === "online_order" && job.document_type === "kitchen_ticket";
    const isManualDiningReceipt =
      job.source_kind === "dining_receipt" &&
      job.document_type === "customer_receipt" &&
      job.job_key.startsWith("manual-dining:");
    if (!isOnlineTicket && !isManualDiningReceipt) {
      passthrough.push(job);
      continue;
    }

    const identity = `${job.source_kind}:${job.source_id}:${job.document_type}`;
    const canonicalKey = canonicalManualPrintJobKey(
      isOnlineTicket ? "online_order" : "dining_receipt",
      job.source_id,
    );
    const current = selected.get(identity);
    if (!current || job.job_key === canonicalKey) selected.set(identity, job);
  }

  return [...passthrough, ...selected.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

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
  delivery_extra_fee?: number;
  total: number;
  items: { line_total: number }[];
}) {
  if (!order.items.length) return false;
  const itemSubtotal = order.items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const expectedTotal = itemSubtotal - Number(order.discount) + Number(order.delivery_fee) + Number(order.delivery_extra_fee ?? 0);
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

function formatPrintDateTime(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const when = formatPrintDateTime(payload.closed_at ?? payload.created_at ?? payload.opened_at);

  const isDelivery = payload.delivery_mode === "delivery";
  const customerLines = [
    payload.customer_name ? `<div><strong>${escapeHtml(payload.customer_name)}</strong></div>` : "",
    payload.customer_phone ? `<div>Tel: ${escapeHtml(payload.customer_phone)}</div>` : "",
    isDelivery && payload.delivery_neighborhood
      ? `<div>Bairro: <strong>${escapeHtml(payload.delivery_neighborhood)}</strong></div>`
      : "",
    isDelivery && payload.delivery_address
      ? `<div>Endereço: <strong>${escapeHtml(payload.delivery_address)}</strong></div>`
      : "",
    payload.customer_address && !isDelivery
      ? `<div>Endereço: ${escapeHtml(payload.customer_address)}</div>`
      : "",
    !payload.table_number && !isDelivery ? `<div><strong>RETIRADA NO BALCÃO</strong></div>` : "",
  ]
    .filter(Boolean)
    .join("");
  const customerBlock = customerLines
    ? `<div class="rule"></div><div class="block-title">${isDelivery ? "ENTREGA" : "CLIENTE"}</div>${customerLines}`
    : "";

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
  const itemsBlock = `<div class="rule"></div><div class="block-title">ITENS</div>${items}`;

  const generalNotes = payload.notes
    ? `<div class="rule"></div><div class="block-title">OBSERVAÇÕES DO PEDIDO</div><div class="note">${escapeHtml(payload.notes)}</div>`
    : "";

  const totals = isKitchen
    ? ""
    : `<div class="rule"></div>
       <div class="block-title">PAGAMENTO</div>
       <div class="row"><span>Subtotal</span><span>${money(payload.subtotal)}</span></div>
       ${Number(payload.discount) > 0 ? `<div class="row"><span>Desconto</span><span>- ${money(payload.discount)}</span></div>` : ""}
       ${Number(payload.delivery_fee) > 0 ? `<div class="row"><span>Entrega</span><span>${money(payload.delivery_fee)}</span></div>` : ""}
       ${Number(payload.delivery_extra_fee) > 0 ? `<div class="row"><span>Taxa adicional</span><span>${money(payload.delivery_extra_fee)}</span></div>` : ""}
       ${Number(payload.service_charge_amount) > 0 ? `<div class="row"><span>Taxa (${Number(payload.service_charge_percent)}%)</span><span>${money(payload.service_charge_amount)}</span></div>` : ""}
       <div class="row total"><span>TOTAL</span><span>${money(payload.total)}</span></div>
       <div class="row"><span>Forma</span><strong>${escapeHtml(PRINT_PAYMENT_LABEL[payload.payment_method ?? ""] ?? payload.payment_method ?? "Não informado")}</strong></div>
       ${payload.payment_method === "misto" && payload.cash_amount != null ? `<div class="row"><span>Dinheiro</span><span>${money(payload.cash_amount)}</span></div><div class="row"><span>${escapeHtml(PRINT_PAYMENT_LABEL[payload.secondary_payment_method ?? ""] ?? "Outro")}</span><span>${money(Number(payload.total) - payload.cash_amount)}</span></div>` : ""}
       ${payload.change_for ? `<div class="row"><span>Troco para</span><span>${money(payload.change_for)}</span></div><div class="row"><span>Troco</span><strong>${money(Math.max(0, payload.change_for - Number(payload.total)))}</strong></div>` : ""}`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:72mm;margin:0;padding:2mm;color:#000;background:#fff;font:12pt/1.3 "Courier New",monospace;font-weight:700;-webkit-font-smoothing:none}.center{text-align:center}.title{font-size:17pt;font-weight:900}.ref{font-size:16pt;font-weight:900;margin:2mm 0 1mm}.when{font-size:10pt}.rule{border-top:2px dashed #000;margin:1.5mm 0}.block-title{font-size:11pt;font-weight:900;letter-spacing:1px;margin-bottom:1mm}.row{display:flex;justify-content:space-between;gap:3mm}.item{margin:1.5mm 0}.sub{font-size:10pt;padding-left:3mm}.note{font-size:11pt;font-weight:900;margin-top:0.5mm}.total{font-size:15pt;font-weight:900;margin-top:1mm}.footer{font-size:9pt;margin-top:3mm}
  </style></head><body><div class="center title">MARQUINHOS LANCHES</div><div class="center block-title">${title}</div><div class="center ref">${reference}</div>${when ? `<div class="center when">${escapeHtml(when)}</div>` : ""}${customerBlock}${itemsBlock}${generalNotes}${totals}<div class="center footer">${escapeHtml(payload.non_fiscal_notice ?? (isKitchen ? "" : "DOCUMENTO NÃO FISCAL"))}</div></body></html>`;
}
