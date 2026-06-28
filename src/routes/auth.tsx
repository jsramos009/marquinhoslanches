import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.png.asset.json";

type AuthSearch = { redirect?: string };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Entrar — Marquinhos Lanches" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted && data.user) {
        navigate({ to: (search.redirect as string) || "/admin/pedidos", replace: true });
      }
    });
    return () => {
      mounted = false;
    };
  }, [navigate, search.redirect]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: (search.redirect as string) || "/admin/pedidos", replace: true });
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo("Se o e-mail existir, enviamos um link para você definir a senha.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logoAsset.url} alt="Marquinhos Lanches" className="h-24 w-24" />
          <h1 className="mt-3 font-display text-2xl text-primary">Painel Marquinhos</h1>
          <p className="text-sm text-muted-foreground">Acesso restrito da equipe</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-primary">{info}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Entrando…" : "Entrar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                  setInfo(null);
                }}
                className="block w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                Esqueci minha senha
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Informe seu e-mail e enviaremos um link para você definir uma nova senha.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-primary">{info}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Enviando…" : "Enviar link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setInfo(null);
                }}
                className="block w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
            ← Voltar ao cardápio
          </Link>
        </div>
      </div>
    </div>
  );
}