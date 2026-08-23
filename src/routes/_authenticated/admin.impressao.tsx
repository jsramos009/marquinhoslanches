import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, PlugZap, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { DiningReceipt } from "@/components/admin/DiningReceipt";
import { KitchenTicket } from "@/components/admin/KitchenTicket";
import {
  claimNextPrintJob,
  claimPrintJob,
  completePrintJob,
  failPrintJob,
  getQzCertificate,
  listPrintJobs,
  reconcileOnlinePrintJobs,
  renewPrintJobClaim,
  retryPrintJob,
  signQzPayload,
} from "@/lib/print.functions";
import { thermalHtml, type PrintJob } from "@/lib/print-domain";

export const Route = createFileRoute("/_authenticated/admin/impressao")({
  component: PrintStationPage,
  head: () => ({
    meta: [{ title: "Impressão — Marquinhos" }, { name: "robots", content: "noindex" }],
  }),
});

type QzApi = typeof import("qz-tray").default;
type QzState = { api: QzApi; printers: string[]; selected: string } | null;

function PrintStationPage() {
  const { user, roles } = Route.useRouteContext() as { user: { email?: string }; roles: string[] };
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPrintJobs);
  const reconcileFn = useServerFn(reconcileOnlinePrintJobs);
  const claimNextFn = useServerFn(claimNextPrintJob);
  const claimFn = useServerFn(claimPrintJob);
  const completeFn = useServerFn(completePrintJob);
  const failFn = useServerFn(failPrintJob);
  const renewFn = useServerFn(renewPrintJobClaim);
  const retryFn = useServerFn(retryPrintJob);
  const certificateFn = useServerFn(getQzCertificate);
  const signFn = useServerFn(signQzPayload);
  const stationId = useMemo(() => {
    if (typeof window === "undefined") return "station-server";
    const current = window.sessionStorage.getItem("marquinhos-print-station-id");
    if (current) return current;
    const created = `station-${crypto.randomUUID()}`;
    window.sessionStorage.setItem("marquinhos-print-station-id", created);
    return created;
  }, []);
  const [stationEnabled, setStationEnabled] = useState(false);
  const [qzState, setQzState] = useState<QzState>(null);
  const [connecting, setConnecting] = useState(false);
  const [fallbackJob, setFallbackJob] = useState<PrintJob | null>(null);
  const busyRef = useRef(false);

  const jobsQuery = useQuery({
    queryKey: ["print-jobs"],
    queryFn: () => listFn(),
    refetchInterval: 5_000,
  });
  const jobs = jobsQuery.data ?? [];
  const failed = jobs.filter((job) => job.status === "failed");
  const pending = jobs.filter((job) => job.status === "pending");

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["print-jobs"] });
    await queryClient.invalidateQueries({ queryKey: ["dining-tables"] });
  }, [queryClient]);

  const connectQz = useCallback(async () => {
    setConnecting(true);
    try {
      const imported = await import("qz-tray");
      const qz = imported.default;
      qz.security.setSignatureAlgorithm("SHA512");
      qz.security.setCertificatePromise(() => certificateFn());
      qz.security.setSignaturePromise((payload: string) => signFn({ data: { payload } }));
      if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 2, delay: 1 });
      const found = await qz.printers.find();
      const printers = Array.isArray(found) ? found : [found];
      if (!printers.length) throw new Error("Nenhuma impressora encontrada pelo QZ Tray.");
      const saved = window.localStorage.getItem("marquinhos-thermal-printer");
      const selected = saved && printers.includes(saved) ? saved : printers[0];
      setQzState({ api: qz, printers, selected });
      toast.success("QZ Tray conectado.");
    } catch (error) {
      setQzState(null);
      toast.warning(`QZ indisponível; fallback do navegador ativo. ${(error as Error).message}`);
    } finally {
      setConnecting(false);
    }
  }, [certificateFn, signFn]);

  const dispatchPrint = useCallback(
    async (job: PrintJob) => {
      let heartbeat: number | undefined;
      try {
        await renewFn({ data: { jobId: job.id, stationId } });
        heartbeat = window.setInterval(() => {
          void renewFn({ data: { jobId: job.id, stationId } }).catch((error) =>
            console.error("[print-heartbeat]", error),
          );
        }, 30_000);
        if (qzState) {
          const config = qzState.api.configs.create(qzState.selected, {
            size: { width: 80 },
            units: "mm",
            margins: 0,
          });
          await qzState.api.print(config, [
            {
              type: "pixel",
              format: "html",
              flavor: "plain",
              data: thermalHtml(job.payload, job.document_type),
            },
          ]);
        } else {
          // The native print dialog blocks browser timers. Hold this claim for two
          // hours so another tab cannot recover it while the operator is deciding.
          await renewFn({ data: { jobId: job.id, stationId, holdSeconds: 7200 } });
          setFallbackJob(job);
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          window.print();
          setFallbackJob(null);
          if (!window.confirm("A impressão saiu corretamente?")) {
            throw new Error("Impressão não confirmada pelo operador.");
          }
        }
        await completeFn({ data: { jobId: job.id, stationId } });
        await refresh();
      } catch (error) {
        try {
          await failFn({
            data: {
              jobId: job.id,
              stationId,
              error: (error as Error).message || "Falha de impressão",
            },
          });
        } catch (claimError) {
          console.error("[print-claim-lost]", claimError);
        }
        await refresh();
        throw error;
      } finally {
        if (heartbeat !== undefined) window.clearInterval(heartbeat);
        setFallbackJob(null);
      }
    },
    [completeFn, failFn, qzState, refresh, renewFn, stationId],
  );

  const poll = useCallback(async () => {
    if (!stationEnabled || busyRef.current) return;
    busyRef.current = true;
    try {
      await reconcileFn();
      const job = await claimNextFn({ data: { stationId } });
      if (job) await dispatchPrint(job);
      else await refresh();
    } catch (error) {
      console.error("[print-station]", error);
    } finally {
      busyRef.current = false;
    }
  }, [claimNextFn, dispatchPrint, reconcileFn, refresh, stationEnabled, stationId]);

  useEffect(() => {
    if (!stationEnabled) return;
    void poll();
    const timer = window.setInterval(() => void poll(), 4_000);
    return () => window.clearInterval(timer);
  }, [poll, stationEnabled]);

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => retryFn({ data: { jobId } }),
    onSuccess: refresh,
    onError: (error) => toast.error((error as Error).message),
  });

  async function manualPrint(job: PrintJob) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const claimed = await claimFn({ data: { jobId: job.id, stationId } });
      if (!claimed) throw new Error("Este trabalho já foi reivindicado por outra aba.");
      await dispatchPrint(claimed);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <AdminShell user={user} roles={roles} title="Estação de impressão">
      <div className="space-y-5">
        <section className="grid gap-3 md:grid-cols-3">
          <StatusCard
            label="Estação"
            value={stationEnabled ? "Ativa" : "Pausada"}
            detail={stationId.slice(-12)}
            tone={stationEnabled ? "ok" : "muted"}
          />
          <StatusCard
            label="Impressora"
            value={qzState ? "QZ Tray" : "Fallback do navegador"}
            detail={qzState?.selected ?? "window.print()"}
            tone={qzState ? "ok" : "warning"}
          />
          <StatusCard
            label="Fila"
            value={`${pending.length} pendente(s)`}
            detail={`${failed.length} falha(s) após 3 tentativas`}
            tone={failed.length ? "danger" : "ok"}
          />
        </section>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 p-4">
          <button
            type="button"
            onClick={() => setStationEnabled((value) => !value)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${stationEnabled ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground"}`}
          >
            <PlugZap className="h-4 w-4" /> {stationEnabled ? "Pausar estação" : "Ativar estação"}
          </button>
          <button
            type="button"
            disabled={connecting}
            onClick={() => void connectQz()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary"
          >
            <Printer className="h-4 w-4" /> {connecting ? "Conectando…" : "Conectar QZ Tray"}
          </button>
          {qzState && (
            <select
              value={qzState.selected}
              onChange={(event) => {
                const selected = event.target.value;
                window.localStorage.setItem("marquinhos-thermal-printer", selected);
                setQzState({ ...qzState, selected });
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {qzState.printers.map((printer) => (
                <option key={printer}>{printer}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void poll()}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" /> Sincronizar agora
          </button>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card/70">
          <div className="border-b border-border p-4">
            <h2 className="font-display text-xl">Trabalhos recentes</h2>
            <p className="text-xs text-muted-foreground">
              Pedidos online são apenas lidos; o histórico desta fila fica nas novas tabelas.
            </p>
          </div>
          {jobsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando fila…</p>
          ) : jobs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum trabalho depois da ativação.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-wrap items-center gap-3 p-4">
                  <JobIcon job={job} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {job.document_type === "customer_receipt" ? "Recibo" : "Cozinha"} ·{" "}
                      {job.payload.table_number
                        ? `Mesa ${job.payload.table_number}`
                        : `Pedido #${job.payload.order_id?.slice(0, 8).toUpperCase()}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleString("pt-BR")} · tentativa {job.attempts}
                      /3
                    </p>
                    {job.last_error && (
                      <p className="mt-1 text-xs text-destructive">{job.last_error}</p>
                    )}
                  </div>
                  {job.status === "failed" && (
                    <button
                      type="button"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(job.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
                    </button>
                  )}
                  {job.status === "pending" && !job.auto_print && (
                    <button
                      type="button"
                      onClick={() => void manualPrint(job)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                    >
                      <Printer className="h-3.5 w-3.5" /> Imprimir recibo
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {fallbackJob?.document_type === "customer_receipt" ? (
        <DiningReceipt payload={fallbackJob.payload} />
      ) : fallbackJob ? (
        <KitchenTicket payload={fallbackJob.payload} />
      ) : null}
    </AdminShell>
  );
}

function StatusCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warning" | "danger" | "muted";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl ${color}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function JobIcon({ job }: { job: PrintJob }) {
  if (job.status === "failed") return <AlertTriangle className="h-5 w-5 text-destructive" />;
  if (job.status === "printed") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (job.status === "printing") return <RefreshCw className="h-5 w-5 animate-spin text-primary" />;
  return <Printer className="h-5 w-5 text-amber-400" />;
}
