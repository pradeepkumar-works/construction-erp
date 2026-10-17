'use client';

import { DOC_READ_MAX_PAGES, DOC_READ_MAX_PAGE_BYTES } from '@erp/shared';

/** A page ready to send for reading (AI item 70): a JPEG, and a URL to show it beside the form. */
export interface PageImage {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/** Long side of a page image: enough for small print on an A4 invoice, small enough to send quickly from site. */
const LONG_SIDE = 2000;

/**
 * A photo or PDF as page images: a photo turned upright and scaled down, a PDF's first pages drawn. Done in the browser,
 * so a 20 MB PDF or a 12 MP phone photo goes to the server as a few hundred kilobytes a page.
 */
export async function pagesOf(file: File): Promise<PageImage[]> {
  const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (pdf) return pdfPages(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser cannot open that photo. Send a JPEG or PNG photo, or a PDF.');
  }
  const page = await toJpeg(bitmap.width, bitmap.height, (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h));
  bitmap.close();
  return [page];
}

async function pdfPages(file: File): Promise<PageImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new Error('That PDF could not be opened. It may be damaged or password protected.');
  }
  const pages: PageImage[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, DOC_READ_MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: LONG_SIDE / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push(await toJpeg(canvas.width, canvas.height, (c, w, h) => c.drawImage(canvas, 0, 0, w, h)));
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

/** Draws the source at most LONG_SIDE on its long side and encodes it, smaller again until it fits the page limit. */
async function toJpeg(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Promise<PageImage> {
  let scale = Math.min(1, LONG_SIDE / Math.max(width, height));
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    draw(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (blob && blob.size <= DOC_READ_MAX_PAGE_BYTES) return { blob, url: URL.createObjectURL(blob), width: w, height: h };
    scale *= 0.75;
  }
  throw new Error('That page is too large to send, even made smaller.');
}
