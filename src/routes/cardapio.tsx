import { createFileRoute } from "@tanstack/react-router";
import { menuQueryOptions } from "@/lib/menu";
import { MenuPage } from "./index";

export const Route = createFileRoute("/cardapio")({
  head: () => ({
    meta: [
      { title: "Marquinhos Lanches — Cardápio Online" },
      {
        name: "description",
        content: "X-burgues, hot dogs e bebidas. Peça já pelo nosso cardápio online!",
      },
      { property: "og:title", content: "Marquinhos Lanches — Cardápio Online" },
      {
        property: "og:description",
        content: "X-burgues, hot dogs e bebidas. Peça já pelo nosso cardápio online!",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(menuQueryOptions());
  },
  component: MenuPage,
});
