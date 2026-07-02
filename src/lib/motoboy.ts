import { type OrderRow } from "@/lib/orders.functions";

const PAY_LABEL_FULL: Record<OrderRow["payment_method"], string> = {
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  nao_informado: "Não informado",
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function extractGpsLink(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/Localização GPS:\s*(https?:\/\/[^\s]+)/i);
  return m ? m[1].trim() : null;
}

function extractAddressFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  // Aceita tanto "Entrega:" quanto "Endereço:" (formatos legados/novos).
  // Captura múltiplas linhas até encontrar linha em branco, "Bairro:",
  // "Localização", "N=" ou o fim das notas.
  const m = notes.match(
    /(?:Endere[cç]o|Entrega)\s*:\s*([\s\S]+?)(?:\n\s*\n|\n\s*(?:Bairro|Localiza[cç][aã]o|N\s*=|✅|Pagamento|Frete|Total)|$)/i,
  );
  if (!m) return null;
  return m[1].split("\n").map((l) => l.trim()).filter(Boolean).join(", ");
}

export function buildMotoboyLink(order: OrderRow): string {
  const address =
    order.delivery_address?.trim() ||
    extractAddressFromNotes(order.notes) ||
    "";
  const neighborhood = order.delivery_neighborhood?.trim() || "";
  const gpsLink = extractGpsLink(order.notes);

  const itemsTxt = order.items
    .map((i) => {
      const add = i.addons.length
        ? ` (+ ${i.addons.map((a) => `${a.quantity}x ${a.addon_name_snapshot}`).join(", ")})`
        : "";
      return `• ${i.quantity}× ${i.product_name_snapshot}${add}`;
    })
    .join("\n");

  const lines: string[] = [];
  lines.push("🛵 *Entrega — Marquinhos Lanches*");
  lines.push("");
  lines.push(`*Cliente:* ${order.customer_name || "—"}`);
  if (order.customer_phone) lines.push(`*Telefone:* ${order.customer_phone}`);
  if (address) {
    lines.push(`*Endereço:* ${address}`);
    const mapUrl =
      gpsLink ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    lines.push(`*Localização:* ${mapUrl}`);
  }
  if (neighborhood) lines.push(`*Bairro:* ${neighborhood}`);
  lines.push("");
  lines.push("📋 *Pedido*");
  lines.push(itemsTxt);
  if (order.delivery_fee && order.delivery_fee > 0) {
    lines.push(`*Subtotal:* ${brl(order.subtotal)}`);
    lines.push(`*Frete:* ${brl(order.delivery_fee)}`);
  }
  lines.push(`*Total:* ${brl(order.total)}`);
  lines.push("");
  lines.push(`*Pagamento:* ${PAY_LABEL_FULL[order.payment_method]}`);
  if (order.payment_method === "dinheiro") {
    if (order.change_for && order.change_for > order.total) {
      const troco = order.change_for - order.total;
      lines.push(`*Levar troco para:* ${brl(order.change_for)} (troco ${brl(troco)})`);
    } else {
      lines.push(`*Troco:* não precisa`);
    }
  }
  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/?text=${text}`;
}
