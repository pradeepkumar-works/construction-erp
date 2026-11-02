import { resolveStatic } from '@/ds';
import { BRAND } from '@/lib/brand';

const c = resolveStatic().color;

/**
 * The colours of everything printed, saved as PDF or Word, or sent as email: the light theme's values, since paper is
 * white whatever the screen shows. Headings and rules are near-black, blue only marks the brand and data.
 */
export const PRINT = {
  ink: c.text.strong,
  text: c.text.base,
  muted: c.text.muted,
  faint: c.text.faint,
  border: c.line.base,
  hairline: c.line.hairline,
  canvas: c.surface.sunken,
  paper: c.surface.base,
  accent: c.accent.solid,
  accentDeep: c.accent.hover,
  onAccent: c.text.onAccent,
  danger: c.tone.danger.fg,
  dangerBg: c.tone.danger.bg,
  pending: c.tone.pending.fg,
  pendingBg: c.tone.pending.bg,
  pendingSolid: c.tone.pending.solid,
} as const;

/**
 * The Nirmaan look for the printable documents: Inter, as in the app, a near-black rule under the header, and a footer
 * with the N mark. The organisation's own name stays the main heading, since the document is theirs; Nirmaan signs the
 * footer.
 */

/** Inter from Google Fonts, the app's one face. Falls back to the system face offline. */
export const PRINT_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap"/>`;

/** The printed face: Inter, then the system's own sans. */
export const PRINT_FACE = `"Inter", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

/** The mark as inline SVG (same drawing as app/icon.svg and BrandMark). */
export function markSvg(size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="display:block;flex:0 0 auto"><rect width="64" height="64" rx="12" fill="${PRINT.accent}"/><path d="M15 46V12h9.5l15 20.5V12H49v34h-9.5L24.5 25.5V46z" fill="${PRINT.onAccent}"/><rect x="15" y="50" width="34" height="3" rx="1.5" fill="${PRINT.onAccent}"/></svg>`;
}

/** Styles shared by both documents; each document keeps its own layout CSS. */
export const PRINT_BRAND_CSS = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body, .brand, h1, h2 { font-family: ${PRINT_FACE}; }
  .head { border-bottom: 2px solid ${PRINT.ink}; }
  .brand, h1, h2 { font-weight: 600; }
  h1 { letter-spacing: -.01em; }
  h2 { letter-spacing: .04em; }
  .nirmaan-foot { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding-top: 8px; border-top: 1px solid ${PRINT.border}; color: ${PRINT.muted}; font-size: 9px; page-break-inside: avoid; }
  .nirmaan-foot .wm { font-weight: 600; font-size: 11px; letter-spacing: .06em; color: ${PRINT.ink}; }
  .nirmaan-foot .txt { flex: 1; }
`;

/** Footer line: the N mark, the wordmark and the document's own note. `note` is already-escaped HTML. */
export function brandFooter(note: string) {
  return `<div class="nirmaan-foot">${markSvg(16)}<span class="wm">${BRAND.wordmark}</span><span class="txt">${note}</span></div>`;
}

/** Print once images and web fonts have loaded, so the dialog shows the finished page. */
export const AUTO_PRINT_SCRIPT = `<script>
    window.addEventListener('load', function () {
      var imgs = Array.prototype.slice.call(document.images);
      var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      Promise.all(imgs.map(function (i) { return i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = r; i.onerror = r; }); }).concat([fonts]))
        .then(function () { setTimeout(function () { window.print(); }, 150); });
    });
  </script>`;
