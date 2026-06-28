import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Minus, Plus, ShoppingBag, Trash2, X, MapPin, Phone, Clock } from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";
import { menuQueryOptions, formatBRL, isHamburgerCategory, type Product, type Addon } from "@/lib/menu";

const WHATSAPP_NUMBER = "5594991032483";
const WHATSAPP_DISPLAY = "(94) 99103-2483";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Marquinhos Lanches — Cardápio Digital" },
      {
        name: "description",
        content:
          "Cardápio digital da Marquinhos Lanches: hambúrgueres especiais, tradicionais, hot dogs e bebidas. Peça pelo WhatsApp.",
      },
      { property: "og:title", content: "Marquinhos Lanches — Cardápio Digital" },
      {
        property: "og:description",
        content: "Hambúrgueres artesanais, hot dogs e bebidas. Peça já!",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(menuQueryOptions()),
  component: MenuPage,
});

type CartLine = {
  lineId: string;
  product: Product;
  qty: number;
  addons: Addon[];
  notes: string;
  unitPrice: number; // product + addons sum
};

function MenuPage() {
  const { data } = useSuspenseQuery(menuQueryOptions());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const beveragesCategoryId = useMemo(
    () => data?.categories.find((c) => c.slug === "bebidas")?.id ?? null,
    [data],
  );
  const suggestedBeverages = useMemo(() => {
    if (!data) return [];
    return data.products
      .filter((p) => p.suggestion_order != null)
      .sort((a, b) => (a.suggestion_order ?? 0) - (b.suggestion_order ?? 0))
      .slice(0, 3);
  }, [data]);
  const hamburgerCategoryIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      data.categories
        .filter((c) => isHamburgerCategory(c.slug, c.name))
        .map((c) => c.id),
    );
  }, [data]);

  const productsByCat = useMemo(() => {
    const m: Record<string, Product[]> = {};
    if (!data) return m;
    for (const c of data.categories) m[c.id] = [];
    for (const p of data.products) (m[p.category_id] ??= []).push(p);
    return m;
  }, [data]);

  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const totalPrice = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const productAcceptsAddons = (product: Product) =>
    product.accepts_addons && hamburgerCategoryIds.has(product.category_id);

  // Reset suggestion dismissal when cart is emptied (new order)
  useEffect(() => {
    if (cart.length === 0 && suggestionDismissed) setSuggestionDismissed(false);
  }, [cart.length, suggestionDismissed]);

  // Scroll spy for sticky categories
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (!data) return;
    if (!activeCat && data.categories[0]) setActiveCat(data.categories[0].slug);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveCat(visible.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [data, activeCat]);

  const scrollToCat = (slug: string) => {
    const el = sectionRefs.current[slug];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const addToCart = (
    product: Product,
    addons: Addon[],
    qty: number,
    notes: string,
  ) => {
    const unitPrice =
      Number(product.price) + addons.reduce((s, a) => s + Number(a.price), 0);
    const lineId =
      product.id + ":" + addons.map((a) => a.id).sort().join(",") + ":" + notes;
    setCart((prev) => {
      const existing = prev.find((l) => l.lineId === lineId);
      return existing
        ? prev.map((l) =>
            l.lineId === lineId ? { ...l, qty: l.qty + qty } : l,
          )
        : [...prev, { lineId, product, qty, addons, notes, unitPrice }];
    });

    // Cross-sell: suggest a beverage if a food (accepts_addons) was added
    // and the cart has no beverage yet. `cart` here is the closure value
    // (pre-add), which is exactly what we need to check.
    if (
      productAcceptsAddons(product) &&
      beveragesCategoryId &&
      suggestedBeverages.length > 0 &&
      !suggestionDismissed
    ) {
      const alreadyHasBeverage = cart.some(
        (l) => l.product.category_id === beveragesCategoryId,
      );
      if (!alreadyHasBeverage) {
        setTimeout(() => setSuggestionOpen(true), 150);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <BrandHeader />

      <nav className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <ul className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {data.categories.map((c) => {
              const active = activeCat === c.slug;
              return (
                <li key={c.id} className="shrink-0">
                  <button
                    onClick={() => scrollToCat(c.slug)}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors min-h-11",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground/80 hover:bg-secondary hover:text-secondary-foreground",
                    ].join(" ")}
                  >
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {data.categories.map((c) => {
          const prods = productsByCat[c.id] ?? [];
          if (!prods.length) return null;
          return (
            <section
              key={c.id}
              id={c.slug}
              ref={(el) => {
                sectionRefs.current[c.slug] = el;
              }}
              className="mb-10 scroll-mt-24"
            >
              <div
                className="mb-4 rounded-xl border border-primary/40 px-5 py-3 text-center shadow-[var(--shadow-brand)]"
                style={{ background: "var(--gradient-red)" }}
              >
                <h2 className="font-display text-xl uppercase tracking-[0.18em] text-primary sm:text-2xl">
                  {c.name}
                </h2>
              </div>
              <div className="space-y-3">
                {prods.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onClick={() => setOpenProduct(p)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <FooterInfo />
      </main>

      {totalQty > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl items-center justify-between gap-3 border-t-2 border-primary bg-secondary px-4 py-3 text-secondary-foreground shadow-[0_-8px_24px_rgba(0,0,0,0.4)]"
        >
          <span className="flex items-center gap-2 font-display text-lg">
            <ShoppingBag className="h-5 w-5" />
            {totalQty} {totalQty === 1 ? "item" : "itens"}
          </span>
          <span className="font-display text-xl text-primary">
            {formatBRL(totalPrice)}
          </span>
          <span className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            Ver pedido
          </span>
        </button>
      )}

      {openProduct && (
        <ProductDialog
          product={openProduct}
          addons={data.addons}
          canUseAddons={productAcceptsAddons(openProduct)}
          onClose={() => setOpenProduct(null)}
          onConfirm={(addons, qty, notes) => {
            addToCart(openProduct, addons, qty, notes);
            setOpenProduct(null);
          }}
        />
      )}

      {cartOpen && (
        <CartDialog
          cart={cart}
          setCart={setCart}
          totalPrice={totalPrice}
          onClose={() => setCartOpen(false)}
        />
      )}

      {suggestionOpen && (
        <BeverageSuggestionSheet
          beverages={suggestedBeverages}
          onAdd={(bev) => {
            addToCart(bev, [], 1, "");
            setSuggestionOpen(false);
          }}
          onDismiss={() => {
            setSuggestionDismissed(true);
            setSuggestionOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BrandHeader() {
  return (
    <header
      className="relative overflow-hidden border-b-4 border-primary"
      style={{ background: "var(--gradient-red)" }}
    >
      <div className="absolute inset-y-0 left-0 w-3 bg-primary/70" />
      <div className="mx-auto flex max-w-3xl items-center gap-5 px-5 py-8">
        <img
          src={logoAsset.url}
          alt="Marquinhos Lanches"
          className="h-40 w-auto shrink-0 object-contain sm:h-52"
        />
        <div className="min-w-0">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary/90">
            Cardápio Digital
          </p>
          <h1 className="truncate font-display text-3xl text-primary sm:text-4xl">
            Marquinhos Lanches
          </h1>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cream hover:text-primary"
          >
            <Phone className="h-3.5 w-3.5" /> {WHATSAPP_DISPLAY}
          </a>
        </div>
      </div>
    </header>
  );
}

function ProductCard({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group grid w-full grid-cols-[auto_minmax(0,1fr)] items-stretch gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 active:scale-[0.99]"
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-28">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/30 text-2xl">
            🍔
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <h3 className="font-display text-lg text-primary">{product.name}</h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {product.description}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="font-display text-xl text-foreground">
            {formatBRL(product.price)}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Pedir
          </span>
        </div>
      </div>
    </button>
  );
}

function ProductDialog({
  product,
  addons,
  canUseAddons,
  onClose,
  onConfirm,
}: {
  product: Product;
  addons: Addon[];
  canUseAddons: boolean;
  onClose: () => void;
  onConfirm: (addons: Addon[], qty: number, notes: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");

  const pickedAddons = canUseAddons ? addons.filter((a) => picked.has(a.id)) : [];
  const unit =
    Number(product.price) +
    pickedAddons.reduce((s, a) => s + Number(a.price), 0);
  const total = unit * qty;

  const toggle = (id: string) => {
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <Sheet onClose={onClose} title={product.name}>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}
        <p className="mt-2 font-display text-2xl text-primary">
          {formatBRL(product.price)}
        </p>

        {canUseAddons && addons.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-display text-lg text-foreground">
              Adicionais
            </h4>
            <ul className="flex flex-wrap gap-2.5 pt-1 pb-2">
              {addons.map((a) => {
                const on = picked.has(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => toggle(a.id)}
                      aria-pressed={on}
                      className={[
                        "addon-chip addon-chip-hover",
                        on ? "addon-chip-on" : "",
                      ].join(" ")}
                    >
                      <span className={["addon-knob", on ? "addon-knob-on" : ""].join(" ")}>
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span>{a.name}</span>
                      <span
                        className={[
                          "ml-1 rounded-full px-2 py-0.5 text-xs font-bold",
                          on
                            ? "bg-black/15 text-primary-foreground"
                            : "bg-primary/15 text-primary",
                        ].join(" ")}
                      >
                        +{formatBRL(a.price)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6">
          <label className="mb-2 block text-sm font-semibold">
            Observações
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: sem cebola, ponto da carne..."
            rows={2}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="border-t border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background p-1">
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-secondary"
              aria-label="Diminuir"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-8 text-center font-display text-lg">{qty}</span>
            <button
              onClick={() => setQty(qty + 1)}
              className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-secondary"
              aria-label="Aumentar"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => onConfirm(canUseAddons ? pickedAddons : [], qty, notes.trim())}
            className="flex flex-1 items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <span className="font-display text-base uppercase tracking-wide">
              Adicionar
            </span>
            <span className="font-display text-lg">{formatBRL(total)}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function CartDialog({
  cart,
  setCart,
  totalPrice,
  onClose,
}: {
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  totalPrice: number;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [address, setAddress] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  type PayMethod = "pix" | "cartao_credito" | "cartao_debito" | "dinheiro";
  const [payment, setPayment] = useState<PayMethod | null>(null);
  const [changeFor, setChangeFor] = useState<string>("");

  const updateQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.lineId === lineId ? { ...l, qty: Math.max(0, l.qty + delta) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  };
  const remove = (lineId: string) =>
    setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  const buildMessage = () => {
    const lines: string[] = [];
    lines.push("*Novo pedido — Marquinhos Lanches*");
    lines.push("");
    lines.push(`*Cliente:* ${name || "—"}`);
    if (phone) lines.push(`*Telefone:* ${phone}`);
    lines.push(`*Modo:* ${mode === "delivery" ? "Entrega" : "Retirada no local"}`);
    if (mode === "delivery" && address)
      lines.push(`*Endereço:* ${address}`);
    lines.push("");
    lines.push("*Itens:*");
    for (const l of cart) {
      lines.push(`• ${l.qty}x ${l.product.name} — ${formatBRL(l.unitPrice * l.qty)}`);
      if (l.addons.length)
        lines.push(`   Adicionais: ${l.addons.map((a) => a.name).join(", ")}`);
      if (l.notes) lines.push(`   Obs.: ${l.notes}`);
    }
    lines.push("");
    lines.push(`*Total: ${formatBRL(totalPrice)}*`);
    if (payment) {
      const label: Record<PayMethod, string> = {
        pix: "PIX",
        cartao_credito: "Cartão de Crédito",
        cartao_debito: "Cartão de Débito",
        dinheiro: "Dinheiro",
      };
      lines.push(`*Pagamento:* ${label[payment]}`);
      if (payment === "dinheiro") {
        const v = Number(changeFor.replace(",", "."));
        if (v > 0 && v >= totalPrice) {
          lines.push(`*Troco para:* ${formatBRL(v)} (troco ${formatBRL(v - totalPrice)})`);
        } else {
          lines.push(`*Troco:* Não precisa`);
        }
      }
    }
    if (orderNotes) {
      lines.push("");
      lines.push(`*Observações gerais:* ${orderNotes}`);
    }
    return lines.join("\n");
  };

  const canSubmit =
    cart.length > 0 &&
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    payment !== null &&
    (mode === "pickup" || address.trim().length > 0);

  const submit = () => {
    const msg = encodeURIComponent(buildMessage());
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");
  };

  return (
    <Sheet onClose={onClose} title="Seu pedido">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {cart.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            Seu carrinho está vazio.
          </p>
        ) : (
          <ul className="space-y-3">
            {cart.map((l) => (
              <li
                key={l.lineId}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-base text-primary">
                      {l.product.name}
                    </p>
                    {l.addons.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        + {l.addons.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    {l.notes && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        “{l.notes}”
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(l.lineId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1 rounded-full border border-border">
                    <button
                      onClick={() => updateQty(l.lineId, -1)}
                      className="grid h-9 w-9 place-items-center text-foreground hover:bg-secondary"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-6 text-center font-semibold">
                      {l.qty}
                    </span>
                    <button
                      onClick={() => updateQty(l.lineId, +1)}
                      className="grid h-9 w-9 place-items-center text-foreground hover:bg-secondary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-display text-lg text-foreground">
                    {formatBRL(l.unitPrice * l.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {cart.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="font-display text-lg text-primary">Seus dados</h3>
            <Field label="Nome">
              <input
                className="cart-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como podemos te chamar?"
              />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input
                className="cart-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </Field>
            <Field label="Entrega ou retirada?">
              <div className="grid grid-cols-2 gap-2">
                {(["delivery", "pickup"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={[
                      "min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                      mode === m
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:border-primary/50",
                    ].join(" ")}
                  >
                    {m === "delivery" ? "Entrega" : "Retirar no local"}
                  </button>
                ))}
              </div>
            </Field>
            {mode === "delivery" && (
              <Field label="Endereço de entrega">
                <textarea
                  className="cart-input"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, número, bairro, ponto de referência"
                />
              </Field>
            )}
            <Field label="Como vai pagar?">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "pix", label: "PIX" },
                    { id: "cartao_credito", label: "Crédito" },
                    { id: "cartao_debito", label: "Débito" },
                    { id: "dinheiro", label: "Dinheiro" },
                  ] as const
                ).map((opt) => {
                  const on = payment === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPayment(opt.id)}
                      aria-pressed={on}
                      className={[
                        "addon-chip addon-chip-hover justify-center text-sm",
                        on ? "addon-chip-on" : "",
                      ].join(" ")}
                    >
                      <span className={["addon-knob", on ? "addon-knob-on" : ""].join(" ")}>
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {payment === "dinheiro" && (
                <div className="mt-3">
                  <input
                    className="cart-input"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    placeholder="Precisa de troco pra quanto? (deixe vazio se não precisar)"
                    inputMode="decimal"
                  />
                </div>
              )}
            </Field>
            <Field label="Observações do pedido">
              <textarea
                className="cart-input"
                rows={2}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Algo a mais que devemos saber?"
              />
            </Field>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-border bg-card px-5 py-4">
          <div className="mb-3 flex items-center justify-between font-display text-lg">
            <span>Total</span>
            <span className="text-primary">{formatBRL(totalPrice)}</span>
          </div>
          <button
            disabled={!canSubmit}
            onClick={submit}
            className="w-full rounded-xl bg-primary px-4 py-3 font-display text-lg uppercase tracking-wide text-primary-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar pedido pelo WhatsApp
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Você será redirecionado para o WhatsApp para confirmar com a loja.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="sheet-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet-panel-in flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-background shadow-[var(--shadow-brand)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-xl text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-secondary"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FooterInfo() {
  return (
    <footer className="mt-12 rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-xl text-primary">Marquinhos Lanches</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Hamburgueria de bairro. Preparado na hora, com capricho.
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:text-primary"
          >
            {WHATSAPP_DISPLAY}
          </a>
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4 text-primary" />
          Aberto todos os dias — confira o horário pelo WhatsApp
        </li>
        <li className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          Entrega na região
        </li>
      </ul>
    </footer>
  );
}

function BeverageSuggestionSheet({
  beverages,
  onAdd,
  onDismiss,
}: {
  beverages: Product[];
  onAdd: (bev: Product) => void;
  onDismiss: () => void;
}) {
  const [pressedId, setPressedId] = useState<string | null>(null);
  const handlePick = (b: Product) => {
    if (pressedId) return;
    setPressedId(b.id);
    setTimeout(() => onAdd(b), 260);
  };
  return (
    <Sheet onClose={onDismiss} title="Vai querer uma bebida?">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Que tal completar seu pedido com uma bebida gelada?
        </p>
        <ul className="mt-4 space-y-2">
          {beverages.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => handlePick(b)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:border-primary/60 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/30 text-xl">
                    {b.image_url ? (
                      <img
                        src={b.image_url}
                        alt={b.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      "🥤"
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base text-primary">
                      {b.name}
                    </p>
                    <p className="text-sm text-foreground">
                      {formatBRL(b.price)}
                    </p>
                  </div>
                </div>
                <span
                  className={[
                    "addon-chip addon-chip-hover text-xs uppercase tracking-wide",
                    pressedId === b.id ? "addon-chip-on" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "addon-knob",
                      pressedId === b.id ? "addon-knob-on" : "",
                    ].join(" ")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  Pedir
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border bg-card px-5 py-4">
        <button
          onClick={onDismiss}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 font-semibold text-foreground hover:bg-secondary"
        >
          Não, obrigado
        </button>
      </div>
    </Sheet>
  );
}
