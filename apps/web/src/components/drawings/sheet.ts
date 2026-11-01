'use client';

import type { AttachmentDto } from '@erp/shared';
import { drawingFileKind } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import type { DxfLayer } from './dxf';

/**
 * A drawing file opened for the viewer: a PDF (pdf.js), a photo or scan, or a DXF. Each has pages of a known
 * shape and draws a page onto a canvas at the size asked for, on white, as on paper, in either theme.
 */
export interface Sheet {
  kind: 'pdf' | 'image' | 'dxf';
  pages: number;
  /** Width over height of a page */
  aspect(page: number): Promise<number>;
  /** Draws the page filling the canvas; a newer call on the same canvas cancels an unfinished one. */
  draw(canvas: HTMLCanvasElement, page: number, opts?: { hiddenLayers?: Set<string> }): Promise<void>;
  layers: DxfLayer[];
  /** A DXF's width in its own drawing units, for a scale from those units */
  drawingWidth?: number;
  /** Pixels can be read back (comparing revisions, saving a marked-up copy) */
  readable: boolean;
  destroy(): void;
}

const whiten = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
};

async function openPdf(url: string): Promise<Sheet> {
  // The legacy build: the modern one needs very recent browsers (Map.getOrInsertComputed), which older phones lack.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({ url }).promise;
  } catch {
    throw new Error('This PDF could not be opened. It may be damaged or password protected; open the file instead.');
  }
  const tasks = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();
  return {
    kind: 'pdf',
    pages: doc.numPages,
    layers: [],
    readable: true,
    async aspect(page) {
      const vp = (await doc.getPage(page)).getViewport({ scale: 1 });
      return vp.width / vp.height;
    },
    async draw(canvas, page) {
      tasks.get(canvas)?.cancel();
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: canvas.width / base.width });
      const ctx = whiten(canvas);
      const task = p.render({ canvas, canvasContext: ctx, viewport });
      tasks.set(canvas, task);
      try {
        await task.promise;
      } catch (e) {
        if ((e as Error)?.name !== 'RenderingCancelledException') throw e;
      }
    },
    destroy: () => void doc.destroy(),
  };
}

function loadImage(url: string, crossOrigin: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be opened'));
    img.src = url;
  });
}

async function openImage(url: string): Promise<Sheet> {
  // Read with CORS so the pixels can be compared and saved; a server that does not allow it still shows the image.
  let readable = true;
  const img = await loadImage(url, true).catch(() => {
    readable = false;
    return loadImage(url, false);
  });
  return {
    kind: 'image',
    pages: 1,
    layers: [],
    readable,
    aspect: async () => img.naturalWidth / img.naturalHeight,
    async draw(canvas) {
      whiten(canvas).drawImage(img, 0, 0, canvas.width, canvas.height);
    },
    destroy: () => undefined,
  };
}

async function openDxf(url: string): Promise<Sheet> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('This DXF file could not be downloaded; check the connection and open it again.');
  const { parseDxf } = await import('./dxf');
  const drawing = await parseDxf(await res.text());
  return {
    kind: 'dxf',
    pages: 1,
    layers: drawing.layers,
    drawingWidth: drawing.width,
    readable: true,
    aspect: async () => drawing.width / drawing.height,
    async draw(canvas, _page, opts) {
      drawing.draw(whiten(canvas), canvas.width, canvas.height, opts?.hiddenLayers ?? new Set());
    },
    destroy: () => undefined,
  };
}

export async function openSheet(file: AttachmentDto): Promise<Sheet> {
  const url = fileUrl(file.url);
  const kind = drawingFileKind(file);
  if (kind === 'pdf') return openPdf(url);
  if (kind === 'image') return openImage(url);
  if (kind === 'dxf') return openDxf(url);
  throw new Error(kind === 'dwg' ? 'DWG files cannot be shown in the browser. Download it for AutoCAD, or attach a PDF or DXF of the sheet to this revision.' : 'This file cannot be shown here; open it instead.');
}

/** Largest canvas side and area browsers draw reliably (iOS Safari limits a canvas to about 16 million pixels). */
const MAX_SIDE = 8192;
const MAX_AREA = 16_000_000;
export function canvasSize(width: number, height: number) {
  let s = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (width * height * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (width * height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/**
 * Two revisions overlaid (same page size): ink only on the older one red, only on the newer one blue, on both grey.
 * `oldCanvas` and `newCanvas` are drawn at the same size; the result is drawn into `out`.
 */
export function compareInto(out: HTMLCanvasElement, oldCanvas: HTMLCanvasElement, newCanvas: HTMLCanvasElement, colors: { old: string; new: string; both: string }) {
  const w = out.width;
  const h = out.height;
  const read = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const a = read(oldCanvas);
  const b = read(newCanvas);
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [cOld, cNew, cBoth] = [rgb(colors.old), rgb(colors.new), rgb(colors.both)];
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Darkness 0 (white) to 1 (black) of each.
    const da = 1 - (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) / 255;
    const db = 1 - (b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114) / 255;
    const inA = da > 0.12;
    const inB = db > 0.12;
    const c = inA && inB ? cBoth : inA ? cOld : inB ? cNew : null;
    const k = Math.max(da, db);
    d[i] = c ? 255 - (255 - c[0]) * Math.min(1, k * 1.4) : 255;
    d[i + 1] = c ? 255 - (255 - c[1]) * Math.min(1, k * 1.4) : 255;
    d[i + 2] = c ? 255 - (255 - c[2]) * Math.min(1, k * 1.4) : 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
