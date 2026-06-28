import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import { isHamburgerCategory, menuQueryOptions } from "@/lib/menu";
import { createOrder, type OrderChannel } from "@/lib/orders.functions";
import { ImageIcon, Search, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/novo-pedido")({
  component: NovoPedidoPage,
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
};

function NovoPedidoPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const navigate = useNavigate();
  const menu = useQuery(menuQueryOptions());
  const create = useServerFn(createOrder);
  const mut = useMutation({
    mutationFn: create,
    onSuccess: () => navigate({ to: "/admin/pedidos" }),
  });

  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<OrderChannel>("whatsapp");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState("");

  const products = menu.data?.products ?? [];
  const addons = menu.data?.addons ?? [];
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
  const total = Math.max(0, subtotal - discount);

  function addProduct(productId: string) {
    if (!productId) return;
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

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function toggleAddon(key: string, addonId: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const has = it.addons.find((a) => a.addon_id === addonId);
        return {
          ...it,
          addons: has
            ? it.addons.filter((a) => a.addon_id !== addonId)
            : [...it.addons, { addon_id: addonId, quantity: 1 }],
        };
      }),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    mut.mutate({
      data: {
        customer_name: customer.trim() || null,
        customer_phone: phone.trim() || null,
        channel,
        notes: notes.trim() || null,
        discount,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity,
          addons: productAcceptsAddons(it.product_id) ? it.addons : [],
        })),
      },
    });
  }

  return (
    <AdminShell user={user} roles={roles} title="Novo pedido">
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Cliente (opcional)">
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Nome do cliente"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Canal">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as OrderChannel)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="balcao">Balcão</option>
                <option value="telefone">Telefone</option>
                <option value="outro">Outro</option>
              </select>
            </Field>
          </div>

          <Field label="Adicionar produto">
            <select
              value=""
              onChange={(e) => {
                addProduct(e.target.value);
                e.currentTarget.value = "";
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={!menu.data}
            >
              <option value="">— escolha um produto —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatBRL(p.price)}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-2">
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhum item ainda. Adicione um produto acima.
              </p>
            )}
            {items.map((it) => {
              const p = productMap.get(it.product_id);
              if (!p) return null;
              return (
                <div key={it.key} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBRL(p.price)} un</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(it.key, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(it.key)}
                        className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {productAcceptsAddons(p.id) && addons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {addons.map((a) => {
                        const active = it.addons.some((x) => x.addon_id === a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAddon(it.key, a.id)}
                            className={`rounded-full px-2.5 py-1 text-xs ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-card text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {a.name} {formatBRL(a.price)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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

        <aside className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Resumo</h2>
          <Row label="Subtotal" value={formatBRL(subtotal)} />
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
          <Row label="Total" value={formatBRL(total)} bold />
          <button
            type="submit"
            disabled={mut.isPending || items.length === 0}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mut.isPending ? "Salvando…" : "Lançar pedido"}
          </button>
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