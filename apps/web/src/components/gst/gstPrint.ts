import { QrCode, QrSegment, Ecc } from '@rc-component/qrcode/es/libs/qrcodegen';
import type { GstDocumentDto, GstSourceStateDto } from '@erp/shared';
import { PRINT } from '@/components/print/printBrand';
import { esc } from '@/components/print/printDoc';
import { formatDateTime } from '@/lib/format';

/**
 * A QR code as SVG markup, for a paper: the IRP's signed QR is a long token, so it is drawn at medium error correction,
 * with the four-module quiet zone the standard asks for.
 */
export function qrSvg(text: string, sizeMm = 34): string {
  const qr = QrCode.encodeSegments(QrSegment.makeSegments(text), Ecc.MEDIUM);
  const margin = 4;
  const n = qr.size + margin * 2;
  const d: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let start = -1;
    for (let x = 0; x <= qr.size; x++) {
      const on = x < qr.size && qr.getModule(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        d.push(`M${start + margin} ${y + margin}h${x - start}v1h${start - x}z`);
        start = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" role="img" aria-label="E-invoice QR code"><rect width="${n}" height="${n}" fill="${PRINT.paper}"/><path d="${d.join('')}" fill="${PRINT.ink}"/></svg>`;
}

/** The IRN a paper prints: the one live and acknowledged, else none (a paper never prints one being made or cancelled). */
export const printedIrn = (s: GstSourceStateDto | undefined | null): GstDocumentDto | null =>
  s?.kind === 'IRN' && s.live?.status === 'ACTIVE' && s.live.number ? s.live : null;

/**
 * The e-invoice block on a tax invoice: the IRN, the acknowledgement number and date, and the signed QR the IRP returned
 * (rule 48(4)). A stand-in from the fake provider says so on the paper, since it is no e-invoice.
 */
export function irnBlockHtml(d: GstDocumentDto | null): string {
  if (!d?.number) return '';
  const qr = d.signedQr ? qrSvg(d.signedQr) : '';
  const fake = d.provider === 'FAKE' ? `<div style="color:${PRINT.danger};margin-top:4px">Stand-in numbers from a test server, not registered with the IRP</div>` : '';
  return `<div style="display:flex;gap:16px;align-items:flex-start;justify-content:space-between;border:1px solid ${PRINT.border};padding:8px 10px;margin-bottom:12px;page-break-inside:avoid">
    <div style="min-width:0">
      <div class="k" style="font-size:9px;color:${PRINT.muted};text-transform:uppercase;letter-spacing:.04em">E-invoice</div>
      <div><b>Invoice no.</b> ${esc(d.docNo)}</div>
      <div><b>IRN</b> <span style="word-break:break-all;font-family:monospace">${esc(d.number)}</span></div>
      <div><b>Ack no.</b> ${esc(d.ackNo ?? '')} &nbsp; <b>Ack date</b> ${esc(d.ackAt ? formatDateTime(d.ackAt) : '')}</div>
      ${fake}
    </div>
    ${qr}
  </div>`;
}
