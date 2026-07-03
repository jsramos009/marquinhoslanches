import { createFileRoute } from "@tanstack/react-router";
import { menuQueryOptions } from "@/lib/menu";
import { MenuPage } from "./index";

export const Route = createFileRoute("/cardapio")({
  head: () => ({
    meta: [
      { title: "Marquinhos Lanches, cardapio online" },
      {
        name: "description",
        content: "Marquinhos Lanches, cardapio online",
      },
      { property: "og:title", content: "Marquinhos Lanches, cardapio online" },
      {
        property: "og:description",
        content: "Marquinhos Lanches, cardapio online",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(menuQueryOptions());
  },
  component: MenuPage,
});
