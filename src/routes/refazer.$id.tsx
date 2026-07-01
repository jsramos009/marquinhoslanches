import { createFileRoute, redirect } from "@tanstack/react-router";
import { getPublicOrderRepeat } from "@/lib/orders-public.functions";

function b64encode(s: string): string {
  if (typeof window === "undefined")
    return Buffer.from(s, "utf8").toString("base64url");
  const b = btoa(unescape(encodeURIComponent(s)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const Route = createFileRoute("/refazer/$id")({
  head: () => ({
    meta: [
      { title: "Refazer pedido — Marquinhos Lanches" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ params }) => {
    try {
      const payload = await getPublicOrderRepeat({ data: { id: params.id } });
      if (!payload || payload.items.length === 0) {
        throw redirect({ to: "/" });
      }
      const token = b64encode(
        JSON.stringify({
          i: payload.items,
          n: payload.notes ?? undefined,
        }),
      );
      throw redirect({ to: "/", search: { r: token } as any });
    } catch (e) {
      if ((e as any)?.isRedirect) throw e;
      throw redirect({ to: "/" });
    }
  },
  component: () => null,
});