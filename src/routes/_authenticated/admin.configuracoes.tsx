import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Save, Share2, FileDown, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  getAppSettingsAdmin,
  updateAppSettings,
  type AppSettings,
} from "@/lib/app-settings.functions";
import { menuQueryOptions } from "@/lib/menu";
import { buildMenuPdf } from "@/lib/menu-pdf";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: ConfiguracoesPage,
  head: () => ({
    meta: [
      { title: "Configurações — Marquinhos" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ConfiguracoesPage() {
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
  const fetchSettings = useServerFn(getAppSettingsAdmin);
  const saveFn = useServerFn(updateAppSettings);

  const query = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => fetchSettings(),
    enabled: isAdmin,
  });

  const [form, setForm] = useState<AppSettings>({
    pix_key: "",
    pix_merchant_name: "",
    pix_merchant_city: "",
    menu_link: "",
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const menuQ = useQuery(menuQueryOptions());

  const downloadPdf = async () => {
    setPdfError(null);
    setPdfLoading(true);
    try {
      const menu = menuQ.data ?? (await menuQ.refetch()).data;
      if (!menu) throw new Error("Card\u00e1pio n\u00e3o carregou.");
      const blob = await buildMenuPdf(menu);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cardapio-marquinhos-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (data: AppSettings) => saveFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      qc.invalidateQueries({ queryKey: ["app-settings", "public"] });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
    },
  });

  const update = (k: keyof AppSettings, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const menuLink = form.menu_link?.trim() || "";
  const whatsappShareUrl = menuLink
    ? `https://wa.me/?text=${encodeURIComponent(
        `Confira nosso cardápio digital: ${menuLink}`,
      )}`
    : "";

  return (
    <AdminShell user={user} roles={roles} title="Configurações">
      <div className="mx-auto max-w-3xl space-y-6">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-card/40 p-5">
              <h2 className="font-display text-lg text-primary">
                Link do cardápio
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Esse é o link que você envia para seus clientes.
              </p>
              <input
                type="url"
                value={form.menu_link}
                onChange={(e) => update("menu_link", e.target.value)}
                placeholder="https://seudominio.com"
                className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!menuLink}
                  onClick={() => copy("link", menuLink)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Copy size={14} />
                  {copied === "link" ? "Copiado!" : "Copiar link"}
                </button>
                <a
                  href={whatsappShareUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90 ${
                    !menuLink ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <Share2 size={14} /> Compartilhar no WhatsApp
                </a>
                <a
                  href={menuLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs hover:bg-secondary/80 ${
                    !menuLink ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <ExternalLink size={14} /> Abrir
                </a>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/40 p-5">
              <h2 className="font-display text-lg text-primary">
                Cardápio em PDF
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Baixe uma versão do cardápio (com fotos) para enviar aos clientes.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {pdfLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Gerando…
                    </>
                  ) : (
                    <>
                      <FileDown size={14} /> Baixar cardápio (PDF)
                    </>
                  )}
                </button>
                {pdfError && (
                  <span className="text-xs text-destructive">{pdfError}</span>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/40 p-5">
              <h2 className="font-display text-lg text-primary">PIX</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Dados usados para gerar o QR Code do PIX no checkout.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs text-muted-foreground">Chave PIX</span>
                  <input
                    value={form.pix_key}
                    onChange={(e) => update("pix_key", e.target.value)}
                    placeholder="+5594999999999, e-mail, CPF/CNPJ ou aleatória"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">
                    Nome do recebedor
                  </span>
                  <input
                    value={form.pix_merchant_name}
                    onChange={(e) =>
                      update("pix_merchant_name", e.target.value)
                    }
                    maxLength={25}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">
                    Cidade do recebedor
                  </span>
                  <input
                    value={form.pix_merchant_city}
                    onChange={(e) =>
                      update("pix_merchant_city", e.target.value)
                    }
                    maxLength={15}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </section>

            <div className="flex items-center justify-end gap-3">
              {savedToast && (
                <span className="text-xs text-emerald-500">
                  Configurações salvas!
                </span>
              )}
              <button
                type="button"
                onClick={() => save.mutate(form)}
                disabled={save.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <Save size={16} />
                {save.isPending ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
            {save.isError && (
              <p className="text-right text-xs text-destructive">
                {(save.error as Error)?.message ?? "Erro ao salvar."}
              </p>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}