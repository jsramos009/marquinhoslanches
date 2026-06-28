import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import { getCatalog, setProductStock, type CatalogProduct } from "@/lib/catalog.functions";
import { Search, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  component: EstoquePage,
  head: () => ({
    meta: [
      { title: "Estoque — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function EstoquePage() {
  const { user, roles } = Route.useRouteContext() as { user: { email?: string }; roles: string[] };
  const fetchCatalog = useServerFn(getCatalog);
  const setStock = useServerFn(setProductStock);
  const qc = useQueryClient();

  const cat = useQuery({ queryKey: ["catalog"], queryFn: () => fetchCatalog() });
  const [q, setQ] = useState("");

  const mut = useMutation({
    mutationFn: (p: { id: string; track_stock: boolean; stock_quantity: number | null; is_active?: boolean }) =>
      setStock({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      qc.invalidateQueries({ queryKey: ["menu"] });
    },
  });

  const grouped = useMemo(() => {
    if (!cat.data) return [];
    const term = q.trim().toLowerCase();
    return cat.data.categories.map((c) => ({
      ...c,
      items: cat.data!.products
        .filter((p) => p.category_id === c.id)
        .filter((p) => !term || p.name.toLowerCase().includes(term)),
    }));
  }, [cat.data, q]);

  return (
    <AdminShell user={user} roles={roles} title="Controle de Estoque">
      <div className="mb-5 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm"
          />
        </div>
      </div>

      {cat.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {cat.error && <p className="text-destructive">Erro ao carregar.</p>}

      <div className="space-y-8">
        {grouped.map((g) => (
          <section key={g.id}>
            <h2 className="mb-3 font-display text-lg text-primary">{g.name}</h2>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum produto.</p>
            ) : (
              <div className="grid gap-2">
                {g.items.map((p) => (
                  <StockRow key={p.id} p={p} onSave={(payload) => mut.mutate(payload)} pending={mut.isPending} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </AdminShell>
  );
}

function StockRow({
  p,
  onSave,
  pending,
}: {
  p: CatalogProduct;
  onSave: (d: { id: string; track_stock: boolean; stock_quantity: number | null; is_active?: boolean }) => void;
  pending: boolean;
}) {
  const [track, setTrack] = useState(p.track_stock);
  const [qty, setQty] = useState<number>(p.stock_quantity ?? 0);
  const [active, setActive] = useState(p.is_active);

  const dirty = track !== p.track_stock || (track && qty !== (p.stock_quantity ?? 0)) || active !== p.is_active;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          {p.image_url ? (
            <img
              src={p.image_url}
              alt=""
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <Package size={18} />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="text-xs text-muted-foreground">{formatBRL(p.price)}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setActive(!active)}
        aria-pressed={active}
        className={`toggle-3d ${active ? "toggle-3d-on" : "toggle-3d-off"}`}
      >
        <span className="toggle-3d-dot" />
        {active ? "Disponível" : "Indisponível"}
      </button>
      <button
        type="button"
        onClick={() => setTrack(!track)}
        aria-pressed={track}
        className={`toggle-3d ${track ? "toggle-3d-on" : "toggle-3d-off"}`}
      >
        <span className="toggle-3d-dot" />
        {track ? "Estoque ativo" : "Sem controle"}
      </button>
      {track && (
        <input
          type="number"
          min={0}
          value={qty}
          onChange={(e) => setQty(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
      )}

      <button
        onClick={() =>
          onSave({
            id: p.id,
            track_stock: track,
            stock_quantity: track ? qty : null,
            is_active: active,
          })
        }
        disabled={!dirty || pending}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        Salvar
      </button>
    </div>
  );
}