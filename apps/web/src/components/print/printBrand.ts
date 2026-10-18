import { BRAND } from '@/lib/brand';

/**
 * The Nirmaan look for the printable documents (DPR, progress report): Archivo headings, the navy rule with
 * the blue datum line under the header, and a footer with the N mark. The organisation's own name stays the
 * main heading, since the report is theirs; Nirmaan signs the footer.
 */

/** Archivo from Google Fonts, the same face as the app's headings. Falls back to a condensed system face offline. */
export const PRINT_FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,600..800&display=swap"/>`;

const DISPLAY = `"Archivo", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;

/** The mark as inline SVG (same drawing as app/icon.svg and BrandMark). */
export function markSvg(size: number) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="display:block;flex:0 0 auto"><rect width="64" height="64" rx="12" fill="${BRAND.colors.accent}"/><path d="M15 46V12h9.5l15 20.5V12H49v34h-9.5L24.5 25.5V46z" fill="${BRAND.colors.onAccent}"/><rect x="15" y="50" width="34" height="3" rx="1.5" fill="${BRAND.colors.onAccent}"/></svg>`;
}

/** Styles shared by both documents; each document keeps its own layout CSS. */
export const PRINT_BRAND_CSS = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { border-bottom: 2px solid ${BRAND.colors.ink}; box-shadow: 0 3px 0 ${BRAND.colors.accent}; }
  .brand, h1, h2 { font-family: ${DISPLAY}; font-stretch: 87.5%; }
  .brand { font-weight: 800; letter-spacing: .01em; }
  h1 { font-weight: 800; }
  h2 { font-weight: 700; letter-spacing: .06em; }
  .nirmaan-foot { display: flex; align-items: center; gap: 8px; margin-top: 18px; padding-top: 8px; border-top: 1px solid ${BRAND.colors.border}; color: ${BRAND.colors.muted}; font-size: 9px; page-break-inside: avoid; }
  .nirmaan-foot .wm { font-family: ${DISPLAY}; font-stretch: 75%; font-weight: 800; font-size: 11px; letter-spacing: .08em; color: ${BRAND.colors.ink}; }
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
