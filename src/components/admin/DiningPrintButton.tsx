import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { DiningReceipt } from "@/components/admin/DiningReceipt";
import {
  claimPrintJob,
  completePrintJob,
  enqueueDiningPrintJob,
  failPrintJob,
  getQzCertificate,
  signQzPayload,
} from "@/lib/print.functions";
import { thermalHtml, type PrintJob } from "@/lib/print-domain";

export function DiningPrintButton({ sessionId }: { sessionId: string }) {
  const enqueueFn = useServerFn(enqueueDiningPrintJob);
  const claimFn = useServerFn(claimPrintJob);
  const completeFn = useServerFn(completePrintJob);
  const failFn = useServerFn(failPrintJob);
  const certificateFn = useServerFn(getQzCertificate);
  const signFn = useServerFn(signQzPayload);
  const queryClient = useQueryClient();
  const [fallbackJob, setFallbackJob] = useState<PrintJob | null>(null);
  const stationId = useMemo(() => {
    if (typeof window === "undefined") return "orders-server";
    const current = window.sessionStorage.getItem("marquinhos-print-station-id");
    if (current) return current;
    const created = `station-${crypto.randomUUID()}`;
    window.sessionStorage.setItem("marquinhos-print-station-id", created);
    return created;
  }, []);

  const printMutation = useMutation({
    mutationFn: async () => {
      const queued = await enqueueFn({ data: { sessionId } });
      const claimed = await claimFn({ data: { jobId: queued.id, stationId } });
      if (!claimed) throw new Error("Esta comanda já está sendo impressa por outra estação.");

      try {
        try {
          const imported = await import("qz-tray");
          const qz = imported.default;
          qz.security.setSignatureAlgorithm("SHA512");
          qz.security.setCertificatePromise(() => certificateFn());
          qz.security.setSignaturePromise((payload: string) => signFn({ data: { payload } }));
          if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 2, delay: 1 });
          const found = await qz.printers.find();
          const printers = Array.isArray(found) ? found : [found];
          if (!printers.length) throw new Error("Nenhuma impressora térmica encontrada.");
          const saved = window.localStorage.getItem("marquinhos-thermal-printer");
          const selected = saved && printers.includes(saved) ? saved : printers[0];
          await qz.print(
            qz.configs.create(selected, { size: { width: 80 }, units: "mm", margins: 0 }),
            [
              {
                type: "pixel",
                format: "html",
                flavor: "plain",
                data: thermalHtml(claimed.payload, claimed.document_type),
              },
            ],
          );
        } catch (qzError) {
          setFallbackJob(claimed);
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          window.print();
          if (!window.confirm("A impressão saiu corretamente?")) {
            throw new Error(
              `Impressão não confirmada. ${(qzError as Error).message || "QZ indisponível."}`,
            );
          }
        }
        await completeFn({ data: { jobId: claimed.id, stationId } });
      } catch (error) {
        try {
          await failFn({
            data: {
              jobId: claimed.id,
              stationId,
              error: (error as Error).message || "Falha de impressão",
            },
          });
        } catch (claimError) {
          console.error("[dining-print-claim-lost]", claimError);
        }
        throw error;
      } finally {
        setFallbackJob(null);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["print-jobs"] });
      toast.success("Comanda enviada para a impressora.");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <>
      <button
        type="button"
        disabled={printMutation.isPending}
        onClick={() => printMutation.mutate()}
        className="grid h-8 w-8 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        title="Imprimir comanda"
        aria-label="Imprimir comanda"
      >
        {printMutation.isPending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
      </button>
      {fallbackJob ? <DiningReceipt payload={fallbackJob.payload} /> : null}
    </>
  );
}
