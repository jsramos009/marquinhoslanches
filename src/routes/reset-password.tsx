import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Definir nova senha — Marquinhos Lanches" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function validateRecoveryLink() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const search = url.searchParams;
      const linkError = search.get("error_description") || hash.get("error_description");
      const code = search.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (linkError) {
        if (!cancelled) {
          setInvalidLink(true);
          setError("Este link de redefinição expirou ou já foi usado. Peça um novo link no login.");
        }
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setInvalidLink(true);
          setError("Não foi possível validar este link. Peça um novo link no login.");
          return;
        }
        window.history.replaceState({}, document.title, "/reset-password");
        setReady(true);
        return;
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (sessionError) {
          setInvalidLink(true);
          setError("Não foi possível validar este link. Peça um novo link no login.");
          return;
        }
        window.history.replaceState({}, document.title, "/reset-password");
        setReady(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) setReady(true);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setInvalidLink(false);
        setReady(true);
      }
    });

    validateRecoveryLink();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/admin/pedidos", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logoAsset.url} alt="Marquinhos Lanches" className="h-24 w-24" />
          <h1 className="mt-3 font-display text-2xl text-primary">Definir nova senha</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
          {!ready ? (
            <div className="space-y-3">
              <p className={invalidLink ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                {error || "Validando link… Se nada acontecer em alguns segundos, peça um novo link na tela de login."}
              </p>
              {invalidLink && (
                <Link
                  to="/auth"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  Pedir novo link
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Nova senha
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Confirmar senha
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Salvando…" : "Salvar senha"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary">
            ← Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
}