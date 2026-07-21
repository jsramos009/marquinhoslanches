import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import { listCustomers, updateCustomer, type Customer } from "@/lib/customers.functions";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: ClientesPage,
  head: () => ({
    meta: [
      { title: "Clientes — Marquinhos" },
      { name: "description", content: "Clientes cadastrados e histórico de pedidos." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function formatPhone(p: string) {
  const d = (p || "").replace(/\D+/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

function ClientesPage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { id: string; email?: string };
    roles: string[];
  };
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const list = useServerFn(listCustomers);
  const update = useServerFn(updateCustomer);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["customers", search],
    queryFn: () => list({ data: { search } }),
  });

  const save = useMutation({
    mutationFn: (c: Customer) =>
      update({
        data: {
          id: c.id,
          name: c.name,
          last_address: c.last_address,
          last_neighborhood: c.last_neighborhood,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setEditing(null);
    },
  });

  const rows = query.data ?? [];

  return (
    <AdminShell user={user} roles={roles} title="Clientes">
      <div className="mb-4 flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">{rows.length} clientes</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Último endereço</th>
              <th className="px-3 py-2">Bairro</th>
              <th className="px-3 py-2 text-right">Pedidos</th>
              <th className="px-3 py-2 text-right">Total gasto</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2">{c.name || "—"}</td>
                <td className="px-3 py-2">{formatPhone(c.phone)}</td>
                <td className="px-3 py-2">{c.last_address || "—"}</td>
                <td className="px-3 py-2">{c.last_neighborhood || "—"}</td>
                <td className="px-3 py-2 text-right">{c.orders_count}</td>
                <td className="px-3 py-2 text-right">{formatBRL(c.total_spent)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setEditing(c)}
                    className="rounded-md bg-secondary px-2 py-1 text-xs hover:bg-secondary/80"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {query.isLoading ? "Carregando…" : "Nenhum cliente encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg">
            <h3 className="mb-3 text-lg font-semibold">Editar cliente</h3>
            <div className="space-y-3">
              <label className="block text-sm">
                Nome
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Endereço
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={editing.last_address ?? ""}
                  onChange={(e) => setEditing({ ...editing, last_address: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Bairro
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={editing.last_neighborhood ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, last_neighborhood: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-md bg-secondary px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => editing && save.mutate(editing)}
                disabled={save.isPending}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
              >
                {save.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}