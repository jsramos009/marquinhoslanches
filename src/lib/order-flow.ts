import type { OrderRow, OrderStatus, OrderPaymentMethod } from "@/lib/orders.functions";

// Labels do fluxo solicitado pelo usuário (4 status ativos + cancelado)
export const FLOW_STATUS_LABEL: Record<OrderStatus, string> = {
  recebido: "Aguardando confirmação",
  em_producao: "Pedido aceito",
  pronto: "A caminho",
  entregue: "Finalizado",
  cancelado: "Cancelado",
};

export const FLOW_STATUS_SHORT: Record<OrderStatus, string> = {
  recebido: "Aguardando",
  em_producao: "Aceito",
  pronto: "A caminho",
  entregue: "Finalizado",
  cancelado: "Cancelado",
};

export const FLOW_STATUS_BADGE: Record<OrderStatus, string> = {
  recebido: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  em_producao: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  pronto: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  entregue: "bg-muted text-muted-foreground border-border",
  cancelado: "bg-destructive/15 text-destructive border-destructive/30",
};

export const PAY_LABEL: Record<OrderPaymentMethod, string> = {
  pix: "PIX",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  dinheiro: "Dinheiro",
  nao_informado: "—",
};

// Botão de avanço de status (Aceitar -> A caminho -> Finalizar)
export function nextActionFor(status: OrderStatus): {
  next: OrderStatus;
  label: string;
} | null {
  if (status === "recebido") return { next: "em_producao", label: "Aceitar" };
  if (status === "em_producao") return { next: "pronto", label: "A caminho" };
  if (status === "pronto") return { next: "entregue", label: "Finalizar" };
  return null;
}

// ---------- Repeat order link (base64 query param) ----------

type RepeatPayload = {
  i: { p: string; q: number; a?: string[]; n?: string }[];
};

function b64encode(s: string): string {
  if (typeof window === "undefined") return Buffer.from(s, "utf8").toString("base64url");
  // Browser-safe url-safe base64
  const b = btoa(unescape(encodeURIComponent(s)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  if (typeof window === "undefined") return Buffer.from(pad, "base64").toString("utf8");
  return decodeURIComponent(escape(atob(pad)));
}

export function buildRepeatToken(order: OrderRow): string | null {
  const items = order.items
    .filter((it) => it.product_id)
    .map((it) => {
      const addonIds = it.addons
        .filter((a) => a.addon_id)
        .map((a) => a.addon_id as string);
      const entry: RepeatPayload["i"][number] = {
        p: it.product_id as string,
        q: it.quantity,
      };
      if (addonIds.length) entry.a = addonIds;
      const notes = (it.notes ?? "").trim();
      if (notes) entry.n = notes.slice(0, 240);
      return entry;
    });
  if (items.length === 0) return null;
  return b64encode(JSON.stringify({ i: items } satisfies RepeatPayload));
}

export function decodeRepeatToken(token: string): RepeatPayload | null {
  try {
    const parsed = JSON.parse(b64decode(token)) as RepeatPayload;
    if (!parsed || !Array.isArray(parsed.i)) return null;
    const items = parsed.i.filter(
      (e) => typeof e?.p === "string" && Number.isFinite(e?.q) && e.q > 0,
    ).map((e) => ({
      p: e.p,
      q: e.q,
      a: Array.isArray(e.a) ? e.a.filter((x) => typeof x === "string") : undefined,
      n: typeof e.n === "string" ? e.n : undefined,
    }));
    if (items.length === 0) return null;
    return { i: items };
  } catch {
    return null;
  }
}

export function buildRepeatUrl(order: OrderRow): string | null {
  const token = buildRepeatToken(order);
  if (!token) return null;
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}/?r=${token}`;
}

// ---------- Mensagens de WhatsApp prontas ----------

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function orderSummaryLines(order: OrderRow): string {
  return order.items
    .map((i) => {
      const addons = i.addons.length
        ? ` (+ ${i.addons.map((a) => a.addon_name_snapshot).join(", ")})`
        : "";
      return `• ${i.quantity}× ${i.product_name_snapshot}${addons}`;
    })
    .join("\n");
}

export type WaTemplate = "aceito" | "a_caminho" | null;

export function whatsappTemplateFor(status: OrderStatus): WaTemplate {
  if (status === "em_producao") return "aceito";
  if (status === "pronto") return "a_caminho";
  return null;
}

export function buildWhatsAppMessage(
  order: OrderRow,
  template: WaTemplate,
): string {
  const name = order.customer_name?.trim() || "cliente";
  const summary = orderSummaryLines(order);
  const total = brl(order.total);
  const repeatUrl = buildRepeatUrl(order);
  const repeatLine = repeatUrl
    ? `\n\n🔁 Quer repetir esse pedido com 1 toque? ${repeatUrl}`
    : "";
  const orderBlock = `\n\n📋 *Seu pedido*\n${summary}\n*Total:* ${total}`;

  if (template === "aceito") {
    return `Olá ${name}! 👋\n\n✅ Seu pedido foi *aceito* e já está sendo preparado.\n⏱️ Tempo médio de preparo: *20 a 35 minutos*.${orderBlock}${repeatLine}\n\n— Marquinhos Lanches 🍔`;
  }
  if (template === "a_caminho") {
    return `Olá ${name}! 🛵\n\n🚀 Seu pedido *saiu para entrega*! Fique atento, já está a caminho.${orderBlock}${repeatLine}\n\n— Marquinhos Lanches 🍔`;
  }
  return `Olá ${name}! Sobre seu pedido na Marquinhos Lanches.${orderBlock}${repeatLine}`;
}

// Normaliza telefone para wa.me (somente dígitos, BR default 55)
export function normalizeWhatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsAppLink(
  order: OrderRow,
  template: WaTemplate,
): string {
  const text = encodeURIComponent(buildWhatsAppMessage(order, template));
  const number = normalizeWhatsappNumber(order.customer_phone);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}