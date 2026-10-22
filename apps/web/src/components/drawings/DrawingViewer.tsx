'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, App, Button, Checkbox, Flex, Popover, Result, Select, Space, Spin, Switch, Tooltip, Typography, theme } from 'antd';
import {
  ArrowRightOutlined,
  BorderOutlined,
  CloudOutlined,
  CommentOutlined,
  DownloadOutlined,
  DragOutlined,
  ExpandOutlined,
  ExportOutlined,
  FontSizeOutlined,
  HighlightOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import type { DocumentRevisionDto, DrawingMarkupDto, MarkupColor, MarkupKind, MarkupPoint } from '@erp/shared';
import { MARKUP_COLORS, MARKUP_COLOR_LABELS, MARKUP_KIND_LABELS, MARKUP_MAX_POINTS, REVISION_STATUS_LABELS, canViewDrawingFile, drawingFileKind, marksForSheet, roundPoint } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { singleKeysOn } from '@/lib/shortcuts';
import { useCreateMarkup, useDeleteMarkup, useDocument, useDrawingMarkups, useLinkMarkupRfi, useResolveMarkup } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { RfiFormModal } from '@/components/documents/RfiFormModal';
import { RevisionStatusTag } from '@/components/documents/docUi';
import { MarkShape, MARKUP_INK, VB_W, type ShownMark } from './MarkupLayer';
import { MarkupList, MarkupNoteForm, ResolveMarkupForm, type ListScope } from './MarkupList';
import { canvasSize, compareInto, openSheet, type Sheet } from './sheet';

type Tool = 'MOVE' | MarkupKind;
const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'MOVE', label: 'Move and pick', icon: <DragOutlined /> },
  { tool: 'PIN', label: 'Comment pin', icon: <CommentOutlined /> },
  { tool: 'CLOUD', label: 'Cloud', icon: <CloudOutlined /> },
  { tool: 'RECT', label: 'Box', icon: <BorderOutlined /> },
  { tool: 'ARROW', label: 'Arrow', icon: <ArrowRightOutlined /> },
  { tool: 'TEXT', label: 'Text', icon: <FontSizeOutlined /> },
  { tool: 'PEN', label: 'Freehand', icon: <HighlightOutlined /> },
];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 24;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface View {
  zoom: number;
  x: number;
  y: number;
}
interface Draft {
  kind: MarkupKind;
  points: MarkupPoint[];
}

