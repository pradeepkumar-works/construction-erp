'use client';

import type { IDxf, IEntity } from 'dxf-parser';

/**
 * DXF drawings in the browser: parsed with dxf-parser, flattened once into lines and text in drawing units
 * (blocks placed, arcs and bulges cut into short segments), then drawn on a canvas at whatever size the viewer asks.
 * Model space only; hatches show their outline, and text uses the browser's sans-serif font in place of SHX fonts.
 */

type Path = { t: 'path'; layer: string; color: string; pts: number[]; closed: boolean; fill: boolean };
type Text = { t: 'text'; layer: string; color: string; x: number; y: number; h: number; rot: number; text: string; align: CanvasTextAlign; baseline: CanvasTextBaseline };
type Prim = Path | Text;

export interface DxfLayer {
  name: string;
  color: string;
}

export interface DxfDrawing {
  layers: DxfLayer[];
  /** Extents in drawing units */
  minX: number;
  minY: number;
  width: number;
  height: number;
  draw(ctx: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number, hidden: Set<string>): void;
}

/** A 2D affine transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const angleOf = (m: M) => Math.atan2(m[1], m[0]);

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
/** White and near-white lines (colour 7 and pale yellows) would vanish on the white sheet, so they draw dark. */
function ink(rgb: number | undefined) {
  if (rgb === undefined || rgb === null || Number.isNaN(rgb)) return '#000000';
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.85) return '#000000';
  if (lum > 0.6) return hex(((r * 0.55) << 16) | ((g * 0.55) << 8) | (b * 0.55));
  return hex(rgb);
}

