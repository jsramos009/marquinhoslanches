import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import { isHamburgerCategory, menuQueryOptions } from "@/lib/menu";
import {
  createOrder,
  updateOrder,
  getOrderById,
  getCustomerByPhone,
  type OrderChannel,
  type OrderPaymentMethod,
} from "@/lib/orders.functions";
import { ImageIcon, Search, X, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeWhatsappNumber } from "@/lib/order-flow";
import { buildPixPayload } from "@/lib/pix";
import { Copy, Check } from "lucide-react";

type DeliveryFeeOption = { id: string; neighborhood: string; fee: number };

const deliveryFeesQueryOptions = () => ({
  queryKey: ["delivery-fees", "public"],
  queryFn: async (): Promise<DeliveryFeeOption[]> => {
    const { data, error } = await supabase
      .from("delivery_fees")
      .select("id, neighborhood, fee")
      .eq("is_active", true)
      .order("neighborhood", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((d: any) => ({
      id: d.id,
      neighborhood: d.neighborhood,
      fee: Number(d.fee),
    }));
  },
  staleTime: 5 * 60_000,
});

const PIX_KEY_FALLBACK = "+5594991032483";
const PIX_MERCHANT_NAME_FALLBACK = "Marquinhos Lanches";
const PIX_MERCHANT_CITY_FALLBACK = "MARABA";

const pixSettingsQueryOptions = () => ({
  queryKey: ["app-settings", "pix", "public"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["pix_key", "pix_merchant_name", "pix_merchant_city"]);
    if (error) throw error;
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: any) => {
      if (r?.key) map[r.key] = r.value ?? "";
    });
    return {
      pix_key: map.pix_key || PIX_KEY_FALLBACK,
      pix_merchant_name: map.pix_merchant_name || PIX_MERCHANT_NAME_FALLBACK,
      pix_merchant_city: map.pix_merchant_city || PIX_MERCHANT_CITY_FALLBACK,
    };
  },
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/novo-pedido")({
  component: NovoPedidoPage,
  validateSearch: (s: Record<string, unknown>) => ({
    editId: typeof s.editId === "string" && s.editId ? s.editId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Novo pedido — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type DraftItem = {
  key: string;
  product_id: string;
  quantity: number;
  addons: { addon_id: string; quantity: number }[];
  notes?: string;
};

function NovoPedidoPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const { editId } = Route.useSearch();
  const isEditing = Boolean(editId);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const navigate = useNavigate();
  const menu = useQuery(menuQueryOptions());
  const feesQuery = useQuery(deliveryFeesQueryOptions());
  const pixSettingsQuery = useQuery(pixSettingsQueryOptions());
  const create = useServerFn(createOrder);
  const update = useServerFn(updateOrder);
  const fetchOrder = useServerFn(getOrderById);
  const lookupCustomer = useServerFn(getCustomerByPhone);
  const orderQuery = useQuery({
    queryKey: ["order", editId],
    queryFn: () => fetchOrder({ data: { id: editId! } }),
    enabled: isEditing,
    staleTime: 0,
  });
  const mut = useMutation({
    mutationFn: (vars: Parameters<typeof create>[0]) =>
      isEditing
        ? update({ data: { ...(vars as any).data, id: editId! } } as any)
        : create(vars),
    onSuccess: () => {
      try {
        const text = buildCustomerSummary();
        const number = normalizeWhatsappNumber(phone);
        const url = number
          ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
          : `https://wa.me/?text=${encodeURIComponent(text)}`;
        setWaUrl(url);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        // se falhar a abertura, apenas segue
      }
      if (payment === "pix") {
        // Abre modal com QR code — admin fecha depois de enviar ao cliente
        setPixOpen(true);
      } else {
        navigate({ to: "/admin/pedidos" });
      }
    },
  });

  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<OrderChannel>("whatsapp");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [mode, setMode] = useState<"pickup" | "delivery">("pickup");
  const [neighborhoodId, setNeighborhoodId] = useState<string>("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<OrderPaymentMethod>("nao_informado");
  const [changeFor, setChangeFor] = useState<number>(0);
  const [splitPay, setSplitPay] = useState(false);
  const [cashPart, setCashPart] = useState<number>(0);
  const [splitOther, setSplitOther] = useState<OrderPaymentMethod>("pix");
  const [addonDialog, setAddonDialog] = useState<{
    productId: string;
    selected: Set<string>;
  } | null>(null);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixQr, setPixQr] = useState<string>("");
  const [pixCopied, setPixCopied] = useState(false);
  const [waUrl, setWaUrl] = useState<string>("");
  const [preloaded, setPreloaded] = useState(false);
  const [lookupHint, setLookupHint] = useState<string>("");
  const [lastLookupDigits, setLastLookupDigits] = useState<string>("");

  // Busca cliente salvo pelo telefone (nome + endereço + bairro).
  // Só sobrescreve campos vazios para não atrapalhar edição manual.
  useEffect(() => {
    const digits = phone.replace(/\D+/g, "");
    if (digits.length < 8) {
      setLookupHint("");
      setLastLookupDigits("");
      return;
    }
    if (digits === lastLookupDigits) return;
    const handle = setTimeout(async () => {
      try {
        const found = await lookupCustomer({ data: { phone: digits } });
        setLastLookupDigits(digits);
        if (!found) {
          setLookupHint("Cliente novo");
          return;
        }
        let filled: string[] = [];
        if (!customer.trim() && found.customer_name) {
          setCustomer(found.customer_name);
          filled.push("nome");
        }
        if (mode === "delivery") {
          if (!address.trim() && found.delivery_address) {
            setAddress(found.delivery_address);
            filled.push("endereço");
          }
          if (!neighborhoodId && found.delivery_neighborhood) {
            const match = (feesQuery.data ?? []).find(
              (f) =>
                f.neighborhood.toLowerCase() ===
                found.delivery_neighborhood!.toLowerCase(),
            );
            if (match) {
              setNeighborhoodId(match.id);
              filled.push("bairro");
            }
          }
        }
        setLookupHint(
          filled.length
            ? `Cliente encontrado — preenchido: ${filled.join(", ")}`
            : `Cliente encontrado${found.customer_name ? `: ${found.customer_name}` : ""}`,
        );
      } catch {
        /* silencioso */
      }
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, mode, feesQuery.data]);

  // Preload state ao editar — só uma vez, depois de menu e fees carregarem
  useEffect(() => {
    if (!isEditing || preloaded) return;
    if (!orderQuery.data || !menu.data) return;
    const o = orderQuery.data;
    setCustomer(o.customer_name ?? "");
    setPhone(o.customer_phone ?? "");
    setChannel(o.channel);
    setNotes(o.notes ?? "");
    setDiscount(Number(o.discount) || 0);
    setMode(o.delivery_mode);
    setAddress(o.delivery_address ?? "");
    setPayment(o.payment_method);
    setChangeFor(o.change_for != null ? Number(o.change_for) : 0);
    if (o.cash_amount != null && o.secondary_payment_method) {
      setSplitPay(true);
      setCashPart(Number(o.cash_amount));
      setSplitOther(o.secondary_payment_method);
    }
    if (o.delivery_mode === "delivery" && o.delivery_neighborhood) {
      const match = (feesQuery.data ?? []).find(
        (f) => f.neighborhood.toLowerCase() === o.delivery_neighborhood!.toLowerCase(),
      );
      if (match) setNeighborhoodId(match.id);
    }
    const productIds = new Set((menu.data?.products ?? []).map((p) => p.id));
    const drafts: DraftItem[] = o.items
      .filter((it) => it.product_id && productIds.has(it.product_id))
      .map((it) => ({
        key: crypto.randomUUID(),
        product_id: it.product_id as string,
        quantity: it.quantity,
        notes: it.notes ?? "",
        addons: it.addons
          .filter((a) => a.addon_id)
          .map((a) => ({ addon_id: a.addon_id as string, quantity: a.quantity })),
      }));
    setItems(drafts);
    setCustomerOpen(true);
    setPreloaded(true);
  }, [isEditing, preloaded, orderQuery.data, menu.data, feesQuery.data]);

  const products = menu.data?.products ?? [];
  const addons = menu.data?.addons ?? [];
  const deliveryFees = feesQuery.data ?? [];
  const selectedFee =
    deliveryFees.find((f) => f.id === neighborhoodId) ?? null;
  const fee = mode === "delivery" && selectedFee ? selectedFee.fee : 0;
  const hamburgerCategoryIds = useMemo(() => {
    if (!menu.data) return new Set<string>();
    return new Set(
      menu.data.categories
        .filter((c) => isHamburgerCategory(c.slug, c.name))
        .map((c) => c.id),
    );
  }, [menu.data]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const addonMap = useMemo(() => new Map(addons.map((a) => [a.id, a])), [addons]);
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filteredProducts = useMemo(() => {
    const q = norm(search.trim());
    if (!q) return products;
    return products.filter((p) => norm(p.name).includes(q));
  }, [products, search]);
  const groupedProducts = useMemo(() => {
    const cats = menu.data?.categories ?? [];
    const byCat = new Map<string, typeof products>();
    for (const p of filteredProducts) {
      const arr = byCat.get(p.category_id) ?? [];
      arr.push(p);
      byCat.set(p.category_id, arr);
    }
    return cats
      .map((c) => ({ category: c, items: byCat.get(c.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filteredProducts, menu.data?.categories, products]);
  const quantityByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.addons.length === 0) map.set(it.product_id, (map.get(it.product_id) ?? 0) + it.quantity);
    }
    return map;
  }, [items]);
  const productAcceptsAddons = (productId: string) => {
    const p = productMap.get(productId);
    return Boolean(p?.accepts_addons && hamburgerCategoryIds.has(p.category_id));
  };

  const subtotal = items.reduce((sum, it) => {
    const p = productMap.get(it.product_id);
    if (!p) return sum;
    const addonsTotal = productAcceptsAddons(it.product_id) ? it.addons.reduce((s, a) => {
      const ad = addonMap.get(a.addon_id);
      return s + (ad ? ad.price * a.quantity : 0);
    }, 0) : 0;
    return sum + (p.price + addonsTotal) * it.quantity;
  }, 0);
  const total = Math.max(0, subtotal - discount + fee);

  const pixSettings = pixSettingsQuery.data ?? {
    pix_key: PIX_KEY_FALLBACK,
    pix_merchant_name: PIX_MERCHANT_NAME_FALLBACK,
    pix_merchant_city: PIX_MERCHANT_CITY_FALLBACK,
  };
  const pixPayload = useMemo(() => {
    if (payment !== "pix" || total <= 0) return "";
    try {
      return buildPixPayload({
        key: pixSettings.pix_key,
        amount: total,
        merchantName: pixSettings.pix_merchant_name,
        merchantCity: pixSettings.pix_merchant_city,
      });
    } catch {
      return "";
    }
  }, [payment, total, pixSettings.pix_key, pixSettings.pix_merchant_name, pixSettings.pix_merchant_city]);

  useEffect(() => {
    if (!pixOpen || !pixPayload) {
      setPixQr("");
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(pixPayload, { margin: 1, width: 320 }))
      .then((url) => {
        if (!cancelled) setPixQr(url);
      })
      .catch(() => {
        if (!cancelled) setPixQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [pixOpen, pixPayload]);

  async function copyPixCode() {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 1800);
    } catch {
      // noop
    }
  }

  function closePixDialog() {
    setPixOpen(false);
    navigate({ to: "/admin/pedidos" });
  }

  function buildCustomerSummary(): string {
    const payLabel: Record<OrderPaymentMethod, string> = {
      nao_informado: "A combinar",
      dinheiro: "Dinheiro",
      pix: "PIX",
      cartao_debito: "Cartão de Débito",
      cartao_credito: "Cartão de Crédito",
    };
    const lines: string[] = [];
    const header = mode === "delivery"
      ? "*Entrega - Marquinhos Lanches*"
      : "*Retirada - Marquinhos Lanches*";
    lines.push(header);
    lines.push("");
    lines.push(`*Cliente:* ${customer.trim() || "—"}`);
    lines.push(`*Telefone:* ${phone.trim() || "—"}`);
    if (mode === "delivery") {
      lines.push(`*Endereço:* ${address.trim() || "—"}`);
      lines.push(`*Bairro:* ${selectedFee?.neighborhood || "—"}`);
      const mapUrl = address.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [address.trim(), selectedFee?.neighborhood].filter(Boolean).join(", "),
          )}`
        : "";
      lines.push(`*Localização:* ${mapUrl || "—"}`);
    }
    lines.push("");
    lines.push("*Pedido:*");
    items.forEach((it) => {
      const p = productMap.get(it.product_id);
      if (!p) return;
      const addonsTotal = productAcceptsAddons(it.product_id)
        ? it.addons.reduce((s, a) => {
            const ad = addonMap.get(a.addon_id);
            return s + (ad ? ad.price * a.quantity : 0);
          }, 0)
        : 0;
      const lineTotal = (p.price + addonsTotal) * it.quantity;
      lines.push(`${it.quantity} ${p.name} — ${formatBRL(lineTotal)}`);
      if (productAcceptsAddons(it.product_id) && it.addons.length) {
        const names = it.addons
          .map((a) => addonMap.get(a.addon_id)?.name)
          .filter(Boolean)
          .join(", ");
        if (names) lines.push(`    Adicionais: ${names}`);
      }
      if (it.notes && it.notes.trim()) {
        lines.push(`    Obs: ${it.notes.trim()}`);
      }
    });
    lines.push("");
    lines.push(`*Subtotal:* ${formatBRL(subtotal)}`);
    if (discount > 0) lines.push(`*Desconto:* -${formatBRL(discount)}`);
    if (mode === "delivery") lines.push(`*Frete:* ${formatBRL(fee)}`);
    lines.push(`*Total:* ${formatBRL(total)}`);
    lines.push("");
    lines.push(`*Forma de pagamento:* ${payLabel[payment]}`);
    if (payment === "dinheiro" && splitPay) {
      const cash = Math.min(Math.max(0, cashPart), total);
      lines.push(
        `*Dividido:* ${formatBRL(cash)} em dinheiro + ${formatBRL(total - cash)} em ${payLabel[splitOther]}`,
      );
    } else if (payment === "dinheiro") {
      if (changeFor > total) {
        lines.push(`*Troco para:* ${formatBRL(changeFor)} (troco ${formatBRL(changeFor - total)})`);
      } else {
        lines.push(`*Troco:* Não precisa`);
      }
    }
    if (notes.trim()) {
      lines.push("");
      lines.push(`*Observações:* ${notes.trim()}`);
    }
    return lines.join("\n");
  }

  function addProduct(productId: string) {
    if (!productId) return;
    if (productAcceptsAddons(productId)) {
      setAddonDialog({ productId, selected: new Set() });
      return;
    }
    setItems((prev) => {
      const simpleIndex = prev.findIndex(
        (it) => it.product_id === productId && it.addons.length === 0,
      );
      if (simpleIndex >= 0) {
        const next = [...prev];
        next[simpleIndex] = { ...next[simpleIndex], quantity: next[simpleIndex].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        { key: crypto.randomUUID(), product_id: productId, quantity: 1, addons: [] },
      ];
    });
  }

  function confirmAddonDialog(withAddons: boolean) {
    if (!addonDialog) return;
    const { productId, selected } = addonDialog;
    const chosen = withAddons
      ? Array.from(selected).map((addon_id) => ({ addon_id, quantity: 1 }))
      : [];
    setItems((prev) => {
      if (chosen.length === 0) {
        const idx = prev.findIndex(
          (it) => it.product_id === productId && it.addons.length === 0,
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
          return next;
        }
      }
      return [
        ...prev,
        { key: crypto.randomUUID(), product_id: productId, quantity: 1, addons: chosen },
      ];
    });
    setAddonDialog(null);
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    if (mode === "delivery" && deliveryFees.length > 0 && !neighborhoodId) return;
    const generalNotes = notes.trim() || null;
    mut.mutate({
      data: {
        customer_name: customer.trim() || null,
        customer_phone: phone.trim() || null,
        channel,
        notes: generalNotes,
        discount,
        delivery_mode: mode,
        delivery_fee: fee,
        delivery_address: mode === "delivery" ? address.trim() || null : null,
        delivery_neighborhood:
          mode === "delivery" && selectedFee ? selectedFee.neighborhood : null,
        payment_method: payment,
        change_for:
          payment === "dinheiro" && !splitPay && changeFor > total ? changeFor : null,
        cash_amount:
          payment === "dinheiro" && splitPay
            ? Math.min(Math.max(0, cashPart), total)
            : null,
        secondary_payment_method:
          payment === "dinheiro" && splitPay ? splitOther : null,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          notes: it.notes?.trim() || null,
          addons: productAcceptsAddons(it.product_id) ? it.addons : [],
        })),
      },
    });
  }

  return (
    <AdminShell user={user} roles={roles} title={isEditing ? "Editar pedido" : "Novo pedido"}>
      {isEditing && orderQuery.isLoading && (
        <p className="mb-3 text-sm text-muted-foreground">Carregando pedido…</p>
      )}
      {isEditing && orderQuery.error && (
        <p className="mb-3 text-sm text-destructive">
          {(orderQuery.error as Error).message}
        </p>
      )}
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Modo de entrega — primeiro passo, decide o restante */}
          <div className="grid grid-cols-2 gap-2">
            {(["pickup", "delivery"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                  mode === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/50",
                ].join(" ")}
              >
                {m === "pickup" ? "Balcão / Retirada" : "Entrega"}
              </button>
            ))}
          </div>

          {/* Cliente / telefone / canal recolhíveis */}
          <details
            open={customerOpen || mode === "delivery"}
            onToggle={(e) => setCustomerOpen((e.target as HTMLDetailsElement).open)}
            className="rounded-xl border border-border bg-card/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>
                Cliente
                {customer.trim() ? <span className="ml-2 font-normal text-muted-foreground">— {customer.trim()}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {mode === "delivery" ? "obrigatório" : "opcional"}
              </span>
            </summary>
            <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
              <Field label={mode === "delivery" ? "Nome do cliente" : "Cliente (opcional)"}>
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label={mode === "delivery" ? "Telefone / WhatsApp" : "Telefone (opcional)"}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                {lookupHint && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{lookupHint}</p>
                )}
              </Field>
              <Field label="Canal">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as OrderChannel)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="balcao">Balcão</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telefone">Telefone</option>
                  <option value="outro">Outro</option>
                </select>
              </Field>
            </div>
          </details>

          {mode === "delivery" && (
            <div className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
              <Field label="Bairro (frete)">
                {feesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Carregando bairros…</p>
                ) : deliveryFees.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum bairro cadastrado. Cadastre em Frete.
                  </p>
                ) : (
                  <select
                    value={neighborhoodId}
                    onChange={(e) => setNeighborhoodId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione o bairro…</option>
                    {deliveryFees.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.neighborhood} — {formatBRL(d.fee)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Endereço de entrega">
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Rua, número, ponto de referência"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          )}

          <Field label="Buscar e adicionar produto">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Digite o nome do produto…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </Field>

          <div className="space-y-5">
            {groupedProducts.map((g) => (
              <section key={g.category.id}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{g.category.name}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                    {g.items.length}
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {g.items.map((p) => {
                    const qty = quantityByProduct.get(p.id) ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p.id)}
                        className="group relative flex flex-col items-center rounded-xl border border-border bg-card p-3 text-center transition hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <div className="mb-2 grid h-16 w-16 place-items-center rounded-lg bg-secondary text-primary">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              loading="lazy"
                              decoding="async"
                              width={64}
                              height={64}
                              className="h-16 w-16 rounded-lg object-cover"
                            />
                          ) : (
                            <ImageIcon size={24} />
                          )}
                        </div>
                        <p className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
                          {p.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatBRL(p.price)}</p>
                        {qty > 0 && (
                          <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                            {qty}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {search && filteredProducts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Nenhum produto encontrado para “{search}”.
            </p>
          )}
          {!search && filteredProducts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Nenhum produto ativo no cardápio.
            </p>
          )}

          <Field label="Observações">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Sem cebola, ponto da carne, etc."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <aside className="space-y-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <h2 className="text-sm font-semibold">Resumo do pedido</h2>
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Nenhum item ainda. Adicione um produto ao lado.
              </p>
            )}
            {items.map((it) => {
              const p = productMap.get(it.product_id);
              if (!p) return null;
              return (
                <div key={it.key} className="rounded-lg border border-border bg-background/60 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatBRL(p.price)} un</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remover"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background">
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(it.key, {
                            quantity: Math.max(1, it.quantity - 1),
                          })
                        }
                        className="grid h-7 w-7 place-items-center rounded-l-lg text-foreground hover:bg-secondary"
                        aria-label="Diminuir"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{it.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(it.key, { quantity: it.quantity + 1 })
                        }
                        className="grid h-7 w-7 place-items-center rounded-r-lg text-foreground hover:bg-secondary"
                        aria-label="Aumentar"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="text-xs font-semibold">
                      {formatBRL(p.price * it.quantity)}
                    </span>
                  </div>
                  {productAcceptsAddons(p.id) && it.addons.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      +{" "}
                      {it.addons
                        .map((x) => addonMap.get(x.addon_id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  <textarea
                    value={it.notes ?? ""}
                    onChange={(e) => updateItem(it.key, { notes: e.target.value })}
                    rows={2}
                    placeholder="Observação deste lanche (ex: sem cebola, ponto da carne)"
                    className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"
                  />
                </div>
              );
            })}
          </div>
          <div className="border-t border-border pt-3" />
          <Row label="Subtotal" value={formatBRL(subtotal)} />
          {mode === "delivery" && fee > 0 && (
            <Row label={`Frete${selectedFee ? ` (${selectedFee.neighborhood})` : ""}`} value={formatBRL(fee)} />
          )}
          <div>
            <label className="text-xs text-muted-foreground">Desconto (R$)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Pagamento</label>
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value as OrderPaymentMethod)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="nao_informado">Não informado</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao_debito">Cartão débito</option>
              <option value="cartao_credito">Cartão crédito</option>
            </select>
          </div>
          {payment === "dinheiro" && (
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={splitPay}
                  onChange={(e) => setSplitPay(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Dividir pagamento (parte em dinheiro)
              </label>
              {splitPay ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Valor em dinheiro (R$)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={cashPart || ""}
                      onChange={(e) =>
                        setCashPart(Math.max(0, Number(e.target.value) || 0))
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Restante em
                    </label>
                    <select
                      value={splitOther}
                      onChange={(e) =>
                        setSplitOther(e.target.value as OrderPaymentMethod)
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="pix">PIX</option>
                      <option value="cartao_debito">Cartão débito</option>
                      <option value="cartao_credito">Cartão crédito</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Restante: {formatBRL(Math.max(0, total - Math.min(Math.max(0, cashPart), total)))}
                  </p>
                </div>
              ) : (
                <>
              <label className="text-xs text-muted-foreground">Troco para (R$)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={changeFor || ""}
                onChange={(e) => setChangeFor(Math.max(0, Number(e.target.value) || 0))}
                placeholder="Deixe em branco se não precisa"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {changeFor > total && (
                <p className="mt-1 text-xs text-muted-foreground">Troco: {formatBRL(changeFor - total)}</p>
              )}
                </>
              )}
            </div>
          )}
          <Row label="Total" value={formatBRL(total)} bold />
          <button
            type="submit"
            disabled={mut.isPending || items.length === 0}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mut.isPending
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações e enviar WhatsApp"
                : "Lançar e enviar WhatsApp"}
          </button>
          <p className="text-[11px] text-muted-foreground">
            Ao {isEditing ? "salvar" : "lançar"}, abrimos o WhatsApp do cliente com o resumo completo do pedido.
          </p>
          {mut.error && (
            <p className="text-xs text-destructive">{(mut.error as Error).message}</p>
          )}
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/pedidos" })}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </aside>
      </form>
      {addonDialog && (() => {
        const p = productMap.get(addonDialog.productId);
        if (!p) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            onClick={() => setAddonDialog(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Adicionar
                  </p>
                  <h3 className="truncate text-base font-semibold">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Deseja incluir algum adicional?
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddonDialog(null)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
              {addons.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  Nenhum adicional cadastrado.
                </p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {addons.map((a) => {
                    const checked = addonDialog.selected.has(a.id);
                    return (
                      <label
                        key={a.id}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setAddonDialog((prev) => {
                                if (!prev) return prev;
                                const next = new Set(prev.selected);
                                if (next.has(a.id)) next.delete(a.id);
                                else next.add(a.id);
                                return { ...prev, selected: next };
                              });
                            }}
                            className="h-4 w-4 accent-primary"
                          />
                          <span>{a.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          + {formatBRL(a.price)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => confirmAddonDialog(false)}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Sem adicional
                </button>
                <button
                  type="button"
                  onClick={() => confirmAddonDialog(true)}
                  disabled={addonDialog.selected.size === 0}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Adicionar com {addonDialog.selected.size} adicional
                  {addonDialog.selected.size === 1 ? "" : "is"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {pixOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={closePixDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento PIX</p>
                <h3 className="truncate text-base font-semibold">Envie ao cliente</h3>
                <p className="text-xs text-muted-foreground">
                  Valor: <span className="font-semibold text-foreground">{formatBRL(total)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closePixDialog}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col items-center gap-3">
              {pixQr ? (
                <img
                  src={pixQr}
                  alt="QR Code PIX"
                  width={240}
                  height={240}
                  className="h-60 w-60 rounded-lg border border-border bg-white p-2"
                />
              ) : (
                <div className="grid h-60 w-60 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  Gerando QR…
                </div>
              )}
              <textarea
                readOnly
                value={pixPayload}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={copyPixCode}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {pixCopied ? <Check size={16} /> : <Copy size={16} />}
                {pixCopied ? "Copiado!" : "Copiar código PIX"}
              </button>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:border-primary/50"
                >
                  Abrir WhatsApp do cliente
                </a>
              )}
              <button
                type="button"
                onClick={closePixDialog}
                className="w-full rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Concluir e voltar aos pedidos
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-display text-xl text-primary" : "font-mono"}>{value}</span>
    </div>
  );
}