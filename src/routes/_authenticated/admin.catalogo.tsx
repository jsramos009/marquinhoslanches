import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminShell, formatBRL } from "@/components/admin/AdminShell";
import {
  getCatalog,
  upsertProduct,
  deleteProduct,
  upsertAddon,
  deleteAddon,
  type CatalogProduct,
  type CatalogAddon,
  type CatalogCategory,
} from "@/lib/catalog.functions";
import { Pencil, Plus, Trash2, X, Image as ImageIcon, Upload, Sparkles } from "lucide-react";
import { fileToCompressedDataUrl, compressDataUrl } from "@/lib/image-upload";
import { generateProductImage } from "@/lib/ai-images.functions";

function Toggle3D({
  on,
  onChange,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`toggle-3d ${on ? "toggle-3d-on" : "toggle-3d-off"}`}
    >
      <span className="toggle-3d-dot" />
      {on ? onLabel : offLabel}
    </button>
  );
}

export const Route = createFileRoute("/_authenticated/admin/catalogo")({
  component: CatalogPage,
  head: () => ({
    meta: [
      { title: "Catálogo — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function CatalogPage() {
  const { user, roles } = Route.useRouteContext() as { user: { email?: string }; roles: string[] };
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (!isAdmin) navigate({ to: "/admin/dashboard", replace: true });
  }, [isAdmin, navigate]);

  const fetchCatalog = useServerFn(getCatalog);
  const cat = useQuery({ queryKey: ["catalog"], queryFn: () => fetchCatalog(), enabled: isAdmin });

  const [editing, setEditing] = useState<{ kind: "product"; p: CatalogProduct | null } | { kind: "addon"; a: CatalogAddon | null } | null>(null);
  const [tab, setTab] = useState<"produtos" | "adicionais">("produtos");

  if (!isAdmin) return null;

  return (
    <AdminShell user={user} roles={roles} title="Catálogo">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTab("produtos")}
            className={`rounded-full px-4 py-1.5 text-sm ${tab === "produtos" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
          >
            Produtos
          </button>
          <button
            onClick={() => setTab("adicionais")}
            className={`rounded-full px-4 py-1.5 text-sm ${tab === "adicionais" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
          >
            Adicionais
          </button>
        </div>
        <button
          onClick={() =>
            setEditing(tab === "produtos" ? { kind: "product", p: null } : { kind: "addon", a: null })
          }
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {cat.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {cat.error && <p className="text-destructive">Erro ao carregar.</p>}

      {cat.data && tab === "produtos" && (
        <ProductList data={cat.data} onEdit={(p) => setEditing({ kind: "product", p })} />
      )}
      {cat.data && tab === "adicionais" && (
        <AddonList addons={cat.data.addons} onEdit={(a) => setEditing({ kind: "addon", a })} />
      )}

      {editing?.kind === "product" && cat.data && (
        <ProductEditor
          product={editing.p}
          categories={cat.data.categories}
          addons={cat.data.addons}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "addon" && (
        <AddonEditor addon={editing.a} onClose={() => setEditing(null)} />
      )}
    </AdminShell>
  );
}

function ProductList({
  data,
  onEdit,
}: {
  data: { categories: CatalogCategory[]; products: CatalogProduct[] };
  onEdit: (p: CatalogProduct) => void;
}) {
  return (
    <div className="space-y-8">
      {data.categories.map((c) => {
        const items = data.products.filter((p) => p.category_id === c.id);
        return (
          <section key={c.id}>
            <h2 className="mb-3 font-display text-lg text-primary">{c.name}</h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum produto.</p>
            ) : (
              <div className="grid gap-2">
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onEdit(p)}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left hover:border-primary sm:items-center sm:px-4"
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground sm:truncate">{p.description || "—"}</p>
                      {/* Preço / status — vai para baixo no mobile, lateral em telas maiores */}
                      <div className="mt-1 flex items-center gap-2 text-xs sm:hidden">
                        <span className="font-display text-sm text-primary">{formatBRL(p.price)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">
                          {p.is_active ? "Ativo" : "Inativo"}
                          {p.track_stock ? ` · ${p.stock_quantity ?? 0} un` : ""}
                        </span>
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-display text-primary">{formatBRL(p.price)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.is_active ? "Ativo" : "Inativo"}
                        {p.track_stock ? ` · ${p.stock_quantity ?? 0} un` : ""}
                      </p>
                    </div>
                    <Pencil size={16} className="ml-1 mt-1 shrink-0 text-muted-foreground sm:ml-2 sm:mt-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AddonList({ addons, onEdit }: { addons: CatalogAddon[]; onEdit: (a: CatalogAddon) => void }) {
  return (
    <div className="grid gap-2">
      {addons.map((a) => (
        <button
          key={a.id}
          onClick={() => onEdit(a)}
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{a.name}</p>
            <p className="text-xs text-muted-foreground">{a.is_active ? "Ativo" : "Inativo"}</p>
          </div>
          <p className="font-display text-primary">+{formatBRL(a.price)}</p>
          <Pencil size={16} className="ml-2 text-muted-foreground" />
        </button>
      ))}
      {addons.length === 0 && <p className="text-sm text-muted-foreground">Nenhum adicional.</p>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="sheet-backdrop-in fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet-panel-in my-auto flex max-h-[92vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-background shadow-[var(--shadow-brand)]"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-xl text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-secondary"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ProductEditor({
  product,
  categories,
  addons,
  onClose,
}: {
  product: CatalogProduct | null;
  categories: CatalogCategory[];
  addons: CatalogAddon[];
  onClose: () => void;
}) {
  const save = useServerFn(upsertProduct);
  const del = useServerFn(deleteProduct);
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["catalog"] });
    qc.invalidateQueries({ queryKey: ["menu"] });
  };

  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    category_id: product?.category_id ?? categories[0]?.id ?? "",
    price: product?.price ?? 0,
    image_url: product?.image_url ?? "",
    accepts_addons: product?.accepts_addons ?? false,
    is_active: product?.is_active ?? true,
    sort_order: product?.sort_order ?? 0,
    track_stock: product?.track_stock ?? false,
    stock_quantity: product?.stock_quantity ?? 0,
    addon_ids: new Set(product?.addon_ids ?? []),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: product?.id,
          category_id: form.category_id,
          name: form.name,
          description: form.description,
          price: Number(form.price),
          image_url: form.image_url,
          accepts_addons: form.accepts_addons,
          is_active: form.is_active,
          sort_order: Number(form.sort_order),
          stock_quantity: form.stock_quantity,
          track_stock: form.track_stock,
          addon_ids: Array.from(form.addon_ids),
        },
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const delMut = useMutation({
    mutationFn: () => del({ data: { id: product!.id } }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <Modal title={product ? "Editar produto" : "Novo produto"} onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Nome">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Descrição">
          <textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="input"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Preço (R$)">
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value || "0") })}
              className="input"
            />
          </Field>
        </div>
        <Field label="Foto do produto">
          <PhotoPicker
            value={form.image_url ?? ""}
            onChange={(v) => setForm({ ...form, image_url: v })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ordem">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || "0", 10) })}
              className="input"
            />
          </Field>
          <div className="flex items-end pb-1">
            <Toggle3D
              on={form.is_active}
              onChange={(v) => setForm({ ...form, is_active: v })}
              onLabel="Ativo no cardápio"
              offLabel="Inativo no cardápio"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Toggle3D
            on={form.track_stock}
            onChange={(v) => setForm({ ...form, track_stock: v })}
            onLabel="Estoque ativo"
            offLabel="Sem controle de estoque"
          />
          {form.track_stock && (
            <label className="flex items-center gap-2 text-sm">
              Quantidade:
              <input
                type="number"
                min={0}
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value || "0", 10) })}
                className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2">
            <Toggle3D
              on={form.accepts_addons}
              onChange={(v) => setForm({ ...form, accepts_addons: v })}
              onLabel="Aceita adicionais"
              offLabel="Sem adicionais"
            />
          </div>
          {form.accepts_addons && (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                Marque quais adicionais aparecem. Se nenhum for marcado, todos os adicionais ativos serão exibidos.
              </p>
              <div className="flex flex-wrap gap-2">
                {addons.filter((a) => a.is_active).map((a) => {
                  const on = form.addon_ids.has(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => {
                        const n = new Set(form.addon_ids);
                        on ? n.delete(a.id) : n.add(a.id);
                        setForm({ ...form, addon_ids: n });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                    >
                      {a.name} +{formatBRL(a.price)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {(saveMut.error || delMut.error) && (
          <p className="text-sm text-destructive">
            {String((saveMut.error as Error)?.message ?? (delMut.error as Error)?.message)}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {product ? (
            <button
              onClick={() => {
                if (confirm("Excluir este produto?")) delMut.mutate();
              }}
              disabled={delMut.isPending}
              className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} /> Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">
              Cancelar
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saveMut.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AddonEditor({ addon, onClose }: { addon: CatalogAddon | null; onClose: () => void }) {
  const save = useServerFn(upsertAddon);
  const del = useServerFn(deleteAddon);
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["catalog"] });
    qc.invalidateQueries({ queryKey: ["menu"] });
  };

  const [form, setForm] = useState({
    name: addon?.name ?? "",
    price: addon?.price ?? 0,
    is_active: addon?.is_active ?? true,
    sort_order: addon?.sort_order ?? 0,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: addon?.id,
          name: form.name,
          price: Number(form.price),
          is_active: form.is_active,
          sort_order: Number(form.sort_order),
        },
      }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const delMut = useMutation({
    mutationFn: () => del({ data: { id: addon!.id } }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  return (
    <Modal title={addon ? "Editar adicional" : "Novo adicional"} onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Nome">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço (R$)">
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value || "0") })}
              className="input"
            />
          </Field>
          <Field label="Ordem">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || "0", 10) })}
              className="input"
            />
          </Field>
        </div>
        <Toggle3D
          on={form.is_active}
          onChange={(v) => setForm({ ...form, is_active: v })}
          onLabel="Ativo"
          offLabel="Inativo"
        />
        {(saveMut.error || delMut.error) && (
          <p className="text-sm text-destructive">
            {String((saveMut.error as Error)?.message ?? (delMut.error as Error)?.message)}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          {addon ? (
            <button
              onClick={() => { if (confirm("Excluir este adicional?")) delMut.mutate(); }}
              disabled={delMut.isPending}
              className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} /> Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm">Cancelar</button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saveMut.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

function PhotoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr("Imagem muito grande (máx. 8MB).");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file, { maxDim: 800, quality: 0.82 });
      onChange(dataUrl);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-secondary text-muted-foreground">
        {value ? (
          <img
            src={value}
            alt=""
            decoding="async"
            width={96}
            height={96}
            className="h-24 w-24 object-cover"
          />
        ) : (
          <ImageIcon size={22} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            <Upload size={14} /> {busy ? "Enviando…" : value ? "Trocar foto" : "Enviar foto"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Remover
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          JPG, PNG ou WebP. A imagem é redimensionada automaticamente.
        </p>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}