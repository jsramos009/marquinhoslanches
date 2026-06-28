/**
 * Reads a File, resizes/recompresses it to a max dimension, and returns a
 * data URL. Keeps the project independent of a public storage bucket.
 */
export async function fileToCompressedDataUrl(
  file: File,
  opts: { maxDim?: number; quality?: number; mime?: string } = {}
): Promise<string> {
  const maxDim = opts.maxDim ?? 800;
  const quality = opts.quality ?? 0.82;
  const mime = opts.mime ?? "image/webp";

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(mime, quality);
}