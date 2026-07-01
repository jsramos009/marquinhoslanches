import { jsPDF } from "jspdf";
import { formatBRL, type MenuData } from "@/lib/menu";

// Carrega imagem como dataURL (para embutir no PDF). Se falhar (CORS/erro), retorna null.
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type Palette = {
  primary: [number, number, number];
  text: [number, number, number];
  muted: [number, number, number];
  bgCard: [number, number, number];
  bgHeader: [number, number, number];
  border: [number, number, number];
};

const PAL: Palette = {
  // Alinhado com o gradiente vermelho da marca (aprox.)
  primary: [220, 38, 38], // red-600
  text: [23, 23, 23],
  muted: [110, 110, 115],
  bgCard: [252, 249, 244], // brand-cream aprox
  bgHeader: [24, 12, 12],
  border: [225, 220, 210],
};

/**
 * Gera um PDF do cardápio no mesmo padrão visual do site (vermelho + cream),
 * com fotos, descrição e preço. Salva como blob e devolve a URL.
 */
export async function buildMenuPdf(menu: MenuData): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  // Header
  const drawHeader = () => {
    doc.setFillColor(...PAL.bgHeader);
    doc.rect(0, 0, pageW, 68, "F");
    doc.setFillColor(...PAL.primary);
    doc.rect(0, 68, pageW, 4, "F");
    doc.setTextColor(...PAL.primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("MARQUINHOS LANCHES", margin, 34);
    doc.setTextColor(245, 240, 230);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Cardápio Digital — peça pelo WhatsApp (94) 99103-2483", margin, 54);
  };

  // Pré-carrega imagens dos produtos (falhas silenciosas)
  const imageCache = new Map<string, string | null>();
  await Promise.all(
    menu.products
      .filter((p) => p.image_url)
      .map(async (p) => {
        const data = await loadImageAsDataUrl(p.image_url as string);
        imageCache.set(p.id, data);
      }),
  );

  const productsByCat = new Map<string, typeof menu.products>();
  for (const p of menu.products) {
    const arr = productsByCat.get(p.category_id) ?? [];
    arr.push(p);
    productsByCat.set(p.category_id, arr);
  }

  const cardHeight = 90;
  const cardGap = 10;
  const imgSize = 70;
  let y = 100;

  drawHeader();

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      drawHeader();
      y = 100;
    }
  };

  for (const cat of menu.categories) {
    const list = productsByCat.get(cat.id) ?? [];
    if (list.length === 0) continue;

    ensureSpace(40);
    // Barra da categoria (estilo do site)
    doc.setFillColor(...PAL.primary);
    doc.rect(margin, y, pageW - margin * 2, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(cat.name.toUpperCase(), pageW / 2, y + 19, { align: "center" });
    y += 40;

    for (const p of list) {
      ensureSpace(cardHeight + cardGap);
      // Card
      doc.setFillColor(...PAL.bgCard);
      doc.setDrawColor(...PAL.border);
      doc.roundedRect(margin, y, pageW - margin * 2, cardHeight, 6, 6, "FD");

      // Imagem
      const imgX = margin + 10;
      const imgY = y + (cardHeight - imgSize) / 2;
      const dataUrl = imageCache.get(p.id);
      if (dataUrl) {
        try {
          const fmt = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(dataUrl, fmt, imgX, imgY, imgSize, imgSize, undefined, "FAST");
        } catch {
          doc.setFillColor(240, 235, 225);
          doc.roundedRect(imgX, imgY, imgSize, imgSize, 4, 4, "F");
        }
      } else {
        doc.setFillColor(240, 235, 225);
        doc.roundedRect(imgX, imgY, imgSize, imgSize, 4, 4, "F");
        doc.setTextColor(...PAL.muted);
        doc.setFontSize(20);
        doc.text("🍔", imgX + imgSize / 2, imgY + imgSize / 2 + 6, { align: "center" });
      }

      // Texto
      const textX = imgX + imgSize + 14;
      const textW = pageW - margin - textX - 90;
      doc.setTextColor(...PAL.primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const nameLines = doc.splitTextToSize(p.name, textW);
      doc.text(nameLines.slice(0, 1), textX, y + 22);

      if (p.description) {
        doc.setTextColor(...PAL.muted);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const descLines = doc.splitTextToSize(p.description, textW);
        doc.text(descLines.slice(0, 3), textX, y + 40);
      }

      // Preço
      doc.setTextColor(...PAL.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(formatBRL(p.price), pageW - margin - 12, y + cardHeight - 14, {
        align: "right",
      });

      y += cardHeight + cardGap;
    }

    y += 6;
  }

  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(...PAL.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      `Marquinhos Lanches — página ${i} de ${pages}`,
      pageW / 2,
      pageH - 14,
      { align: "center" },
    );
  }

  return doc.output("blob");
}