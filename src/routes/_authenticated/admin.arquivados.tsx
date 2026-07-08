import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  ArrowLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  XCircle,
  Receipt,
  Truck,
  Copy,
  Check,
  ShoppingBag,
  Package,
  CreditCard,
  Store,
} from "lucide-react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import {
  listArchivedOrders,
  listOrdersByDay,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders.functions";
import { FLOW_STATUS_LABEL, PAY_LABEL } from "@/lib/order-flow";

const searchSchema = z.object({
  d: fallback(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), "").optional(),
});

export const Route = createFileRoute("/_authenticated/admin/arquivados")({
  validateSearch: zodValidator(searchSchema),
  component: ArquivadosPage,
  head: () => ({
    meta: [
      { title: "Arquivados — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  balcao: "Balcão",
  telefone: "Telefone",
  outro: "Outro",
};

function dayKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(key: string) {
  // Build a local Date from the key to avoid TZ offset surprises
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type DayBucket = {
  key: string;
  orders: OrderRow[];
};

type DayMetrics = {
  total: number;
  cancelled: number;
  revenue: number;
  cancelledRevenue: number;
  avgTicket: number;
  byStatus: Record<OrderStatus, number>;
};

function computeMetrics(orders: OrderRow[]): DayMetrics {
  const byStatus: Record<OrderStatus, number> = {
    recebido: 0,
    em_producao: 0,
    pronto: 0,
    entregue: 0,
    cancelado: 0,
  };
  let revenue = 0;
  let cancelledRevenue = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    if (o.status === "cancelado") cancelledRevenue += Number(o.total || 0);
    else revenue += Number(o.total || 0);
  }
  const valid = orders.filter((o) => o.status !== "cancelado").length;
  return {
    total: orders.length,
    cancelled: byStatus.cancelado,
    revenue,
    cancelledRevenue,
    avgTicket: valid ? revenue / valid : 0,
    byStatus,
  };
}

function ArquivadosPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/arquivados" });

  const fetchArchived = useServerFn(listArchivedOrders);
  const fetchByDay = useServerFn(listOrdersByDay);

  const listQuery = useQuery<OrderRow[]>({
    queryKey: ["orders-archived", 30],
    queryFn: () => fetchArchived({ data: { days: 30 } }),
    staleTime: 60_000,
    enabled: !search.d,
  });

  // Ao selecionar uma data, sempre buscamos direto do servidor (permite
  // datas fora dos últimos 30 dias e garante o dia atual também).
  const dayQuery = useQuery<OrderRow[]>({
    queryKey: ["orders-by-day", search.d],
    queryFn: () => fetchByDay({ data: { day: search.d as string } }),
    staleTime: 60_000,
    enabled: Boolean(search.d),
  });

  const buckets = useMemo<DayBucket[]>(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of listQuery.data ?? []) {
      const k = dayKey(o.created_at);
      const list = map.get(k) ?? [];
      list.push(o);
      map.set(k, list);
    }
    return [...map.entries()]
      .map(([key, orders]) => ({ key, orders }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [listQuery.data]);

  const selected: DayBucket | null = search.d
    ? { key: search.d, orders: dayQuery.data ?? [] }
    : null;

  const isLoading = search.d ? dayQuery.isLoading : listQuery.isLoading;
  const error = search.d ? dayQuery.error : listQuery.error;

  return (
    <AdminShell
      user={user}
      roles={roles}
      title="Pedidos arquivados"
      actions={
        <Link
          to="/admin/pedidos"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Voltar para pedidos
        </Link>
      }
    >
      {!selected && (
        <CustomDayPicker onPick={(k) => navigate({ search: { d: k } })} />
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Carregando histórico…</p>
      )}
      {error && (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      )}

      {!isLoading && !selected && (
        <DayList
          buckets={buckets}
          onSelect={(k) => navigate({ search: { d: k } })}
        />
      )}

      {selected && !isLoading && (
        <DayDetail
          bucket={selected}
          onBack={() => navigate({ search: { d: undefined } })}
        />
      )}
    </AdminShell>
  );
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function CustomDayPicker({ onPick }: { onPick: (day: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Relatório de um dia específico
        </label>
        <input
          type="date"
          value={value}
          max={todayKey()}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <button
        onClick={() => value && onPick(value)}
        disabled={!value}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Calendar size={14} /> Ver relatório
      </button>
      <button
        onClick={() => onPick(todayKey())}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        Hoje
      </button>
    </div>
  );
}

function DayList({
  buckets,
  onSelect,
}: {
  buckets: DayBucket[];
  onSelect: (key: string) => void;
}) {
  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <Calendar
          size={28}
          className="mx-auto mb-2 text-muted-foreground"
        />
        <p className="text-sm text-muted-foreground">
          Nenhum pedido arquivado nos últimos 30 dias.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {buckets.map((b) => {
        const m = computeMetrics(b.orders);
        return (
          <button
            key={b.key}
            onClick={() => onSelect(b.key)}
            className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-card/80"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {b.key}
                </p>
                <p className="mt-0.5 truncate font-display text-base capitalize text-primary">
                  {formatDayLabel(b.key)}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </div>

            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-secondary/40 p-2">
                <p className="text-muted-foreground">Faturamento</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-400">
                  {formatBRL(m.revenue)}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/40 p-2">
                <p className="text-muted-foreground">Pedidos</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                  {m.total - m.cancelled}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {m.total}
                  </span>
                </p>
              </div>
              <div className="rounded-lg bg-secondary/40 p-2">
                <p className="text-muted-foreground">Ticket médio</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                  {formatBRL(m.avgTicket)}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/40 p-2">
                <p className="text-muted-foreground">Cancelados</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-destructive">
                  {m.cancelled}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DayDetail({
  bucket,
  onBack,
}: {
  bucket: DayBucket;
  onBack: () => void;
}) {
  const m = computeMetrics(bucket.orders);
  const cancelRate = m.total > 0 ? (m.cancelled / m.total) * 100 : 0;
  const orders = [...bucket.orders].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
  const [copied, setCopied] = useState(false);

  // Somente pedidos de entrega válidos (não cancelados)
  const deliveries = orders.filter(
    (o) => o.delivery_mode === "delivery" && o.status !== "cancelado",
  );
  const deliveryRevenue = deliveries.reduce((s, o) => s + Number(o.total || 0), 0);
  const deliveryFees = deliveries.reduce(
    (s, o) => s + Number(o.delivery_fee || 0),
    0,
  );
  const deliveredCount = deliveries.filter((o) => o.status === "entregue").length;

  const copyReport = async () => {
    const lines: string[] = [];
    lines.push(`📊 Relatório de entregas — ${formatDayLabel(bucket.key)}`);
    lines.push("");
    lines.push(`Entregas: ${deliveries.length}`);
    lines.push(`Já entregues: ${deliveredCount}`);
    lines.push(`Faturamento entregas: ${formatBRL(deliveryRevenue)}`);
    lines.push(`Total em fretes: ${formatBRL(deliveryFees)}`);
    lines.push("");
    if (deliveries.length > 0) {
      lines.push("— Pedidos —");
      for (const o of deliveries) {
        const time = new Date(o.created_at).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        lines.push(
          `• ${time} — ${o.customer_name || "Sem cliente"} — ${formatBRL(o.total)} (frete ${formatBRL(o.delivery_fee || 0)}) — ${FLOW_STATUS_LABEL[o.status]}`,
        );
        if (o.delivery_neighborhood) lines.push(`   Bairro: ${o.delivery_neighborhood}`);
        if (o.delivery_address) lines.push(`   Endereço: ${o.delivery_address}`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Todas as datas
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {bucket.key}
          </p>
          <h2 className="truncate font-display text-lg capitalize text-primary">
            {formatDayLabel(bucket.key)}
          </h2>
        </div>
        <button
          onClick={copyReport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado!" : "Copiar relatório"}
        </button>
      </div>

      {/* Relatório de entregas do dia */}
      <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
          <Truck size={16} /> Relatório de entregas
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<Truck size={16} />}
            label="Entregas"
            value={`${deliveries.length}`}
            hint={`${deliveredCount} concluídas`}
          />
          <MetricCard
            icon={<TrendingUp size={16} />}
            label="Faturamento entregas"
            value={formatBRL(deliveryRevenue)}
            tone="success"
          />
          <MetricCard
            icon={<Receipt size={16} />}
            label="Total em fretes"
            value={formatBRL(deliveryFees)}
          />
          <MetricCard
            icon={<Receipt size={16} />}
            label="Ticket entrega"
            value={formatBRL(
              deliveries.length ? deliveryRevenue / deliveries.length : 0,
            )}
          />
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<TrendingUp size={16} />}
          label="Faturamento"
          value={formatBRL(m.revenue)}
          tone="success"
        />
        <MetricCard
          icon={<Receipt size={16} />}
          label="Pedidos válidos"
          value={`${m.total - m.cancelled}`}
          hint={`${m.total} no total`}
        />
        <MetricCard
          icon={<Receipt size={16} />}
          label="Ticket médio"
          value={formatBRL(m.avgTicket)}
        />
        <MetricCard
          icon={<XCircle size={16} />}
          label="Cancelados"
          value={`${m.cancelled}`}
          hint={`${cancelRate.toFixed(1)}% · ${formatBRL(m.cancelledRevenue)} perdidos`}
          tone="destructive"
        />
      </div>

      {/* Distribuição por status */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(m.byStatus) as OrderStatus[])
          .filter((s) => m.byStatus[s] > 0)
          .map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground"
            >
              <span className="font-semibold text-foreground">
                {m.byStatus[s]}
              </span>
              {FLOW_STATUS_LABEL[s]}
            </span>
          ))}
      </div>

      {/* Lista de pedidos do dia */}
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Pedidos do dia
      </h3>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <article
            key={o.id}
            className={`rounded-xl border bg-card p-3 ${
              o.status === "cancelado"
                ? "border-destructive/40 opacity-80"
                : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {o.customer_name || "Sem cliente"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {CHANNEL_LABEL[o.channel] ?? o.channel} ·{" "}
                  {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {FLOW_STATUS_LABEL[o.status]}
                </p>
              </div>
              <span className="shrink-0 rounded bg-secondary px-2 py-0.5 text-xs font-mono">
                {formatBRL(o.total)}
              </span>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {o.items.map((i) => (
                <li key={i.id}>
                  <span className="text-foreground">{i.quantity}×</span>{" "}
                  {i.product_name_snapshot}
                  {i.addons.length > 0 && (
                    <span>
                      {" "}+ {i.addons.map((a) => a.addon_name_snapshot).join(", ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Pagamento: {PAY_LABEL[o.payment_method]}
              {o.change_for ? ` · troco p/ ${formatBRL(o.change_for)}` : ""}
            </p>
            {o.notes && (
              <p className="mt-1 rounded bg-secondary/60 px-2 py-1 text-xs italic text-muted-foreground">
                {o.notes}
              </p>
            )}
            {o.cancel_reason && (
              <p className="mt-2 text-xs text-destructive">
                Motivo: {o.cancel_reason}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "destructive";
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-400"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={`mt-1 font-mono text-xl font-semibold ${valueClass}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}