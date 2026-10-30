import { officialFileName, type OfficialBlockDto, type OfficialFactDto, type OfficialReportDto } from '@erp/shared';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BRAND } from '@/lib/brand';
import { markSvg } from '@/components/print/printBrand';
import { cellText, isNegative, isNumeric } from '@/components/management/report-format';
import { controlFacts, factText, footNote, issueLine, WIDE_COLUMNS } from './official-format';
import { loadPhotos, type PhotoData } from './photoData';

/**
 * An official progress report as a PDF file (item 167), drawn from the same `OfficialReportDto` as the page: the
 * document control strip on every page, "Page x of y" and the document number at the foot, the facts box, chapters,
 * photographs two to a row and the signature boxes. pdfmake and its Roboto font (about 1.5 MB) load on the first
 * download, not with the page.
 */

const C = BRAND.colors;
const grid = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => C.border,
  vLineColor: () => C.border,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
};

function facts(list: OfficialFactDto[]): Content {
  const body: TableCell[][] = [];
  for (let i = 0; i < list.length; i += 2) {
    const cell = (f?: OfficialFactDto): TableCell[] =>
      f ? [{ text: f.label, bold: true, fillColor: C.canvas, color: C.ink, fontSize: 8 }, { text: factText(f) }] : [{ text: '', fillColor: C.canvas }, { text: '' }];
    body.push([...cell(list[i]), ...cell(list[i + 1])]);
  }
  return { table: { widths: ['17%', '33%', '17%', '33%'], body }, layout: grid, margin: [0, 0, 0, 8] };
}

/** The longest cell of a column, label included: short text columns (numbers, codes) take only their width. */
function longest(b: Extract<OfficialBlockDto, { type: 'table' }>, key: string, label: string) {
  return Math.max(...label.split(' ').map((w) => w.length), ...b.rows.map((r) => String(r[key] ?? '').length));
}

/** Long text columns share the width; the rest take their own. One column always stretches, so a table spans the page. */
function widthsOf(b: Extract<OfficialBlockDto, { type: 'table' }>): ('*' | 'auto')[] {
  const len = b.columns.map((c) => longest(b, c.key, c.label));
  const w: ('*' | 'auto')[] = b.columns.map((c, i) => (c.kind === 'text' && len[i] > 14 ? '*' : 'auto'));
  if (!w.includes('*')) {
    const texts = b.columns.map((c, i) => (c.kind === 'text' ? i : -1)).filter((i) => i >= 0);
    const pick = texts.length ? texts.reduce((a, i) => (len[i] > len[a] ? i : a), texts[0]) : b.columns.length - 1;
    w[pick] = '*';
  }
  return w;
}

