import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(800).optional().default(""),
});

export const generateProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const prompt = [
      `Fotografia profissional de comida para cardápio de delivery: ${data.name}.`,
      data.description ? `Ingredientes/descrição: ${data.description}.` : "",
      "Vista de cima levemente angulada (45 graus), iluminação natural suave, fundo neutro de madeira clara ou superfície limpa, cores vibrantes e apetitosas, alta nitidez, estilo realista, sem texto, sem marca d'água, enquadramento quadrado centralizado.",
    ].filter(Boolean).join(" ");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de geração atingido. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos na workspace.");
      throw new Error(`Falha ao gerar imagem (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Resposta sem imagem.");
    return { dataUrl: `data:image/png;base64,${b64}` };
  });