/** Keeps a freehand stroke to the most points a mark may have, evenly. */
function thin(points: MarkupPoint[]) {
  if (points.length <= MARKUP_MAX_POINTS) return points;
  const step = points.length / MARKUP_MAX_POINTS;
  const out: MarkupPoint[] = [];
  for (let i = 0; i < MARKUP_MAX_POINTS - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/**
 * The drawing viewer (item 109): a revision's PDF, image or DXF on a sheet that pans and zooms (drag, wheel, pinch,
 * keys), with marks drawn over it in the sheet's own 0 to 1 coordinates. Open marks from earlier revisions show dashed
 * until resolved. Two revisions can be overlaid to show what changed, and the marked-up sheet saved as an image.
 */
export function DrawingViewer({ documentId }: { documentId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { data: doc, isLoading, error, refetch } = useDocument(documentId);
  const { data: allMarks = [] } = useDrawingMarkups(documentId);
  const create = useCreateMarkup(documentId);
  const resolve = useResolveMarkup(documentId);
  const remove = useDeleteMarkup(documentId);
  const linkRfi = useLinkMarkupRfi(documentId);

  /* ---------- which revision, file and page (in the URL) ---------- */

  const revisions = useMemo(() => doc?.revisions ?? [], [doc]);
  const revision: DocumentRevisionDto | undefined = revisions.find((r) => r.id === search.get('rev')) ?? revisions.find((r) => r.current) ?? revisions[0];
  const viewable = useMemo(() => (revision?.attachments ?? []).filter(canViewDrawingFile), [revision]);
  const file = viewable.find((f) => f.id === search.get('file')) ?? viewable[0];
  const fileIndex = file && revision ? revision.attachments.findIndex((a) => a.id === file.id) : -1;
  const pageParam = Math.max(1, Number(search.get('page')) || 1);
  const selectedId = search.get('mark');

  const go = useCallback(
    (next: { rev?: string; file?: string | null; page?: number; mark?: string | null }) => {
      const q = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') q.delete(k);
        else q.set(k, String(v));
      }
      router.replace(`/documents/drawing?${q.toString()}`, { scroll: false });
    },
    [router, search],
  );

  /* ---------- the sheet ---------- */

  // Each opened file is kept with its id, so a stale one never shows while the next opens.
  const [opened, setOpened] = useState<{ id: string; sheet: Sheet | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!file) return;
    let live = true;
    let mine: Sheet | null = null;
    openSheet(file)
      .then((s) => {
        mine = s;
        if (live) setOpened({ id: file.id, sheet: s, error: null });
        else s.destroy();
      })
      .catch((e: Error) => live && setOpened({ id: file.id, sheet: null, error: e.message }));
    return () => {
      live = false;
      mine?.destroy();
    };
  }, [file]);
  const sheet = opened && opened.id === file?.id ? opened.sheet : null;
  const sheetError = opened && opened.id === file?.id ? opened.error : null;
  const page = sheet ? clamp(pageParam, 1, sheet.pages) : pageParam;
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => {
    if (!sheet) return;
    let live = true;
    sheet.aspect(page).then((a) => live && setAspect(a));
    return () => {
      live = false;
    };
  }, [sheet, page]);
  const [layersOff, setLayersOff] = useState<{ sheet: Sheet | null; hidden: Set<string> }>({ sheet: null, hidden: new Set() });
  const hiddenLayers = useMemo(() => (layersOff.sheet === sheet ? layersOff.hidden : new Set<string>()), [layersOff, sheet]);
  const setHiddenLayers = (hidden: Set<string>) => setLayersOff({ sheet, hidden });

  /* ---------- compare with another revision ---------- */

  const [compareId, setCompareId] = useState<string | null>(null);
  const compareRev = revisions.find((r) => r.id === compareId && r.id !== revision?.id);
  const compareFile = compareRev ? ((compareRev.attachments[fileIndex] && canViewDrawingFile(compareRev.attachments[fileIndex]) ? compareRev.attachments[fileIndex] : compareRev.attachments.find(canViewDrawingFile)) ?? null) : null;
  const [comparing, setComparing] = useState<{ id: string; sheet: Sheet } | null>(null);
  useEffect(() => {
    if (!compareFile) return;
    let live = true;
    let mine: Sheet | null = null;
    openSheet(compareFile)
      .then((s) => {
        mine = s;
        if (live) setComparing({ id: compareFile.id, sheet: s });
        else s.destroy();
      })
      .catch((e: Error) => message.error(e.message));
    return () => {
      live = false;
      mine?.destroy();
    };
  }, [compareFile, message]);
  const compareSheet = comparing && comparing.id === compareFile?.id ? comparing.sheet : null;
  /** The compared revision is the older one when it comes later in the newest-first list. */
  const compareIsOlder = !!compareRev && revisions.indexOf(compareRev) > revisions.findIndex((r) => r.id === revision?.id);

  /* ---------- pan and zoom ---------- */

  const viewportRef = useRef<HTMLDivElement | null>(null);
  // The viewport mounts after the document loads, so its size and wheel listener follow the element itself.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const attachViewport = useCallback((el: HTMLDivElement | null) => {
    viewportRef.current = el;
    setViewportEl(el);
  }, []);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!viewportEl) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(viewportEl);
    return () => ro.disconnect();
  }, [viewportEl]);
  const baseW = aspect && box.w ? Math.min(box.w, box.h * aspect) : 0;
  const baseH = aspect ? baseW / aspect : 0;
  // The view belongs to one sheet, page and viewport size; anything else starts on the whole sheet.
  const viewKey = `${file?.id}:${page}:${box.w}x${box.h}:${baseW}`;
  const fitted = useMemo<View>(() => ({ zoom: 1, x: (box.w - baseW) / 2, y: (box.h - baseH) / 2 }), [box.w, box.h, baseW, baseH]);
  const [viewState, setViewState] = useState<View & { key: string }>({ key: '', zoom: 1, x: 0, y: 0 });
  const view: View = viewState.key === viewKey ? viewState : fitted;
  const setView = useCallback(
    (next: View | ((v: View) => View)) =>
      setViewState((prev) => {
        const cur = prev.key === viewKey ? prev : fitted;
        return { key: viewKey, ...(typeof next === 'function' ? next(cur) : next) };
      }),
    [viewKey, fitted],
  );
  const fit = useCallback(() => setView(fitted), [setView, fitted]);
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, [setView]);
  // The page is drawn again at the new zoom once zooming settles; until then the browser scales the last drawing.
  const [renderZoom, setRenderZoom] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setRenderZoom(view.zoom), 180);
    return () => clearTimeout(t);
  }, [view.zoom]);
  useEffect(() => {
    const el = viewportEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, viewportEl]);

  /* ---------- drawing the page ---------- */

  const [drawing, setDrawing] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!sheet || !canvas || !baseW) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const size = canvasSize(baseW * renderZoom * dpr, baseH * renderZoom * dpr);
    let live = true;
    setDrawing(true);
    (async () => {
      if (compareSheet && sheet.readable && compareSheet.readable) {
        const a = Object.assign(document.createElement('canvas'), size);
        const b = Object.assign(document.createElement('canvas'), size);
        await Promise.all([sheet.draw(a, page, { hiddenLayers }), compareSheet.draw(b, Math.min(page, compareSheet.pages), { hiddenLayers })]);
        if (!live) return;
        canvas.width = size.width;
        canvas.height = size.height;
        compareInto(canvas, compareIsOlder ? b : a, compareIsOlder ? a : b, { old: BRAND.colors.compareOld, new: BRAND.colors.compareNew, both: BRAND.colors.compareBoth });
      } else {
        // Draw off screen and swap in, so the old picture stays up while the sharper one is made.
        const off = Object.assign(document.createElement('canvas'), size);
        await sheet.draw(off, page, { hiddenLayers });
        if (!live) return;
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.getContext('2d')!.drawImage(off, 0, 0);
      }
    })()
      .catch((e: Error) => live && message.error(e.message || 'The drawing could not be drawn'))
      .finally(() => live && setDrawing(false));
    return () => {
      live = false;
    };
  }, [sheet, compareSheet, compareIsOlder, page, renderZoom, baseW, baseH, hiddenLayers, message]);

  /* ---------- marks ---------- */

  const [carry, setCarry] = useState(true);
  const [scope, setScope] = useState<ListScope>('sheet');
  const revisionIds = useMemo(() => revisions.map((r) => r.id), [revisions]);
  const { own, carried } = useMemo(
    () => (revision && file ? marksForSheet(allMarks, revisionIds, { revisionId: revision.id, attachmentId: file.id, fileIndex, page }, carry) : { own: [], carried: [] }),
    [allMarks, revisionIds, revision, file, fileIndex, page, carry],
  );
  const carriedIds = useMemo(() => new Set(carried.map((m) => m.id)), [carried]);
  const onSheet = useMemo(() => [...carried, ...own], [carried, own]);
  const listed = scope === 'sheet' ? onSheet : allMarks;
  const vbH = aspect ? VB_W / aspect : VB_W;
  const px = baseW ? VB_W / (baseW * view.zoom) : 1;
  const shown: ShownMark[] = onSheet.map((m) => ({
    id: m.id,
    label: `M${m.markupNo}`,
    kind: m.kind,
    points: m.points,
    color: m.color,
    note: m.note,
    faint: m.status === 'RESOLVED',
    carried: carriedIds.has(m.id),
  }));

  const [tool, setTool] = useState<Tool>('MOVE');
  const [color, setColor] = useState<MarkupColor>('RED');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [noteFor, setNoteFor] = useState<Draft | null>(null);
  const [resolving, setResolving] = useState<DrawingMarkupDto | null>(null);
  const [rfiFrom, setRfiFrom] = useState<DrawingMarkupDto | null>(null);

  const toSheet = (clientX: number, clientY: number): MarkupPoint => {
    const r = svgRef.current!.getBoundingClientRect();
    return [(clientX - r.left) / r.width, (clientY - r.top) / r.height];
  };

  /** Shows a mark: opens its revision, file and page if need be, and centres it at a readable zoom. */
  const pick = (m: DrawingMarkupDto) => {
    const elsewhere = m.attachmentId !== file?.id || m.page !== page;
    if (elsewhere && !carriedIds.has(m.id)) {
      go({ rev: m.revisionId, file: m.attachmentId, page: m.page, mark: m.id });
      return;
    }
    go({ mark: m.id });
    if (!baseW) return;
    const xs = m.points.map((p) => p[0]);
    const ys = m.points.map((p) => p[1]);
    const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * baseW;
    const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * baseH;
    setView((v) => {
      const zoom = Math.max(v.zoom, 2);
      return { zoom, x: box.w / 2 - cx * zoom, y: box.h / 2 - cy * zoom };
    });
  };

  /* ---------- pointer: pan, pinch and draw ---------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; sx: number; sy: number; view: View; moved: boolean; target: string | null }
    | { kind: 'pinch'; dist: number; cx: number; cy: number; view: View }
    | { kind: 'draw' }
    | null
  >(null);

  const local = (e: React.PointerEvent) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view };
    setDraft(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sheet || !baseW) return;
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) return startPinch();
    if (pointers.current.size > 2) return;
    const p = local(e);
    if (tool === 'MOVE' || e.button === 1) {
      const target = (e.target as Element).closest?.('[data-mark]')?.getAttribute('data-mark') ?? null;
      gesture.current = { kind: 'pan', sx: p.x, sy: p.y, view, moved: false, target };
      return;
    }
    const at = toSheet(e.clientX, e.clientY);
    gesture.current = { kind: 'draw' };
    setDraft({ kind: tool, points: tool === 'PIN' || tool === 'TEXT' || tool === 'PEN' ? [at] : [at, at] });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const zoom = clamp(g.view.zoom * (dist / g.dist), MIN_ZOOM, MAX_ZOOM);
      const k = zoom / g.view.zoom;
      setView({ zoom, x: cx - (g.cx - g.view.x) * k, y: cy - (g.cy - g.view.y) * k });
    } else if (g.kind === 'pan') {
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      if (g.moved) setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    } else if (g.kind === 'draw') {
      const at = toSheet(e.clientX, e.clientY);
      setDraft((d) => {
        if (!d) return d;
        if (d.kind === 'PEN') {
          const last = d.points[d.points.length - 1];
          // A new point every two screen pixels or so.
          if (Math.hypot((at[0] - last[0]) * baseW * view.zoom, (at[1] - last[1]) * baseH * view.zoom) < 2) return d;
          return { ...d, points: [...d.points, at] };
        }
        if (d.kind === 'PIN' || d.kind === 'TEXT') return { ...d, points: [at] };
        return { ...d, points: [d.points[0], at] };
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'pinch') {
      // Lifting one finger of a pinch ends it; the other does nothing until lifted.
      gesture.current = null;
      return;
    }
    gesture.current = null;
    if (g?.kind === 'pan') {
      if (!g.moved) go({ mark: g.target });
      return;
    }
    if (g?.kind !== 'draw' || !draft) return;
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
    const span = Math.hypot((b[0] - a[0]) * baseW * view.zoom, (b[1] - a[1]) * baseH * view.zoom);
    if ((draft.kind === 'CLOUD' || draft.kind === 'RECT' || draft.kind === 'ARROW' || draft.kind === 'PEN') && span < 8) {
      setDraft(null);
      message.info(`Drag on the drawing to draw ${draft.kind === 'ARROW' ? 'an arrow' : draft.kind === 'PEN' ? 'a line' : `a ${MARKUP_KIND_LABELS[draft.kind].toLowerCase()}`}`);
      return;
    }
    setNoteFor({ ...draft, points: thin(draft.points).map(roundPoint) });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 60;
    const keys = singleKeysOn();
    if (e.key === 'ArrowLeft') setView((v) => ({ ...v, x: v.x + step }));
    else if (e.key === 'ArrowRight') setView((v) => ({ ...v, x: v.x - step }));
    else if (e.key === 'ArrowUp') setView((v) => ({ ...v, y: v.y + step }));
    else if (e.key === 'ArrowDown') setView((v) => ({ ...v, y: v.y - step }));
    else if (keys && (e.key === '+' || e.key === '=')) zoomAt(box.w / 2, box.h / 2, 1.25);
    else if (keys && e.key === '-') zoomAt(box.w / 2, box.h / 2, 0.8);
    else if (keys && e.key === '0') fit();
    else if (e.key === 'Escape' && (draft || tool !== 'MOVE')) {
      setDraft(null);
      setTool('MOVE');
    } else return;
    e.preventDefault();
  };

  const saveMark = async (note: string | null) => {
    if (!noteFor || !revision || !file) return;
    const saved = await create.mutateAsync({ id: crypto.randomUUID(), revisionId: revision.id, attachmentId: file.id, page, kind: noteFor.kind, points: noteFor.points, color, note });
    message.success(`M${saved.markupNo} saved`);
    go({ mark: saved.id });
  };

  /* ---------- save the marked-up sheet as an image ---------- */

  const saveImage = async () => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    if (!canvas || !svg || !doc || !revision) return;
    try {
      const out = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
      const ctx = out.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(out.width));
      clone.setAttribute('height', String(out.height));
      clone.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      ctx.drawImage(img, 0, 0, out.width, out.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('empty');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${doc.docNo}-${revision.revision}${sheet && sheet.pages > 1 ? `-p${page}` : ''}-marked.png` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      message.error('The image could not be made. Open the file instead, or take a screenshot.');
    }
  };

  /* ---------- page ---------- */

  if (isLoading) return <PageSkeleton shape="record" />;
  if (error || !doc) return <QueryError error={error ?? { response: { status: 404 } }} onRetry={() => refetch()} />;

  const title = `${doc.docNo} ${doc.title}`;
  const otherFiles = (revision?.attachments ?? []).filter((a) => !canViewDrawingFile(a));
  const pages = sheet?.pages ?? 1;
  const toolbar = (
    <Flex wrap gap={token.marginXS} align="center">
      <Space.Compact>
        {TOOLS.map((t) => (
          <Tooltip key={t.tool} title={t.label}>
            <Button
              icon={t.icon}
              type={tool === t.tool ? 'primary' : 'default'}
              aria-label={t.label}
              aria-pressed={tool === t.tool}
              onClick={() => {
                setTool(t.tool);
                setDraft(null);
              }}
              disabled={!sheet}
            />
          </Tooltip>
        ))}
      </Space.Compact>
      <Space.Compact>
        {MARKUP_COLORS.map((c) => (
          <Tooltip key={c} title={`${MARKUP_COLOR_LABELS[c]} ink`}>
            <Button
              aria-label={`${MARKUP_COLOR_LABELS[c]} ink`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              icon={<span aria-hidden style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: MARKUP_INK[c], outline: color === c ? `2px solid ${token.colorText}` : 'none', outlineOffset: 2 }} />}
            />
          </Tooltip>
        ))}
      </Space.Compact>
      <Space.Compact>
        <Tooltip title="Zoom out (−)">
          <Button icon={<ZoomOutOutlined />} aria-label="Zoom out" onClick={() => zoomAt(box.w / 2, box.h / 2, 0.8)} disabled={!sheet} />
        </Tooltip>
        <Tooltip title="Whole sheet (0)">
          <Button icon={<ExpandOutlined />} aria-label="Fit the whole sheet" onClick={fit} disabled={!sheet} />
        </Tooltip>
        <Tooltip title="Zoom in (+)">
          <Button icon={<ZoomInOutlined />} aria-label="Zoom in" onClick={() => zoomAt(box.w / 2, box.h / 2, 1.25)} disabled={!sheet} />
        </Tooltip>
      </Space.Compact>
      {pages > 1 ? (
        <Space.Compact>
          <Button icon={<LeftOutlined />} aria-label="Previous page" disabled={page <= 1} onClick={() => go({ page: page - 1, mark: null })} />
          <Button disabled style={{ color: token.colorText }} translate="no">
            {page} / {pages}
          </Button>
          <Button icon={<RightOutlined />} aria-label="Next page" disabled={page >= pages} onClick={() => go({ page: page + 1, mark: null })} />
        </Space.Compact>
      ) : null}
      {sheet?.layers.length ? (
        <Popover
          trigger="click"
          title="Layers"
          content={
            <Checkbox.Group
              style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflow: 'auto' }}
              value={sheet.layers.map((l) => l.name).filter((n) => !hiddenLayers.has(n))}
              onChange={(on) => setHiddenLayers(new Set(sheet.layers.map((l) => l.name).filter((n) => !on.includes(n))))}
              options={sheet.layers.map((l) => ({ value: l.name, label: <span translate="no">{l.name}</span> }))}
            />
          }
        >
          <Button icon={<UnorderedListOutlined />}>Layers</Button>
        </Popover>
      ) : null}
      {revisions.length > 1 ? (
        <Select
          allowClear
          style={{ minWidth: 190 }}
          placeholder="Compare with…"
          aria-label="Compare with another revision"
          value={compareRev?.id}
          onChange={(v) => setCompareId(v ?? null)}
          options={revisions.filter((r) => r.id !== revision?.id && r.attachments.some(canViewDrawingFile)).map((r) => ({ value: r.id, label: `Compare with Rev ${r.revision}` }))}
          disabled={!sheet?.readable}
        />
      ) : null}
      <Tooltip title={sheet && !sheet.readable ? 'This file’s server does not allow saving a copy' : 'Save image: this sheet with its marks, as a PNG'}>
        <Button icon={<DownloadOutlined />} onClick={saveImage} disabled={!sheet?.readable || drawing} aria-label="Save image" />
      </Tooltip>
    </Flex>
  );

  return (
    <div className="page-container">
      <PageHeader
        title={title}
        docTitle={`${doc.docNo} drawing`}
        subtitle={
          revision ? (
            <Space size={6} wrap>
              <span translate="no">Rev {revision.revision}</span>
              <RevisionStatusTag status={revision.status} />
              {!revision.current ? <Typography.Text type="warning">Superseded</Typography.Text> : null}
              <span>{doc.projectName}</span>
            </Space>
          ) : null
        }
        crumbs={[{ title: 'Documents', href: '/documents' }, { title: doc.docNo, href: `/documents?id=${doc.id}` }, { title: 'Drawing' }]}
        extra={
          <Flex gap={token.marginXS} wrap>
            {revisions.length > 1 ? (
              <Select
                aria-label="Revision"
                style={{ minWidth: 200 }}
                value={revision?.id}
                onChange={(v) => {
                  setCompareId(null);
                  go({ rev: v, file: null, page: 1, mark: null });
                }}
                options={revisions.map((r) => ({ value: r.id, label: `Rev ${r.revision} · ${r.current ? REVISION_STATUS_LABELS[r.status] : 'Superseded'}` }))}
              />
            ) : null}
            {viewable.length > 1 ? (
              <Select aria-label="File" style={{ minWidth: 180 }} value={file?.id} onChange={(v) => go({ file: v, page: 1, mark: null })} options={viewable.map((f) => ({ value: f.id, label: f.fileName }))} />
            ) : null}
            {file ? (
              <Button href={fileUrl(file.url)} target="_blank" rel="noreferrer" icon={<ExportOutlined />}>
                Open the file
              </Button>
            ) : null}
          </Flex>
        }
      />
      {!revision || !file ? (
        <Result
          status="info"
          title="Nothing to show yet"
          subTitle={
            otherFiles.length
              ? 'This revision has only files the viewer cannot draw (DWG or other). Download them below, or add a PDF or DXF of the sheet to the revision.'
              : 'Add a revision with its PDF, DXF or image to view and mark it up here.'
          }
          extra={otherFiles.map((f) => (
            <Button key={f.id} href={fileUrl(f.url)} target="_blank" rel="noreferrer" icon={<DownloadOutlined />}>
              {f.fileName}
            </Button>
          ))}
        />
      ) : (
        <div className="drawing-layout">
          <Flex vertical gap={token.marginSM} style={{ minWidth: 0 }}>
            {toolbar}
            {otherFiles.length ? (
              <Alert
                type="info"
                showIcon
                title={
                  <span>
                    Also on this revision, for download:{' '}
                    {otherFiles.map((f, i) => (
                      <React.Fragment key={f.id}>
                        {i ? ', ' : ''}
                        <a href={fileUrl(f.url)} target="_blank" rel="noreferrer" translate="no">
                          {f.fileName}
                        </a>
                        {drawingFileKind(f) === 'dwg' ? ' (DWG, for AutoCAD)' : ''}
                      </React.Fragment>
                    ))}
                  </span>
                }
              />
            ) : null}
            {compareRev ? (
              <Flex gap={token.marginSM} wrap align="center" style={{ fontSize: token.fontSizeSM }}>
                <span>
                  <span aria-hidden style={{ display: 'inline-block', width: 12, height: 3, background: BRAND.colors.compareOld, verticalAlign: 'middle', marginRight: 4 }} />
                  Only on Rev {compareIsOlder ? compareRev.revision : revision.revision} (older)
                </span>
                <span>
                  <span aria-hidden style={{ display: 'inline-block', width: 12, height: 3, background: BRAND.colors.compareNew, verticalAlign: 'middle', marginRight: 4 }} />
                  Only on Rev {compareIsOlder ? revision.revision : compareRev.revision} (newer)
                </span>
                <span>
                  <span aria-hidden style={{ display: 'inline-block', width: 12, height: 3, background: BRAND.colors.compareBoth, verticalAlign: 'middle', marginRight: 4 }} />
                  On both
                </span>
              </Flex>
            ) : null}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the drawing is an application region: pointer to draw and pan, keys to move and zoom; every mark is also in the list beside it */}
            <div
              ref={attachViewport}
              role="application"
              aria-label={`Drawing ${doc.docNo} Rev ${revision.revision}${pages > 1 ? `, page ${page} of ${pages}` : ''}. Arrow keys move it, plus and minus zoom, 0 fits the sheet.`}
              aria-roledescription="drawing viewer"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keys move and zoom the drawing, so it takes focus
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              className="drawing-viewport"
              style={{
                cursor: tool === 'MOVE' ? 'grab' : 'crosshair',
                background: token.colorFillTertiary,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
              }}
            >
              {sheetError ? (
                <Result status="warning" title="This file cannot be shown" subTitle={sheetError} />
              ) : !sheet || !aspect || !baseW ? (
                <Flex align="center" justify="center" style={{ height: '100%' }}>
                  <Spin description="Opening the drawing…" />
                </Flex>
              ) : (
                <div style={{ position: 'absolute', left: 0, top: 0, width: baseW, height: baseH, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0', boxShadow: token.boxShadowTertiary }}>
                  <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#fff' }} aria-hidden />
                  <svg ref={svgRef} viewBox={`0 0 ${VB_W} ${vbH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden>
                    {shown.map((m) => (
                      <MarkShape key={m.id} mark={m} vbH={vbH} px={px} selected={m.id === selectedId} />
                    ))}
                    {draft || noteFor ? <MarkShape mark={{ id: 'draft', label: 'New', kind: (draft ?? noteFor)!.kind, points: (draft ?? noteFor)!.points, color, note: null }} vbH={vbH} px={px} /> : null}
                  </svg>
                </div>
              )}
              {drawing && sheet ? (
                <div style={{ position: 'absolute', right: 8, top: 8 }}>
                  <Spin size="small" />
                </div>
              ) : null}
            </div>
            <Flex justify="space-between" wrap gap={token.marginXS} align="center">
              <Flex gap={8} align="center" style={{ minHeight: 32 }}>
                <Switch size="small" checked={carry} onChange={setCarry} id="carry-marks" aria-labelledby="carry-marks-label" />
                <span id="carry-marks-label">Show open marks from earlier revisions</span>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {tool === 'MOVE' ? 'Drag to move, wheel or pinch to zoom, tap a mark to pick it.' : `Draw a ${MARKUP_KIND_LABELS[tool].toLowerCase()}: ${tool === 'PIN' || tool === 'TEXT' ? 'tap where it goes' : 'drag on the drawing'}. Two fingers move and zoom.`}
              </Typography.Text>
            </Flex>
          </Flex>
          <MarkupList
            marks={listed}
            carriedIds={carriedIds}
            scope={scope}
            onScope={setScope}
            selectedId={selectedId}
            onPick={pick}
            onResolve={setResolving}
            onReopen={(m) => resolve.mutate({ id: m.id, resolved: false })}
            onDelete={async (m) => {
              await remove.mutateAsync(m.id);
              if (selectedId === m.id) go({ mark: null });
            }}
            onRaiseRfi={setRfiFrom}
          />
        </div>
      )}
      <MarkupNoteForm
        kind={noteFor?.kind ?? null}
        open={!!noteFor}
        onClose={() => {
          setNoteFor(null);
          setDraft(null);
        }}
        onSubmit={saveMark}
      />
      <ResolveMarkupForm mark={resolving} onClose={() => setResolving(null)} onSubmit={(note) => resolve.mutateAsync({ id: resolving!.id, resolved: true, note })} />
      <RfiFormModal
        open={!!rfiFrom}
        onClose={() => setRfiFrom(null)}
        projectId={doc.projectId}
        defaultDocumentId={doc.id}
        defaults={
          rfiFrom
            ? {
                subject: `${doc.docNo} M${rfiFrom.markupNo}: ${(rfiFrom.note ?? MARKUP_KIND_LABELS[rfiFrom.kind]).slice(0, 150)}`,
                question: `${rfiFrom.note ? `${rfiFrom.note}\n\n` : ''}See mark M${rfiFrom.markupNo} on ${doc.docNo} Rev ${rfiFrom.revision}${rfiFrom.page > 1 ? `, page ${rfiFrom.page}` : ''}.`,
              }
            : undefined
        }
        onSaved={(r) => {
          if (rfiFrom) linkRfi.mutate({ id: rfiFrom.id, rfiId: r.id });
        }}
      />
    </div>
  );
}
