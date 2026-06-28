import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { OrderRow } from "@/lib/orders.functions";

function beep() {
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    play(880, 0, 0.18);
    play(1320, 0.2, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* no-op */
  }
}

/**
 * Toca um beep e mostra um toast quando aparecem pedidos novos
 * (ids inéditos) na lista. Ignora a primeira execução para não tocar
 * ao carregar a página.
 */
export function useNewOrderAlert(orders: OrderRow[] | undefined) {
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.map((o) => o.id));

    // Primeira execução: só inicializa o baseline.
    if (seenRef.current === null) {
      seenRef.current = ids;
      return;
    }

    const news = orders.filter((o) => !seenRef.current!.has(o.id));
    if (news.length > 0) {
      beep();
      for (const o of news.slice(0, 3)) {
        toast.success("Novo pedido!", {
          description: `${o.customer_name || "Sem nome"} — ${o.items.length} ${o.items.length === 1 ? "item" : "itens"}`,
          duration: 6000,
        });
      }
    }
    seenRef.current = ids;
  }, [orders]);
}