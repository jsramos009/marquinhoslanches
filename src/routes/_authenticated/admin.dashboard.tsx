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
import { getDashboardMetrics, type DashboardMetrics, type OrderStatus } from "@/lib/orders.functions";

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
const STATUS_LABEL: Record<OrderStatus, string> = {
  recebido: "Recebido",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

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
      }
    >
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando métricas…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      {m && (
        <div className="space-y-6">
          {/* KPIs */}
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

          {/* Revenue chart */}
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
            {/* Funnel of status */}
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

            {/* Top products */}
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

          {/* Idle products */}
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

          <div className="flex justify-end">
            <Link
              to="/admin/novo-pedido"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              + Lançar pedido
            </Link>
          </div>
        </div>
      )}
    </AdminShell>
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