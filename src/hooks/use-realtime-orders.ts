import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Inscreve em mudanças realtime na tabela `orders` e dispara o callback
 * a cada INSERT/UPDATE/DELETE. Usado para invalidar a query e atualizar
 * a tela na hora — complementa o polling de 5s.
 */
export function useRealtimeOrders(onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel("orders-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => onChange(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}