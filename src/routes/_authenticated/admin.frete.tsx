import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  listDeliveryFeesAdmin,
  upsertDeliveryFee,
  deleteDeliveryFee,
  type DeliveryFee,
} from "@/lib/delivery-fees.functions";

export const Route = createFileRoute("/_authenticated/admin/frete")({
  component: FretePage,
  head: () => ({
    meta: [{ title: "Frete — Marquinhos" }, { name: "robots", content: "noindex" }],
  }),
});

function FretePage() {
  const { user, roles } = Route.useRouteContext() as {
    user: { email?: string };
    roles: string[];
  };
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (!isAdmin) navigate({ to: "/admin/dashboard", replace: true });
  }, [isAdmin, navigate]);

  const qc = useQueryClient();
  const fetchList = useServerFn(listDeliveryFeesAdmin);
  const upsertFn = useServerFn(upsertDeliveryFee);
  const deleteFn = useServerFn(deleteDeliveryFee);

  const list = useQuery({
    queryKey: ["delivery-fees", "admin"],
    queryFn: () => fetchList(),
    enabled: isAdmin,
  });

  const [editing, setEditing] = useState<DeliveryFee | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["delivery-fees"] });
  };

  const upsertMut = useMutation({
    mutationFn: (input: {
      id?: string | null;
      neighborhood: string;
      fee: number;
      is_active: boolean;
    }) => upsertFn({ data: input }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setCreating(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => invalidate(),
  });

  if (!isAdmin) return null;

  return (
    <AdminShell
      user={user}
      roles={roles}
      title="Frete por bairro"
      actions={
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus size={16} /> Novo bairro
        </button>
      }
    >
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Cadastre os bairros que vocês atendem e o valor do frete de cada um. No cardápio, quando o
        cliente escolher "Entrega", ele vai selecionar o bairro e o valor do frete entra
        automaticamente no total do pedido.
      </p>

      {list.isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : list.isError ? (
        <p className="text-destructive">Erro ao carregar bairros.</p>
      ) : (list.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <p className="font-display text-lg text-primary">Nenhum bairro cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre o primeiro bairro pra começar a cobrar frete automaticamente.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus size={16} /> Cadastrar bairro
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Bairro</th>
                <th className="px-4 py-3">Frete</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{d.neighborhood}</td>
                  <td className="px-4 py-3">{formatBRL(d.fee)}</td>
                  <td className="px-4 py-3">
                    {d.is_active ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                        Ativo
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditing(d)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:border-primary"
                      >
                        <Pencil size={14} className="inline -mt-0.5" /> Editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remover o bairro "${d.neighborhood}"?`)) {
                            deleteMut.mutate(d.id);
                          }
                        }}
                        className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20"
                      >
                        <Trash2 size={14} className="inline -mt-0.5" /> Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <EditDialog
          initial={editing}
          saving={upsertMut.isPending}
          error={upsertMut.error instanceof Error ? upsertMut.error.message : null}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            upsertMut.reset();
          }}
          onSave={(values) => upsertMut.mutate(values)}
        />
      )}
    </AdminShell>
  );
}

function EditDialog({
  initial,
  saving,
  error,
  onClose,
  onSave,
}: {
  initial: DeliveryFee | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (v: {
    id?: string | null;
    neighborhood: string;
    fee: number;
    is_active: boolean;
  }) => void;
}) {
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood ?? "");
  const [fee, setFee] = useState<string>(initial ? String(initial.fee).replace(".", ",") : "");
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true);

  const submit = () => {
    const numeric = Number(String(fee).replace(",", "."));
    if (!neighborhood.trim()) return;
    if (!Number.isFinite(numeric) || numeric < 0) return;
    onSave({
      id: initial?.id ?? null,
      neighborhood: neighborhood.trim(),
      fee: numeric,
      is_active: isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-primary">
            {initial ? "Editar bairro" : "Novo bairro"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Nome do bairro
            </span>
            <input
              autoFocus
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ex.: Centro"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Valor do frete (R$)
            </span>
            <input
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="Ex.: 5,00"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="text-sm">Ativo (aparece pra clientes)</span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
