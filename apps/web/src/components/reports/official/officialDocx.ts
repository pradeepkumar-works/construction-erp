import { BRAND } from '@/lib/brand';
import { officialFileName, type OfficialBlockDto, type OfficialFactDto, type OfficialReportDto } from '@erp/shared';
import { cellText, isNegative, isNumeric } from '@/components/management/report-format';
import { controlFacts, factText, footNote, issueLine, WIDE_COLUMNS } from './official-format';
import { loadPhotos, type PhotoData } from './photoData';

/**
 * An official progress report as a Word file, for a client who wants to add their own lines before it is
 * signed: the same `OfficialReportDto` as the page and the PDF, with the document control strip in the page header and
 * "Page x of y" in the footer. The docx library loads on the first download.
 */

type Docx = typeof import('docx');
const hex = (c: string) => c.replace('#', '');
const C = BRAND.colors;

export async function buildOfficialReportDocx(r: OfficialReportDto): Promise<Blob> {
  const d: Docx = await import('docx');
  const { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, PageBreak, PageNumber, PageOrientation, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = d;
  const wide = r.chapters.some((c) => c.blocks.some((b) => b.type === 'table' && b.columns.length > WIDE_COLUMNS));
  const photos = await loadPhotos(r.chapters.flatMap((c) => c.blocks.flatMap((b) => (b.type === 'photos' ? b.photos.map((p) => p.url) : []))), 1000);
  const border = { style: BorderStyle.SINGLE, size: 4, color: hex(C.border) };
  const borders = { top: border, bottom: border, left: border, right: border };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
  const shade = { type: ShadingType.CLEAR, color: 'auto', fill: hex(C.canvas) };
  const run = (text: string, o: { bold?: boolean; color?: string; size?: number } = {}) => new TextRun({ text, bold: o.bold, color: o.color ? hex(o.color) : undefined, size: o.size ?? 17, font: 'Calibri' });
  const para = (text: string, o: { bold?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}) =>
    new Paragraph({ children: [run(text, o)], alignment: o.align, spacing: { after: o.after ?? 0, before: o.before ?? 0 } });
  const cell = (children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[], o: { fill?: boolean; width?: number; span?: number } = {}) =>
    new TableCell({ children, shading: o.fill ? shade : undefined, borders, columnSpan: o.span, width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 } });

  const facts = (list: OfficialFactDto[]) => {
    const rows: InstanceType<typeof TableRow>[] = [];
    for (let i = 0; i < list.length; i += 2) {
      const pair = (f?: OfficialFactDto) => [cell([para(f?.label ?? '', { bold: true, color: C.ink, size: 16 })], { fill: true, width: 17 }), cell([para(f ? factText(f) : '')], { width: 33 })];
      rows.push(new TableRow({ children: [...pair(list[i]), ...pair(list[i + 1])] }));
    }
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  };
  const h2 = (t: string) => para(t.toUpperCase(), { bold: true, color: C.ink, size: 21, before: 240, after: 100 });
  const h3 = (t: string) => para(t, { bold: true, color: C.ink, size: 18, before: 120, after: 60 });
  const image = (p: PhotoData, maxW: number, maxH: number) => {
    const s = Math.min(maxW / p.width, maxH / p.height, 1);
    return new ImageRun({ type: 'jpg', data: p.bytes, transformation: { width: Math.round(p.width * s), height: Math.round(p.height * s) } });
  };

  // Word shares a table's width out by its columns' contents: long text takes more, numbers and codes their own.
  const pageTwips = (wide ? 16838 : 11906) - 1440;
  const columnWidths = (b: Extract<OfficialBlockDto, { type: 'table' }>) => {
    const weight = b.columns.map((c) => {
      const len = Math.max(...c.label.split(' ').map((w) => w.length), ...b.rows.map((row) => cellText(c.kind, row[c.key]).length));
      return c.kind === 'text' && len > 14 ? Math.min(6, Math.max(3, len / 12)) : Math.max(1, Math.min(2, len / 8));
    });
    const sum = weight.reduce((a, w) => a + w, 0);
    return weight.map((w) => Math.round((w / sum) * pageTwips));
  };

  const block = (b: OfficialBlockDto): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] => {
    switch (b.type) {
      case 'facts':
        return [facts(b.facts), para('', { after: 80 })];
      case 'text':
        return [...(b.title ? [h3(b.title)] : []), ...b.paragraphs.map((p) => para(p, { size: 19, after: 100 }))];
      case 'figures':
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
              new TableRow({
                children: b.figures.map(
                  (f) =>
                    new TableCell({
                      borders: { top: border, bottom: border, left: none, right: none },
                      children: [para(f.label, { color: C.muted, size: 15 }), para(cellText(f.kind, f.value), { bold: true, color: C.ink, size: 28 }), ...(f.note ? [para(f.note, { color: C.muted, size: 14 })] : [])],
                    }),
                ),
              }),
            ],
          }),
          para('', { after: 80 }),
        ];
      case 'photos': {
        if (!b.photos.length) return [para(b.empty ?? 'No photographs.', { color: C.muted })];
        const rows: InstanceType<typeof TableRow>[] = [];
        const maxW = wide ? 440 : 300;
        const one = (p?: (typeof b.photos)[number]) => {
          if (!p) return cell([para('')], { width: 50 });
          const img = photos.get(p.url);
          return cell([img ? new Paragraph({ children: [image(img, maxW, 220)], alignment: AlignmentType.CENTER }) : para('Photograph could not be read', { color: C.muted }), para(p.caption, { size: 15, before: 40 })], { width: 50 });
        };
        for (let i = 0; i < b.photos.length; i += 2) rows.push(new TableRow({ children: [one(b.photos[i]), one(b.photos[i + 1])], cantSplit: true }));
        return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
      }
      case 'table': {
        const size = b.columns.length > 7 ? 14 : 16;
        const align = (kind: (typeof b.columns)[number]['kind']) => (isNumeric(kind) ? AlignmentType.RIGHT : AlignmentType.LEFT);
        const head = new TableRow({ tableHeader: true, children: b.columns.map((c) => cell([para(c.label, { bold: true, color: C.ink, size, align: align(c.kind) })], { fill: true })) });
        const body = b.rows.length
          ? b.rows.map((row) => new TableRow({ cantSplit: true, children: b.columns.map((c) => cell([para(cellText(c.kind, row[c.key]), { size, align: align(c.kind), color: isNegative(c.kind, row[c.key]) ? C.danger : undefined })])) }))
          : [new TableRow({ children: [cell([para(b.empty, { color: C.muted, size })], { span: b.columns.length })] })];
        const total = b.total ? [new TableRow({ children: b.columns.map((c) => cell([para(b.total![c.key] === undefined || b.total![c.key] === null ? '' : cellText(c.kind, b.total![c.key]), { bold: true, size, align: align(c.kind) })])) })] : [];
        return [
          ...(b.title ? [h3(b.title)] : []),
          ...(b.note ? [para(b.note, { color: C.muted, size: 15, after: 40 })] : []),
          new Table({ rows: [head, ...body, ...total], width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: columnWidths(b), layout: TableLayoutType.FIXED }),
          para('', { after: 80 }),
        ];
      }
    }
  };

  const control = controlFacts(r);
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { ...noBorders, bottom: { style: BorderStyle.DOUBLE, size: 6, color: hex(C.ink) } },
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders: noBorders, width: { size: 30, type: WidthType.PERCENTAGE }, children: [para(r.organizationName, { bold: true, color: C.ink, size: 20 })] }),
              new TableCell({ borders: noBorders, width: { size: 40, type: WidthType.PERCENTAGE }, children: [para(r.title, { bold: true, color: C.ink, size: 24, align: AlignmentType.CENTER }), para(r.period, { color: C.muted, size: 15, align: AlignmentType.CENTER })] }),
              new TableCell({ borders: noBorders, width: { size: 30, type: WidthType.PERCENTAGE }, children: control.map((f) => new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${f.label}  `, { color: C.muted, size: 14 }), run(factText(f), { bold: true, color: C.ink, size: 14 })] })) }),
            ],
          }),
        ],
      }),
      para('', { after: 60 }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [run(`${r.docNo}    ${BRAND.wordmark}    Page `, { color: C.muted, size: 14 }), new TextRun({ children: [PageNumber.CURRENT], size: 14, color: hex(C.muted) }), run(' of ', { color: C.muted, size: 14 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: hex(C.muted) })],
      }),
    ],
  });

  const cover =
    r.kind === 'MONTHLY'
      ? [
          para(r.organizationName, { bold: true, color: C.ink, size: 32, after: 1200 }),
          para(r.title.toUpperCase(), { bold: true, color: C.accentDeep, size: 24 }),
          para(r.period, { bold: true, color: C.ink, size: 64, after: 120 }),
          para(r.project.name, { color: C.ink, size: 28, after: 480 }),
          facts([
            { label: 'Report no.', value: r.reportNo === null ? null : String(r.reportNo) },
            { label: 'Doc no.', value: r.docNo },
            ...r.header.filter((f) => ['Client', 'Consultant', 'Contractor', 'LOA / work order no.', 'Agreement no.'].includes(f.label)),
            { label: 'Date of submission', value: r.issue ? r.issue.issuedAt.slice(0, 10) : null, kind: 'date' },
            { label: 'Status', value: issueLine(r) },
            ...r.signatures.slice(0, 2).map((s) => ({ label: s.role.replace(/ \(.*\)$/, ''), value: s.name })),
          ]),
          h2('Contents'),
          ...r.chapters.map((c) => para(c.title, { size: 19, after: 40 })),
          new Paragraph({ children: [new PageBreak()] }),
        ]
      : [];

  const signatures = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: r.signatures.map(
          (s) =>
            new TableCell({
              borders: { ...noBorders, top: { style: BorderStyle.SINGLE, size: 6, color: '333333' } },
              margins: { top: 60, right: 200 },
              children: [para(s.name ?? ' ', { bold: true, color: C.ink, size: 18 }), para(s.role, { color: C.muted, size: 15 })],
            }),
        ),
      }),
    ],
  });

  const doc = new Document({
    creator: BRAND.name,
    title: `${r.title} ${r.docNo}`,
    description: `${r.project.name}, ${r.period}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 17 } } } },
    sections: [
      {
        properties: { page: { size: { orientation: wide ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: 1300, bottom: 900, left: 720, right: 720 } } },
        headers: { default: header },
        footers: { default: footer },
        children: [
          ...cover,
          facts(r.header),
          ...r.chapters.flatMap((c) => [h2(c.title), ...c.blocks.flatMap(block)]),
          para('', { after: 900 }),
          signatures,
          para(footNote(r), { color: C.muted, size: 14, before: 200 }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** Write the Word file and start the download. */
export async function downloadOfficialReportDocx(r: OfficialReportDto) {
  const blob = await buildOfficialReportDocx(r);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = officialFileName(r, 'docx');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
