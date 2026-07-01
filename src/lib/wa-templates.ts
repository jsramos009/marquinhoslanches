import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WaTemplates = { accepted: string; on_way: string };

export function useWhatsappTemplates(): WaTemplates {
  const q = useQuery({
    queryKey: ["app-settings", "wa-templates"],
    queryFn: async (): Promise<WaTemplates> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["wa_msg_accepted", "wa_msg_on_way"]);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => {
        if (r?.key) map[r.key] = r.value ?? "";
      });
      return {
        accepted: map.wa_msg_accepted ?? "",
        on_way: map.wa_msg_on_way ?? "",
      };
    },
    staleTime: 5 * 60_000,
  });
  return q.data ?? { accepted: "", on_way: "" };
}