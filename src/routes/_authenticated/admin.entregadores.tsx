import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import {
  listCouriers,
  upsertCourier,
  deleteCourier,
  getCourierReport,
  type Courier,
} from "@/lib/couriers.functions";

export const Route = createFileRoute("/_authenticated/admin/entregadores")({
  component: EntregadoresPage,
  head: () => ({
    meta: [
      { title: "Entregadores — Marquinhos" },
      { name: "description", content: "Cadastro de entregadores e relatório de entregas." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const PAY_LABEL: Record<string, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
  nao_informado: "—",
};

function today() {
  const d = new Date(new Date().getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}

function EntregadoresPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { id: string; email?: string };
    roles: string[];
  };
  const isAdmin = roles.includes("admin");
  const navigate = useNavigate();
  const [tab, setTab] = useState<"cadastro" | "relatorio">("relatorio");
  const [startDay, setStartDay] = useState(today());
  const [endDay, setEndDay] = useState(today());
  const [courierFilter, setCourierFilter] = useState<string>("");

  const list = useServerFn(listCouriers);
  const save = useServerFn(upsertCourier);
  const del = useServerFn(deleteCourier);
  const report = useServerFn(getCourierReport);

  const qc = useQueryClient();
  const couriersQuery = useQuery({
    queryKey: ["couriers-all"],
    queryFn: () => list({ data: { includeInactive: true } }),
  });

  const reportQuery = useQuery({
    queryKey: ["courier-report", startDay, endDay, courierFilter],
    queryFn: () =>
      report({
        data: {
          startDay,
          endDay,
          courierId: courierFilter || null,
        },
      }),
    enabled: tab === "relatorio",
  });

  const upsert = useMutation({
    mutationFn: (c: Partial<Courier>) =>
      save({
        data: {
          id: c.id,
          name: c.name ?? "",
          phone: c.phone ?? null,
          active: c.active ?? true,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers-all"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers-all"] }),
  });

  const rep = reportQuery.data;

  const summaryText = useMemo(() => {
    if (!rep) return "";
    const lines: string[] = [];
    lines.push(`Relatório de entregadores — ${brDate(startDay)} a ${brDate(endDay)}`);
    lines.push("");
    lines.push(`Faturamento fretes: ${formatBRL(rep.total_freight)}`);
    lines.push(`Ticket médio: ${formatBRL(rep.avg_freight)}`);
    lines.push(`Total de entregas: ${rep.total_deliveries}`);
    lines.push(`Entregadores ativos: ${rep.active_couriers}`);
    lines.push("");
    for (const c of rep.by_courier) {
      lines.push(`• ${c.courier_name}: ${c.deliveries} entregas — ${formatBRL(c.total_freight)}`);
    }
    return lines.join("\n");
  }, [rep, startDay, endDay]);

  async function exportPdf() {
    if (!rep) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Marquinhos Lanches", 14, 16);
    doc.setFontSize(11);
    doc.text("Relatório de entregadores", 14, 24);
    doc.text(`Período: ${brDate(startDay)} à ${brDate(endDay)}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [["Faturamento", "Ticket médio", "Entregas", "Entregadores"]],
      body: [[
        formatBRL(rep.total_freight),
        formatBRL(rep.avg_freight),
        String(rep.total_deliveries),
        String(rep.active_couriers),
      ]],
      theme: "grid",
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      head: [["N°", "Valor", "Pagamento", "Frete", "Bairro", "Entregador", "Data"]],
      body: rep.rows.map((r) => [
        `#${r.order_number}`,
        formatBRL(r.order_total),
        PAY_LABEL[r.payment_method] ?? r.payment_method,
        formatBRL(r.delivery_fee),
        r.neighborhood ?? "—",
        r.courier_name ?? "—",
        formatDateTime(r.created_at),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    doc.save(`entregadores-${startDay}-a-${endDay}.pdf`);
  }

  function copySummary() {
    if (!summaryText) return;
    navigator.clipboard.writeText(summaryText);
  }

  return (
    <AdminShell
      user={user}
      roles={roles}
      title="Entregadores"
      actions={
        <div className="flex gap-2">
          <button
            onClick={() => setTab("relatorio")}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "relatorio" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
          >
            Relatório
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab("cadastro")}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === "cadastro" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
            >
              Cadastro
            </button>
          )}
        </div>
      }
    >
      {tab === "cadastro" && isAdmin && (
        <CadastroTab
          couriers={couriersQuery.data ?? []}
          onSave={(c) => upsert.mutate(c)}
          onDelete={(id) => remove.mutate(id)}
          saving={upsert.isPending}
        />
      )}

      {tab === "relatorio" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              De
              <input
                type="date"
                value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
                className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Até
              <input
                type="date"
                value={endDay}
                onChange={(e) => setEndDay(e.target.value)}
                className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Entregador
              <select
                value={courierFilter}
                onChange={(e) => setCourierFilter(e.target.value)}
                className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {(couriersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={copySummary}
              disabled={!rep}
              className="rounded-md bg-secondary px-3 py-2 text-sm disabled:opacity-60"
            >
              Copiar resumo
            </button>
            <button
              onClick={exportPdf}
              disabled={!rep}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              Exportar PDF
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Faturamento fretes" value={formatBRL(rep?.total_freight ?? 0)} />
            <MetricCard label="Ticket médio" value={formatBRL(rep?.avg_freight ?? 0)} />
            <MetricCard label="Total de entregas" value={String(rep?.total_deliveries ?? 0)} />
            <MetricCard label="Entregadores ativos" value={String(rep?.active_couriers ?? 0)} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">N° pedido</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Pagamento</th>
                  <th className="px-3 py-2 text-right">Frete</th>
                  <th className="px-3 py-2">Bairro</th>
                  <th className="px-3 py-2">Entregador</th>
                  <th className="px-3 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {(rep?.rows ?? []).map((r) => (
                  <tr key={r.order_id} className="border-t border-border">
                    <td className="px-3 py-2">#{r.order_number}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(r.order_total)}</td>
                    <td className="px-3 py-2">{PAY_LABEL[r.payment_method] ?? r.payment_method}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(r.delivery_fee)}</td>
                    <td className="px-3 py-2">{r.neighborhood ?? "—"}</td>
                    <td className="px-3 py-2">{r.courier_name ?? "—"}</td>
                    <td className="px-3 py-2">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
                {(!rep || rep.rows.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      {reportQuery.isLoading ? "Carregando…" : "Sem entregas no período."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => navigate({ to: "/admin/dashboard" })}
          className="rounded-md bg-secondary px-3 py-2 text-sm"
        >
          Voltar
        </button>
      </div>
    </AdminShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function CadastroTab({
  couriers,
  onSave,
  onDelete,
  saving,
}: {
  couriers: Courier[];
  onSave: (c: Partial<Courier>) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Novo entregador</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefone (opcional)"
            className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={!name.trim() || saving}
            onClick={() => {
              onSave({ name, phone });
              setName("");
              setPhone("");
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {couriers.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.phone ?? "—"}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={(e) => onSave({ ...c, active: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => {
                      if (confirm(`Excluir ${c.name}?`)) onDelete(c.id);
                    }}
                    className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive hover:bg-destructive/20"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {couriers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum entregador cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function brDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}