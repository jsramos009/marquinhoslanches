import { createFileRoute } from "@tanstack/react-router";
import { menuQueryOptions } from "@/lib/menu";
import { MenuPage } from "./index";

export const Route = createFileRoute("/cardapio")({
  head: () => ({
    meta: [
      { title: "Marquinhos Lanches — Cardápio Digital" },
      {
        name: "description",
        content:
          "Cardápio digital da Marquinhos Lanches: hambúrgueres especiais, tradicionais, hot dogs e bebidas. Peça pelo WhatsApp.",
      },
      { property: "og:title", content: "Marquinhos Lanches — Cardápio Digital" },
      {
        property: "og:description",
        content: "Hambúrgueres artesanais, hot dogs e bebidas. Peça já!",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(menuQueryOptions());
  },
  component: MenuPage,
});
