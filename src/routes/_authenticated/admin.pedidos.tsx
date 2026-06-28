import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import {
  listRecentOrders,
  updateOrderStatus,
  cancelOrder,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders.functions";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: PedidosPage,
  head: () => ({
    meta: [
      { title: "Pedidos — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const COLUMNS: { id: OrderStatus; label: string; next?: OrderStatus }[] = [
  { id: "recebido", label: "Recebido", next: "em_producao" },
  { id: "em_producao", label: "Em produção", next: "pronto" },
  { id: "pronto", label: "Pronto", next: "entregue" },
  { id: "entregue", label: "Entregue" },
];

const CHANNEL_LABEL = {
  whatsapp: "WhatsApp",
  balcao: "Balcão",
  telefone: "Telefone",
  outro: "Outro",
};

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function PedidosPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const list = useServerFn(listRecentOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const cancelFn = useServerFn(cancelOrder);
  const qc = useQueryClient();

  const q = useQuery<OrderRow[]>({
    queryKey: ["orders-recent"],
    queryFn: () => list({ data: { sinceHours: 36 } }),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["orders-recent"] });

  const advance = useMutation({
    mutationFn: (v: { id: string; status: OrderStatus }) => updateFn({ data: v }),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (v: { id: string; reason: string }) => cancelFn({ data: v }),
    onSuccess: invalidate,
  });

  const orders = q.data ?? [];
  const cancelled = orders.filter((o) => o.status === "cancelado");
  const [showCancelled, setShowCancelled] = useState(false);

  return (
    <AdminShell
      user={user}
      roles={roles}
      title="Pedidos"
      actions={
        <>
          <button
            onClick={() => setShowCancelled((v) => !v)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {showCancelled ? "Ocultar" : "Ver"} cancelados ({cancelled.length})
          </button>
          <Link
            to="/admin/pedidos/novo"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + Novo pedido
          </Link>
        </>
      }
    >
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = orders.filter((o) => o.status === col.id);
          return (
            <div key={col.id} className="flex flex-col rounded-xl border border-border bg-card/40 p-3">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">{col.label}</h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{items.length}</span>
              </header>
              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    Vazio
                  </p>
                )}
                {items.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    nextStatus={col.next}
                    onAdvance={(status) => advance.mutate({ id: o.id, status })}
                    onCancel={(reason) => cancel.mutate({ id: o.id, reason })}
                    busy={advance.isPending || cancel.isPending}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showCancelled && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cancelados
          </h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {cancelled.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum cancelamento recente.</p>
            )}
            {cancelled.map((o) => (
              <div key={o.id} className="rounded-xl border border-destructive/40 bg-card p-3 opacity-80">
                <p className="text-sm font-medium text-foreground">
                  {o.customer_name || "Sem cliente"} · {formatBRL(o.total)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {CHANNEL_LABEL[o.channel]} · {timeAgo(o.created_at)} atrás
                </p>
                {o.cancel_reason && (
                  <p className="mt-2 text-xs text-destructive">
                    Motivo: {o.cancel_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </AdminShell>
  );
}

function OrderCard({
  order,
  nextStatus,
  onAdvance,
  onCancel,
  busy,
}: {
  order: OrderRow;
  nextStatus?: OrderStatus;
  onAdvance: (status: OrderStatus) => void;
  onCancel: (reason: string) => void;
  busy: boolean;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {order.customer_name || "Sem cliente"}
          </p>
          <p className="text-xs text-muted-foreground">
            {CHANNEL_LABEL[order.channel]} · há {timeAgo(order.created_at)}
          </p>
        </div>
        <span className="shrink-0 rounded bg-secondary px-2 py-0.5 text-xs font-mono">
          {formatBRL(order.total)}
        </span>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {order.items.map((i) => (
          <li key={i.id}>
            <span className="text-foreground">{i.quantity}×</span> {i.product_name_snapshot}
            {i.addons.length > 0 && (
              <span className="text-muted-foreground">
                {" "}+ {i.addons.map((a) => a.addon_name_snapshot).join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>
      {order.notes && (
        <p className="mt-2 rounded bg-secondary/60 px-2 py-1 text-xs italic text-muted-foreground">
          {order.notes}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {nextStatus && (
          <button
            disabled={busy}
            onClick={() => onAdvance(nextStatus)}
            className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            → {nextStatus === "em_producao" ? "Produzir" : nextStatus === "pronto" ? "Pronto" : "Entregar"}
          </button>
        )}
        {order.status !== "entregue" && order.status !== "cancelado" && (
          <button
            disabled={busy}
            onClick={() => {
              const r = prompt("Motivo do cancelamento:");
              if (r && r.trim()) onCancel(r.trim());
            }}
            className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
          >
            Cancelar
          </button>
        )}
      </div>
    </article>
  );
}