/**
 * Drawing markup: marks people put on a revision's file in the drawing viewer, a pin with a comment, a
 * cloud or box round a change, an arrow, a line of text or a freehand mark. Each is numbered on its document (M1, M2…),
 * stays OPEN until someone resolves it, and an open one is carried forward onto later revisions until resolved.
 *
 * Positions are normalised to the sheet: x and y from 0 to 1 of the page's width and height, so a mark sits in the same
 * place whatever the zoom, screen or file resolution.
 */
import type { MarkupColor, MarkupKind, MarkupStatus } from './enums';

/** A point on the sheet: [x, y], each from 0 to 1 of the page's width and height (y down). */
export type MarkupPoint = [number, number];

/** Points a freehand mark may keep (the viewer thins a long stroke to this). */
export const MARKUP_MAX_POINTS = 1000;
/** A comment or a line of text. */
export const MARKUP_NOTE_MAX = 1000;

/** How many points each kind takes: one for a pin or text, two corners or ends for a cloud, box or arrow. */
export const MARKUP_POINTS: Record<MarkupKind, { min: number; max: number }> = {
  PIN: { min: 1, max: 1 },
  TEXT: { min: 1, max: 1 },
  CLOUD: { min: 2, max: 2 },
  RECT: { min: 2, max: 2 },
  ARROW: { min: 2, max: 2 },
  PEN: { min: 2, max: MARKUP_MAX_POINTS },
};

/** Why a mark cannot be saved, in words for the person drawing it; null when it can. */
export function markupProblem(kind: MarkupKind, points: unknown, note: string | null | undefined): string | null {
  if (!Array.isArray(points)) return 'Draw the mark on the drawing';
  const { min, max } = MARKUP_POINTS[kind];
  if (points.length < min) return 'Draw the mark on the drawing';
  if (points.length > max) return kind === 'PEN' ? `A freehand mark can have up to ${max} points; draw it in shorter strokes` : 'Draw the mark again';
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'Draw the mark again';
    // A little outside the sheet is allowed: a cloud dragged past the border.
    if (p[0] < -0.05 || p[0] > 1.05 || p[1] < -0.05 || p[1] > 1.05) return 'Keep the mark on the drawing';
  }
  if ((kind === 'PIN' || kind === 'TEXT') && !note?.trim()) return kind === 'PIN' ? 'Write the comment' : 'Write the text';
  if (note && note.length > MARKUP_NOTE_MAX) return `Keep it under ${MARKUP_NOTE_MAX} characters`;
  return null;
}

/** Rounds a point to 5 places (a millimetre on a 100 m sheet), so stored marks stay small. */
export const roundPoint = (p: MarkupPoint): MarkupPoint => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];

export interface DrawingMarkupDto {
  id: string;
  documentId: string;
  /** M1, M2… on the document */
  markupNo: number;
  /** The revision it was made on, and its label ("R1") */
  revisionId: string;
  revision: string;
  /** The file it sits on, and that file's place among the revision's files (0 for the first) */
  attachmentId: string;
  fileIndex: number;
  page: number;
  kind: MarkupKind;
  points: MarkupPoint[];
  color: MarkupColor;
  /** The comment, or the words of a TEXT mark */
  note: string | null;
  status: MarkupStatus;
  resolvedNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  rfiId: string | null;
  rfiNo: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The marks to draw on one page of one file of a revision: its own, and (with `carry`) the marks still open from earlier
 * revisions on the file in the same place and the same page, since a revised drawing usually keeps its sheets in order.
 * `revisionIds` lists the document's revisions newest first, as the document detail returns them.
 */
export function marksForSheet<T extends Pick<DrawingMarkupDto, 'revisionId' | 'attachmentId' | 'fileIndex' | 'page' | 'status'>>(
  marks: T[],
  revisionIds: string[],
  sheet: { revisionId: string; attachmentId: string; fileIndex: number; page: number },
  carry: boolean,
): { own: T[]; carried: T[] } {
  const at = revisionIds.indexOf(sheet.revisionId);
  const earlier = new Set(at < 0 ? [] : revisionIds.slice(at + 1));
  return {
    own: marks.filter((m) => m.attachmentId === sheet.attachmentId && m.page === sheet.page),
    carried: carry ? marks.filter((m) => m.status === 'OPEN' && earlier.has(m.revisionId) && m.fileIndex === sheet.fileIndex && m.page === sheet.page) : [],
  };
}

/** File kinds the drawing viewer opens. DWG is kept and downloaded, not drawn (see ARCHITECTURE, Drawing viewer). */
export type DrawingFileKind = 'pdf' | 'image' | 'dxf' | 'dwg' | 'other';
export function drawingFileKind(f: { fileName: string; mimeType: string }): DrawingFileKind {
  const name = f.fileName.toLowerCase();
  if (f.mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.dxf') || f.mimeType === 'image/vnd.dxf' || f.mimeType === 'application/dxf') return 'dxf';
  if (name.endsWith('.dwg') || f.mimeType === 'image/vnd.dwg' || f.mimeType === 'application/acad') return 'dwg';
  if (/^image\/(jpeg|png|webp|gif)$/.test(f.mimeType)) return 'image';
  return 'other';
}
export const canViewDrawingFile = (f: { fileName: string; mimeType: string }) => ['pdf', 'image', 'dxf'].includes(drawingFileKind(f));

/** Upload types for CAD files, by extension, since browsers and phones send them as `application/octet-stream` or nothing. */
export const CAD_MIME_TYPES: Record<string, string> = { '.dxf': 'image/vnd.dxf', '.dwg': 'image/vnd.dwg' };