/** Points of an arc from a0 to a1 (radians, counter-clockwise), enough segments to look round at any zoom up to 16x. */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, out: number[]) {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(4, Math.min(256, Math.ceil((sweep / (Math.PI * 2)) * 96)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/** The arc a polyline vertex's bulge puts between two points (bulge = tan of a quarter of the sweep, + counter-clockwise). */
function bulgePoints(x1: number, y1: number, x2: number, y2: number, bulge: number, out: number[]) {
  const sweep = 4 * Math.atan(bulge);
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (!d) return;
  const h = d / (2 * Math.tan(sweep / 2));
  const cx = (x1 + x2) / 2 - (h * (y2 - y1)) / d;
  const cy = (y1 + y2) / 2 + (h * (x2 - x1)) / d;
  const r = Math.hypot(x1 - cx, y1 - cy);
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const n = Math.max(2, Math.min(128, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 96)));
  for (let i = 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
}

/** MTEXT without its formatting codes (\P is a new line). */
const plainMtext = (s: string) =>
  s
    .replace(/\\P/g, '\n')
    .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*)[#^/]([^;]*);/g, '$1/$2')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±');

const H_ALIGN: Record<number, CanvasTextAlign> = { 0: 'left', 1: 'center', 2: 'right', 3: 'left', 4: 'center', 5: 'left' };
const V_BASE: Record<number, CanvasTextBaseline> = { 0: 'alphabetic', 1: 'bottom', 2: 'middle', 3: 'top' };

type AnyEntity = IEntity & Record<string, unknown>;
type Pt = { x: number; y: number };

function flatten(dxf: IDxf): { prims: Prim[]; layers: DxfLayer[] } {
  const layerTable = (dxf.tables as { layer?: { layers?: Record<string, { name: string; color?: number; visible?: boolean; frozen?: boolean }> } } | undefined)?.layer?.layers ?? {};
  const layerColor = (name: string) => ink(layerTable[name]?.color);
  const prims: Prim[] = [];
  const used = new Set<string>();

  const colorOf = (e: AnyEntity, layer: string, byBlock: string) => {
    if (e.colorIndex === 0) return byBlock;
    if (e.colorIndex === 256 || e.colorIndex === undefined) return layerColor(layer);
    return ink(e.color as number);
  };

  const walk = (entities: IEntity[], m: M, depth: number, blockLayer: string | null, blockColor: string) => {
    for (const raw of entities) {
      const e = raw as AnyEntity;
      if (e.inPaperSpace || e.visible === false) continue;
      // Entities on layer 0 inside a block take the INSERT's layer.
      const layer = blockLayer && (!e.layer || e.layer === '0') ? blockLayer : (e.layer ?? '0');
      const color = colorOf(e, layer, blockColor);
      const mirror = ((e.extrusionDirectionZ as number | undefined) ?? (e.extrusionDirection as Pt & { z?: number } | undefined)?.z ?? 1) < 0;
      const em: M = mirror ? mul(m, [-1, 0, 0, 1, 0, 0]) : m;
      const path = (pts: number[], closed = false, fill = false) => {
        if (pts.length < 4) return;
        const out: number[] = [];
        for (let i = 0; i < pts.length; i += 2) out.push(...apply(em, pts[i], pts[i + 1]));
        prims.push({ t: 'path', layer, color, pts: out, closed, fill });
        used.add(layer);
      };
      switch (e.type) {
        case 'LINE': {
          const v = e.vertices as Pt[];
          if (v?.length >= 2) path([v[0].x, v[0].y, v[1].x, v[1].y]);
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const v = (e.vertices as (Pt & { bulge?: number })[]) ?? [];
          const closed = !!e.shape;
          const pts: number[] = [];
          const n = v.length;
          for (let i = 0; i < n; i++) {
            if (!pts.length) pts.push(v[i].x, v[i].y);
            const next = i + 1 < n ? v[i + 1] : closed ? v[0] : null;
            if (!next) break;
            if (v[i].bulge) bulgePoints(v[i].x, v[i].y, next.x, next.y, v[i].bulge!, pts);
            else pts.push(next.x, next.y);
          }
          path(pts, false);
          break;
        }
        case 'CIRCLE': {
          const c = e.center as Pt;
          const pts: number[] = [];
          arcPoints(c.x, c.y, e.radius as number, 0, Math.PI * 2, pts);
          path(pts, true);
          break;
        }
        case 'ARC': {
          const c = e.center as Pt;
          const pts: number[] = [];
          arcPoints(c.x, c.y, e.radius as number, e.startAngle as number, e.endAngle as number, pts);
          path(pts);
          break;
        }
        case 'ELLIPSE': {
          const c = e.center as Pt;
          const maj = e.majorAxisEndPoint as Pt;
          const ratio = (e.axisRatio as number) || 1;
          const a = Math.hypot(maj.x, maj.y);
          const rot = Math.atan2(maj.y, maj.x);
          let s0 = (e.startAngle as number) ?? 0;
          let s1 = (e.endAngle as number) ?? Math.PI * 2;
          if (s1 <= s0) s1 += Math.PI * 2;
          if (Math.abs(s1 - s0) < 1e-9) {
            s0 = 0;
            s1 = Math.PI * 2;
          }
          const pts: number[] = [];
          const n = 96;
          for (let i = 0; i <= n; i++) {
            const t = s0 + ((s1 - s0) * i) / n;
            const x = a * Math.cos(t);
            const y = a * ratio * Math.sin(t);
            pts.push(c.x + x * Math.cos(rot) - y * Math.sin(rot), c.y + x * Math.sin(rot) + y * Math.cos(rot));
          }
          path(pts);
          break;
        }
        case 'SPLINE': {
          // Through its fit points when it has them, else along its control points: close enough to read on site.
          const v = ((e.fitPoints as Pt[] | undefined)?.length ? e.fitPoints : e.controlPoints) as Pt[] | undefined;
          if (v?.length) path(v.flatMap((p) => [p.x, p.y]), !!e.closed);
          break;
        }
        case 'SOLID':
        case '3DFACE': {
          const v = (e.points ?? e.vertices) as Pt[] | undefined;
          if (!v?.length) break;
          // SOLID's third and fourth corners are stored crosswise.
          const order = e.type === 'SOLID' && v.length === 4 ? [v[0], v[1], v[3], v[2]] : v;
          path(order.flatMap((p) => [p.x, p.y]), true, e.type === 'SOLID');
          break;
        }
        case 'POINT': {
          const p = e.position as Pt;
          if (p) path([p.x, p.y, p.x, p.y], false);
          break;
        }
        case 'TEXT':
        case 'ATTDEF':
        case 'MTEXT': {
          const mtext = e.type === 'MTEXT';
          const str = mtext ? plainMtext(String(e.text ?? '')) : String(e.text ?? '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');
          if (!str.trim()) break;
          const halign = (e.halign as number) ?? 0;
          const valign = (e.valign as number) ?? 0;
          const at = (mtext ? e.position : halign || valign ? (e.endPoint ?? e.startPoint) : e.startPoint) as Pt | undefined;
          if (!at) break;
          const [x, y] = apply(em, at.x, at.y);
          const h = (((mtext ? e.height : e.textHeight) as number) || 2.5) * scaleOf(em);
          let rot = (((e.rotation as number) || 0) * Math.PI) / 180;
          if (mtext && e.directionVector) rot = Math.atan2((e.directionVector as Pt).y, (e.directionVector as Pt).x);
          const ap = (e.attachmentPoint as number) || 1;
          const align: CanvasTextAlign = mtext ? (['left', 'center', 'right'] as const)[(ap - 1) % 3] : (H_ALIGN[halign] ?? 'left');
          const baseline: CanvasTextBaseline = mtext ? (['top', 'middle', 'bottom'] as const)[Math.floor((ap - 1) / 3)] : (V_BASE[valign] ?? 'alphabetic');
          prims.push({ t: 'text', layer, color, x, y, h, rot: rot + angleOf(em), text: str, align, baseline });
          used.add(layer);
          break;
        }
        case 'INSERT':
        case 'DIMENSION': {
          const name = (e.type === 'DIMENSION' ? e.block : e.name) as string | undefined;
          const block = name ? dxf.blocks?.[name] : undefined;
          if (!block?.entities?.length || depth > 8) break;
          const base = block.position ?? { x: 0, y: 0 };
          if (e.type === 'DIMENSION') {
            walk(block.entities, mul(em, [1, 0, 0, 1, -base.x, -base.y]), depth + 1, layer, color);
            break;
          }
          const pos = (e.position as Pt) ?? { x: 0, y: 0 };
          const sx = (e.xScale as number) || 1;
          const sy = (e.yScale as number) || 1;
          const rot = (((e.rotation as number) || 0) * Math.PI) / 180;
          const cols = Math.max(1, (e.columnCount as number) || 1);
          const rows = Math.max(1, (e.rowCount as number) || 1);
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++) {
              const ox = c * ((e.columnSpacing as number) || 0);
              const oy = r * ((e.rowSpacing as number) || 0);
              const cos = Math.cos(rot);
              const sin = Math.sin(rot);
              const place: M = [cos * sx, sin * sx, -sin * sy, cos * sy, pos.x + cos * ox - sin * oy, pos.y + sin * ox + cos * oy];
              walk(block.entities, mul(mul(em, place), [1, 0, 0, 1, -base.x, -base.y]), depth + 1, layer, color);
            }
          break;
        }
        default:
          break;
      }
    }
  };
  walk(dxf.entities ?? [], I, 0, null, '#000000');
  const layers = [...used].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, color: layerColor(name) }));
  return { prims, layers };
}

