export type DiningPaymentMethod =
  | "pix"
  | "cartao_credito"
  | "cartao_debito"
  | "dinheiro"
  | "misto"
  | "nao_informado";

export type DiningAddonSnapshot = {
  id: string;
  addon_id: string | null;
  addon_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
};

export type DiningItemSnapshot = {
  id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  notes: string | null;
  batch_number: number;
  addons: DiningAddonSnapshot[];
};

export type DiningSessionView = {
  id: string;
  customer_name: string | null;
  notes: string | null;
  opened_at: string;
  subtotal: number;
  items: DiningItemSnapshot[];
};

export type DiningTableView = {
  id: string;
  table_number: number;
  is_active: boolean;
  state: "free" | "occupied" | "print_failed";
  session: DiningSessionView | null;
};

export type DiningCatalog = {
  categories: { id: string; name: string; sort_order: number }[];
  products: {
    id: string;
    category_id: string;
    name: string;
    price: number;
    accepts_addons: boolean;
    addon_ids: string[];
  }[];
  addons: { id: string; name: string; price: number }[];
};

export type DiningCartItem = {
  product_id: string;
  quantity: number;
  notes?: string | null;
  addons?: { addon_id: string; quantity: number }[];
};

export function getOpenDiningSessionId(table: DiningTableView | null | undefined) {
  return table?.session?.id ?? null;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateServiceCharge(subtotal: number, percent: number) {
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error("Subtotal inválido.");
  if (!Number.isFinite(percent) || percent < 0 || percent > 30) {
    throw new Error("A taxa de serviço deve ficar entre 0% e 30%.");
  }
  const service = roundCurrency((subtotal * percent) / 100);
  return { service, total: roundCurrency(subtotal + service) };
}

export function canReduceActiveTables(tables: DiningTableView[], nextCount: number) {
  if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > 30) return false;
  return !tables.some(
    (table) => table.table_number > nextCount && table.session?.id && table.state !== "free",
  );
}