function block(b: OfficialBlockDto, photos: Map<string, PhotoData>, wide: boolean): Content[] {
  switch (b.type) {
    case 'facts':
      return [facts(b.facts)];
    case 'text':
      return [...(b.title ? [{ text: b.title, style: 'h3' } as Content] : []), ...b.paragraphs.map((p) => ({ text: p, margin: [0, 0, 0, 5] as [number, number, number, number], fontSize: 9.5 }))];
    case 'figures':
      return [
        {
          columns: b.figures.map((f) => ({
            stack: [
              { text: f.label, color: C.muted, fontSize: 8 },
              { text: cellText(f.kind, f.value), bold: true, fontSize: 15, color: C.ink },
              ...(f.note ? [{ text: f.note, color: C.muted, fontSize: 7.5 }] : []),
            ],
          })),
          columnGap: 12,
          margin: [0, 2, 0, 8],
        },
      ];
    case 'photos': {
      if (!b.photos.length) return [{ text: b.empty ?? 'No photographs.', color: C.muted }];
      const cells: TableCell[] = b.photos.map((p) => {
        const img = photos.get(p.url);
        return { stack: [img ? { image: img.dataUrl, fit: [wide ? 360 : 245, 170], alignment: 'center' } : { text: 'Photograph could not be read', color: C.muted, margin: [0, 60, 0, 60], alignment: 'center' }, { text: p.caption, fontSize: 8, margin: [0, 3, 0, 0] }] };
      });
      const body: TableCell[][] = [];
      for (let i = 0; i < cells.length; i += 2) body.push([cells[i], cells[i + 1] ?? { text: '' }]);
      return [{ table: { widths: ['*', '*'], body, dontBreakRows: true }, layout: { ...grid, paddingTop: () => 4, paddingBottom: () => 4 } }];
    }
    case 'table': {
      const many = b.columns.length > 7;
      const head: TableCell[] = b.columns.map((c) => ({ text: c.label, bold: true, fillColor: C.canvas, color: C.ink, fontSize: many ? 7.5 : 8, alignment: isNumeric(c.kind) ? 'right' : 'left' }));
      const cell = (kind: (typeof b.columns)[number]['kind'], v: unknown, bold = false): TableCell => ({
        text: v === undefined || (bold && v === null) ? '' : cellText(kind, v as never),
        alignment: isNumeric(kind) ? 'right' : 'left',
        color: isNegative(kind, v as never) ? C.danger : undefined,
        bold,
        noWrap: isNumeric(kind),
      });
      const rows: TableCell[][] = b.rows.length ? b.rows.map((r) => b.columns.map((c) => cell(c.kind, r[c.key]))) : [[{ text: b.empty, color: C.muted, colSpan: b.columns.length }, ...b.columns.slice(1).map(() => ({ text: '' }))]];
      if (b.total) rows.push(b.columns.map((c) => cell(c.kind, b.total![c.key], true)));
      return [
        ...(b.title ? [{ text: b.title, style: 'h3' } as Content] : []),
        ...(b.note ? [{ text: b.note, color: C.muted, fontSize: 8, margin: [0, 0, 0, 3] } as Content] : []),
        {
          table: { headerRows: 1, dontBreakRows: true, widths: widthsOf(b), body: [head, ...rows] },
          layout: grid,
          fontSize: many ? 7.5 : 8.5,
          margin: [0, 0, 0, 8],
        },
      ];
    }
  }
}

function cover(r: OfficialReportDto, lineWidth: number): Content[] {
  return [
    { columns: [{ svg: markSvg(30), width: 30 }, { text: r.organizationName, fontSize: 16, bold: true, color: C.ink, margin: [10, 6, 0, 0] }] },
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: lineWidth, y2: 8, lineWidth: 2, lineColor: C.ink }, { type: 'line', x1: 0, y1: 11, x2: lineWidth, y2: 11, lineWidth: 2, lineColor: C.accent }] },
    { text: r.title.toUpperCase(), color: C.accentDeep, bold: true, fontSize: 12, characterSpacing: 1, margin: [0, 70, 0, 4] },
    { text: r.period, fontSize: 32, bold: true, color: C.ink },
    { text: r.project.name, fontSize: 14, color: C.ink, margin: [0, 6, 0, 30] },
    facts([
      { label: 'Report no.', value: r.reportNo === null ? null : String(r.reportNo) },
      { label: 'Doc no.', value: r.docNo },
      ...r.header.filter((f) => ['Client', 'Consultant', 'Contractor', 'LOA / work order no.', 'Agreement no.'].includes(f.label)),
      { label: 'Date of submission', value: r.issue ? r.issue.issuedAt.slice(0, 10) : null, kind: 'date' },
      { label: 'Status', value: issueLine(r) },
      ...r.signatures.slice(0, 2).map((s) => ({ label: s.role.replace(/ \(.*\)$/, ''), value: s.name })),
    ]),
    { text: 'CONTENTS', style: 'h2', margin: [0, 18, 0, 6] },
    {
      columns: [0, 1].map((half) => {
        const cut = Math.ceil(r.chapters.length / 2);
        return { ol: r.chapters.slice(half * cut, (half + 1) * cut).map((c) => c.title.replace(/^\d+\.\s*/, '')), start: half * cut + 1, fontSize: 10 };
      }),
      pageBreak: 'after',
    },
  ];
}

