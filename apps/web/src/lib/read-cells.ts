import { loadXlsx } from '@/lib/exportExcel';

/** A bank's file as cells, row by row: Excel dates as YYYY-MM-DD, CSV kept as the bank wrote it. */
export async function readCells(f: File): Promise<unknown[][]> {
  const XLSX = await loadXlsx();
  const buf = await f.arrayBuffer();
  const wb = /\.(xlsx|xls)$/i.test(f.name)
    ? XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
    : XLSX.read(new TextDecoder().decode(buf), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
  });
}