/** The drawing's extents, leaving out stray far-away points (the 0.5 % at each edge) that would shrink the drawing to a dot. */
function extents(prims: Prim[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of prims) {
    if (p.t === 'text') {
      xs.push(p.x);
      ys.push(p.y);
    } else
      for (let i = 0; i < p.pts.length; i += 2) {
        xs.push(p.pts[i]);
        ys.push(p.pts[i + 1]);
      }
  }
  if (!xs.length) return { minX: 0, minY: 0, width: 1, height: 1 };
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const cut = xs.length > 2000 ? Math.floor(xs.length * 0.005) : 0;
  const minX = xs[cut];
  const maxX = xs[xs.length - 1 - cut];
  const minY = ys[cut];
  const maxY = ys[ys.length - 1 - cut];
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  // A margin round the drawing, as on a printed sheet.
  const m = Math.max(w, h) * 0.03;
  return { minX: minX - m, minY: minY - m, width: w + 2 * m, height: h + 2 * m };
}

export async function parseDxf(text: string): Promise<DxfDrawing> {
  const { default: DxfParser } = await import('dxf-parser');
  let dxf: IDxf | null;
  try {
    dxf = new DxfParser().parseSync(text);
  } catch {
    dxf = null;
  }
  if (!dxf) throw new Error('This DXF file could not be read. Save it again from AutoCAD as DXF (ASCII), or attach a PDF of it.');
  const { prims, layers } = flatten(dxf);
  if (!prims.length) throw new Error('This DXF file has nothing in model space to show. Attach a PDF of the sheet as well.');
  const box = extents(prims);
  return {
    layers,
    ...box,
    draw(ctx, pw, ph, hidden) {
      const s = Math.min(pw / box.width, ph / box.height);
      const ox = (pw - box.width * s) / 2;
      const oy = (ph - box.height * s) / 2;
      const X = (x: number) => ox + (x - box.minX) * s;
      const Y = (y: number) => ph - oy - (y - box.minY) * s;
      ctx.lineWidth = Math.max(1, pw / 2400);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const p of prims) {
        if (hidden.has(p.layer)) continue;
        if (p.t === 'path') {
          ctx.beginPath();
          ctx.moveTo(X(p.pts[0]), Y(p.pts[1]));
          for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(X(p.pts[i]), Y(p.pts[i + 1]));
          if (p.closed) ctx.closePath();
          if (p.fill) {
            ctx.fillStyle = p.color;
            ctx.fill();
          } else {
            ctx.strokeStyle = p.color;
            ctx.stroke();
          }
        } else {
          const size = p.h * s;
          if (size < 2) continue;
          ctx.save();
          ctx.translate(X(p.x), Y(p.y));
          ctx.rotate(-p.rot);
          ctx.fillStyle = p.color;
          ctx.font = `${size}px Arial, Helvetica, sans-serif`;
          ctx.textAlign = p.align;
          ctx.textBaseline = p.baseline;
          p.text.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * size * 1.4));
          ctx.restore();
        }
      }
    },
  };
}