export async function buildOfficialReportPdf(r: OfficialReportDto): Promise<TDocumentDefinitions> {
  const wide = r.chapters.some((c) => c.blocks.some((b) => b.type === 'table' && b.columns.length > WIDE_COLUMNS));
  const photos = await loadPhotos(r.chapters.flatMap((c) => c.blocks.flatMap((b) => (b.type === 'photos' ? b.photos.map((p) => p.url) : []))));
  const pageWidth = wide ? 842 : 595;
  const control = controlFacts(r);
  const monthly = r.kind === 'MONTHLY';
  return {
    pageSize: 'A4',
    pageOrientation: wide ? 'landscape' : 'portrait',
    pageMargins: [34, 76, 34, 44],
    info: { title: `${r.title} ${r.docNo}`, author: r.organizationName, subject: `${r.project.name}, ${r.period}`, creator: BRAND.name },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, lineHeight: 1.15, color: '#111111' },
    styles: {
      h2: { fontSize: 10.5, bold: true, color: C.ink, characterSpacing: 0.5, margin: [0, 10, 0, 5] },
      h3: { fontSize: 9, bold: true, color: C.ink, margin: [0, 5, 0, 3] },
    },
    header: (page) =>
      monthly && page === 1
        ? null
        : {
            margin: [34, 20, 34, 0],
            stack: [
              {
                columns: [
                  { width: '*', columns: [{ svg: markSvg(18), width: 18 }, { text: r.organizationName, bold: true, color: C.ink, fontSize: 10, margin: [6, 3, 0, 0] }] },
                  { width: '*', stack: [{ text: r.title, bold: true, fontSize: 13, color: C.ink, alignment: 'center' }, { text: r.period, alignment: 'center', color: C.muted, fontSize: 8 }] },
                  { width: '*', table: { widths: ['*', 'auto'], body: control.map((f) => [{ text: f.label, color: C.muted, alignment: 'right' }, { text: factText(f), bold: true, color: C.ink }]) }, layout: 'noBorders', fontSize: 7.5 },
                ],
              },
              { canvas: [{ type: 'line', x1: 0, y1: 5, x2: pageWidth - 68, y2: 5, lineWidth: 1.5, lineColor: C.ink }, { type: 'line', x1: 0, y1: 7.5, x2: pageWidth - 68, y2: 7.5, lineWidth: 1.5, lineColor: C.accent }] },
            ],
          },
    footer: (page, pages) => ({
      margin: [34, 14, 34, 0],
      columns: [
        { text: r.docNo, color: C.muted, fontSize: 7.5 },
        { text: `${BRAND.wordmark}`, alignment: 'center', bold: true, color: C.ink, fontSize: 7.5, characterSpacing: 1 },
        { text: `Page ${page} of ${pages}`, alignment: 'right', color: C.muted, fontSize: 7.5 },
      ],
    }),
    content: [
      ...(monthly ? cover(r, pageWidth - 68) : []),
      facts(r.header),
      ...r.chapters.flatMap((c) => [{ text: c.title.toUpperCase(), style: 'h2' } as Content, ...c.blocks.flatMap((b) => block(b, photos, wide))]),
      {
        columns: r.signatures.map((s) => ({
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.75, lineColor: '#333333' }] },
            { text: s.name ?? ' ', bold: true, color: C.ink, margin: [0, 3, 0, 0] },
            { text: s.role, color: C.muted, fontSize: 7.5 },
          ],
        })),
        columnGap: 24,
        margin: [0, 44, 0, 10],
        unbreakable: true,
      },
      { text: footNote(r), color: C.muted, fontSize: 7.5 },
    ],
  };
}

/** Write the PDF and start the download. */
export async function downloadOfficialReportPdf(r: OfficialReportDto) {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(vfs);
  const doc = pdfMake.createPdf(await buildOfficialReportPdf(r));
  await doc.download(officialFileName(r, 'pdf'));
}
