import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import {
  getDashboardMetrics,
  listRecentOrders,
  updateOrderStatus,
  type DashboardMetrics,
  type OrderStatus,
  type OrderRow,
} from "@/lib/orders.functions";
import { ThermalReceipt } from "@/components/admin/ThermalReceipt";
import { Printer, MessageCircle, Check, Bike } from "lucide-react";
import { useNewOrderAlert } from "@/hooks/use-new-order-alert";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { useQueryClient } from "@tanstack/react-query";
import {
  FLOW_STATUS_LABEL,
  FLOW_STATUS_BADGE,
  PAY_LABEL,
  nextActionFor,
  buildWhatsAppLink,
  whatsappTemplateFor,
} from "@/lib/order-flow";
import { useWhatsappTemplates } from "@/lib/wa-templates";

const PAY_LABEL_FULL: Record<OrderRow["payment_method"], string> = {
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  nao_informado: "Não informado",
};

function extractDeliveryAddress(order: OrderRow): string | null {
  if (!order.notes) return null;
  const m = order.notes.match(/Entrega:\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}

function buildMotoboyLink(order: OrderRow): string {
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const address = extractDeliveryAddress(order);
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
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    lines.push(`*Localização:* ${mapUrl}`);
  }
  if (order.delivery_neighborhood)
    lines.push(`*Bairro:* ${order.delivery_neighborhood}`);
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

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const RANGES: { id: "today" | "7d" | "30d" | "mtd"; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mtd", label: "Mês" },
];

const STATUS_ORDER: OrderStatus[] = ["recebido", "em_producao", "pronto", "entregue", "cancelado"];
const STATUS_LABEL = FLOW_STATUS_LABEL;
const STATUS_BADGE = FLOW_STATUS_BADGE;

function pct(curr: number, prev: number) {
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function fmtPct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function fmtDuration(sec: number | null) {
  if (!sec || sec < 0) return "—";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function DashboardPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const [range, setRange] = useState<"today" | "7d" | "30d" | "mtd">("7d");
  const fetcher = useServerFn(getDashboardMetrics);
  const q = useQuery<DashboardMetrics>({
    queryKey: ["dashboard-metrics", range],
    queryFn: () => fetcher({ data: { range } }),
    refetchInterval: 60_000,
  });

  const m = q.data;
  const revDelta = m ? pct(Number(m.revenue), Number(m.prev_revenue)) : 0;
  const ordDelta = m ? pct(m.orders, m.prev_orders) : 0;
  const statusMap = new Map((m?.status_counts ?? []).map((s) => [s.status, s.n]));

  return (
    <AdminShell
      user={user}
      roles={roles}
      title="Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/admin/novo-pedido"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + Lançar pedido
          </Link>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  range === r.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Pedidos do dia carregam imediatamente, sem esperar os gráficos. */}
        <TodayOrdersGrid />

        {q.isLoading && <MetricsLoading />}
        {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

        {m && (
          <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Faturamento"
              value={formatBRL(Number(m.revenue))}
              delta={revDelta}
              hint={`vs ${formatBRL(Number(m.prev_revenue))}`}
            />
            <Kpi
              label="Pedidos"
              value={String(m.orders)}
              delta={ordDelta}
              hint={`vs ${m.prev_orders}`}
            />
            <Kpi
              label="Ticket médio"
              value={formatBRL(Number(m.avg_ticket))}
              hint=" "
            />
            <Kpi
              label="Tempo médio de preparo"
              value={fmtDuration(m.avg_prep_seconds)}
              hint={`Entrega: ${fmtDuration(m.avg_deliver_seconds)}`}
            />
          </div>

            <Card title="Faturamento por dia">
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <LineChart data={m.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--foreground)",
                      }}
                      formatter={(v: number) => formatBRL(Number(v))}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "var(--primary)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {m.series.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">Sem vendas no período.</p>
              )}
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Funil de status">
                <div className="space-y-2">
                  {STATUS_ORDER.map((s) => {
                    const n = statusMap.get(s) ?? 0;
                    const max = Math.max(
                      1,
                      ...STATUS_ORDER.map((x) => statusMap.get(x) ?? 0),
                    );
                    const w = (n / max) * 100;
                    return (
                      <div key={s}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                          <span className="font-mono text-foreground">{n}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className={`h-full rounded-full ${
                              s === "cancelado" ? "bg-destructive" : "bg-primary"
                            }`}
                            style={{ width: `${w}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Top produtos (receita)">
                {m.top_products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer>
                      <BarChart
                        data={m.top_products.slice(0, 8)}
                        layout="vertical"
                        margin={{ top: 0, right: 10, left: 8, bottom: 0 }}
                      >
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                          width={110}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            color: "var(--foreground)",
                          }}
                          formatter={(v: number) => formatBRL(Number(v))}
                        />
                        <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            <Card
              title="Produtos parados no período"
              subtitle="Cadastrados como ativos mas sem nenhuma venda."
            >
              {m.idle_products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tudo girando — nenhum produto ativo sem venda.
                </p>
              ) : (
                <ul className="grid gap-1 md:grid-cols-2">
                  {m.idle_products.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-card/60 px-3 py-2 text-sm"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatBRL(Number(p.price))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function MetricsLoading() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Carregando métricas">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
          <div className="mt-3 h-7 w-28 animate-pulse rounded bg-secondary" />
          <div className="mt-3 h-3 w-20 animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl text-foreground">{value}</p>
      <p className="mt-1 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span
            className={`rounded px-1.5 py-0.5 font-mono ${
              positive ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
            }`}
          >
            {fmtPct(delta)}
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function TodayOrdersGrid() {
  const fetcher = useServerFn(listRecentOrders);
  const qc = useQueryClient();
  const q = useQuery<OrderRow[]>({
    queryKey: ["today-orders"],
    queryFn: () => fetcher({ data: { sinceHours: 24 } }),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  useRealtimeOrders(() => qc.invalidateQueries({ queryKey: ["today-orders"] }));
  useNewOrderAlert(q.data);
  const [printing, setPrinting] = useState<OrderRow | null>(null);
  const [details, setDetails] = useState<OrderRow | null>(null);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = (q.data ?? [])
    .filter((o) => new Date(o.created_at) >= todayStart)
    .slice(0, 12);

  const handlePrint = (order: OrderRow) => {
    setPrinting(order);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 300);
    }, 50);
  };

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pedidos de hoje</h2>
            <p className="text-xs text-muted-foreground">
              Últimos 12 pedidos abertos hoje. Atualiza a cada 30s.
            </p>
          </div>
          <Link
            to="/admin/pedidos"
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos →
          </Link>
        </div>
        {q.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando pedidos…</p>
        )}
        {!q.isLoading && todayOrders.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum pedido hoje ainda.</p>
        )}
        {todayOrders.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {todayOrders.map((o) => (
              <OrderMiniCard
                key={o.id}
                order={o}
                onPrint={() => handlePrint(o)}
                onOpen={() => setDetails(o)}
              />
            ))}
          </div>
        )}
      </section>
      {printing && <ThermalReceipt order={printing} />}
      {details && <OrderDetailsModal order={details} onClose={() => setDetails(null)} />}
    </>
  );
}

function OrderMiniCard({
  order,
  onPrint,
  onOpen,
}: {
  order: OrderRow;
  onPrint: () => void;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  const templates = useWhatsappTemplates();
  const advanceFn = useServerFn(updateOrderStatus);
  const advance = async (next: OrderStatus) => {
    await advanceFn({ data: { id: order.id, status: next } });
    qc.invalidateQueries({ queryKey: ["today-orders"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const time = new Date(order.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const summary = order.items
    .slice(0, 3)
    .map((i) => `${i.quantity}× ${i.product_name_snapshot}`)
    .join(", ");
  const more = order.items.length > 3 ? ` +${order.items.length - 3}` : "";
  const showChange =
    order.payment_method === "dinheiro" && order.change_for && order.change_for > 0;
  const change = showChange ? order.change_for! - order.total : 0;
  const action = nextActionFor(order.status);
  const waTemplate = whatsappTemplateFor(order.status);
  // WhatsApp só libera após aceitar (status > recebido)
  const waEnabled = order.status !== "recebido" && order.status !== "cancelado";
  const waLink = waEnabled ? buildWhatsAppLink(order, waTemplate, templates) : "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex aspect-square cursor-pointer flex-col justify-between rounded-xl border border-border bg-background/40 p-3 text-left transition hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="space-y-2 overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-display text-base leading-tight text-foreground">
            {order.customer_name || "Sem nome"}
          </p>
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_BADGE[order.status]}`}
          >
            {STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {summary}
          {more}
        </p>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg text-primary">{formatBRL(order.total)}</span>
          <span className="text-[11px] text-muted-foreground">{time}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            {PAY_LABEL[order.payment_method]}
          </span>
          {showChange && (
            <>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                Troco p/ {formatBRL(order.change_for!)}
              </span>
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                = {formatBRL(Math.max(0, change))}
              </span>
            </>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrint();
            }}
            title="Imprimir comanda"
            className="flex items-center justify-center gap-1 rounded-md border border-border bg-card px-1 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          <a
            href={waEnabled ? waLink : undefined}
            target={waEnabled ? "_blank" : undefined}
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              if (!waEnabled) e.preventDefault();
            }}
            aria-disabled={!waEnabled}
            title={
              waEnabled
                ? waTemplate === "aceito"
                  ? "Avisar cliente: pedido aceito"
                  : waTemplate === "a_caminho"
                    ? "Avisar cliente: saiu para entrega"
                    : "Mensagem para o cliente"
                : "Aceite o pedido para liberar o WhatsApp"
            }
            className={`flex items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[11px] font-semibold transition ${
              waEnabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "cursor-not-allowed border-border bg-card text-muted-foreground/50"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
          {action ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void advance(action.next);
              }}
              title={action.label}
              className="flex items-center justify-center gap-1 rounded-md border border-primary/40 bg-primary/15 px-1 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/25"
            >
              <Check className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{action.label}</span>
            </button>
          ) : (
            <span className="flex items-center justify-center rounded-md border border-border bg-card px-1 py-1.5 text-[11px] font-semibold text-muted-foreground">
              {STATUS_LABEL[order.status]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderDetailsModal({
  order,
  onClose,
}: {
  order: OrderRow;
  onClose: () => void;
}) {
  const time = new Date(order.created_at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do pedido"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="font-display text-lg text-foreground">
              {order.customer_name || "Sem nome"}
            </p>
            <p className="text-xs text-muted-foreground">{time} · {order.channel}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_BADGE[order.status]}`}
            >
              {STATUS_LABEL[order.status]}
            </span>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <ul className="space-y-2">
            {order.items.map((it) => (
              <li key={it.id} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {it.quantity}× {it.product_name_snapshot}
                  </p>
                  <span className="font-mono text-sm text-foreground">
                    {formatBRL(it.line_total)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {formatBRL(it.unit_price_snapshot)} un
                </p>
                {it.addons.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2">
                    {it.addons.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between text-xs text-muted-foreground"
                      >
                        <span>+ {a.quantity}× {a.addon_name_snapshot}</span>
                        <span className="font-mono">
                          {formatBRL(a.unit_price_snapshot * a.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {order.notes && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <p className="mb-1 font-semibold uppercase tracking-wide">Observações</p>
              <p className="whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatBRL(order.subtotal)} />
            {order.discount > 0 && (
              <Row label="Desconto" value={`- ${formatBRL(order.discount)}`} />
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">Total</span>
              <span className="font-display text-xl text-primary">
                {formatBRL(order.total)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 text-xs">
              <span className="text-muted-foreground">Pagamento</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground">
                {PAY_LABEL[order.payment_method]}
              </span>
            </div>
            {order.payment_method === "dinheiro" &&
              order.change_for != null &&
              order.change_for > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Troco para</span>
                  <span className="font-mono text-amber-400">
                    {formatBRL(order.change_for)}
                  </span>
                </div>
              )}
            {order.cancel_reason && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cancelado</span>
                <span className="text-destructive">{order.cancel_reason}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}