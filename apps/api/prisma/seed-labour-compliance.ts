/**
 * Contractors' labour papers and challans (ARCHITECTURE "Contract labour compliance"). Invented throughout.
 *
 * - The first contractor on the head counts (by name) has every paper: a labour licence for each site it works, PF and ESI
 *   codes, a workmen's compensation policy and BOCW registration, and PF and ESI challans for the last three months, one
 *   paid late.
 * - The second has its codes and BOCW registration but no labour licence for its site, and the last month's challans not
 *   yet shown, so its bills are held.
 * - Any other has a workmen's compensation policy only.
 *
 * Skipped for a company that already has labour papers.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthOf = (d: Date, back: number) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
  return ymd(x).slice(0, 7);
};
const onDay = (month: string, dayNo: number) => new Date(`${nextMonth(month)}-${String(dayNo).padStart(2, '0')}T00:00:00Z`);
function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export async function seedLabourCompliance(prisma: PrismaClient, organizationId: string) {
  if (await prisma.labourPaper.count({ where: { organizationId } })) return;
  const keeper = await prisma.user.findFirst({ where: { organizationId, role: { key: { in: ['ACCOUNTS_MANAGER', 'ADMIN'] } } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!keeper) return;
  const lines = await prisma.attendanceLine.findMany({ where: { vendorId: { not: null }, sheet: { organizationId } }, select: { vendorId: true, vendor: { select: { name: true } }, sheet: { select: { projectId: true } } } });
  const sites = new Map<string, { name: string; projects: Set<string> }>();
  for (const l of lines) {
    const v = sites.get(l.vendorId!) ?? { name: l.vendor!.name, projects: new Set<string>() };
    v.projects.add(l.sheet.projectId);
    sites.set(l.vendorId!, v);
  }
  const vendors = [...sites.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
  if (!vendors.length) return;

  const today = day(new Date());
  const fyStart = new Date(Date.UTC(today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 3, 1));
  const fyEnd = new Date(Date.UTC(fyStart.getUTCFullYear() + 1, 2, 31));
  const yearOn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 4, 1));
  const yearTo = new Date(Date.UTC(yearOn.getUTCFullYear() + 1, yearOn.getUTCMonth(), 0));
  const base = { organizationId, createdById: keeper.id };
  const paper = (vendorId: string, kind: Prisma.LabourPaperCreateManyInput['kind'], number: string, extra: Partial<Prisma.LabourPaperCreateManyInput> = {}) => ({ ...base, vendorId, kind, number, ...extra });

  const papers: Prisma.LabourPaperCreateManyInput[] = [];
  const challans: Prisma.LabourChallanCreateManyInput[] = [];
  const months = [3, 2, 1].map((b) => monthOf(today, b));
  for (const [i, [vendorId, v]] of vendors.entries()) {
    const n = 1000 + i * 37;
    if (i === 0) {
      for (const [j, projectId] of [...v.projects].entries()) papers.push(paper(vendorId, 'CLRA_LICENCE', `ALC/BBSR/CLRA/${fyStart.getUTCFullYear()}/0${n + j}`, { projectId, validFrom: fyStart, validTo: fyEnd, workers: 60 }));
      papers.push(paper(vendorId, 'PF_CODE', `ODBBS00${n}000`), paper(vendorId, 'ESI_CODE', `4400012${n}0001001`));
      papers.push(paper(vendorId, 'WC_POLICY', `WC/${n}/NIA`, { validFrom: yearOn, validTo: yearTo, workers: 15, note: 'For men above the ESI wage limit' }));
      papers.push(paper(vendorId, 'BOCW_REGISTRATION', `OBOCW/${fyStart.getUTCFullYear() - 1}/${n}`, { validFrom: fyStart, validTo: new Date(Date.UTC(fyEnd.getUTCFullYear() + 2, 2, 31)) }));
      for (const [k, month] of months.entries()) {
        challans.push({ ...base, vendorId, kind: 'PF', month, amount: new Prisma.Decimal(42000 + k * 1850), workers: 34 + k, paidOn: onDay(month, k === 1 ? 19 : 12), reference: `TRRN ${n}${month.replace('-', '')}1` });
        challans.push({ ...base, vendorId, kind: 'ESI', month, amount: new Prisma.Decimal(11800 + k * 420), workers: 34 + k, paidOn: onDay(month, 13), reference: `ESIC ${n}${month.replace('-', '')}` });
      }
    } else if (i === 1) {
      papers.push(paper(vendorId, 'PF_CODE', `ODBBS00${n}000`), paper(vendorId, 'ESI_CODE', `4400012${n}0001001`));
      papers.push(paper(vendorId, 'BOCW_REGISTRATION', `OBOCW/${fyStart.getUTCFullYear()}/${n}`, { validFrom: fyStart, validTo: new Date(Date.UTC(fyEnd.getUTCFullYear() + 2, 2, 31)) }));
      for (const month of months.slice(0, 2)) {
        challans.push({ ...base, vendorId, kind: 'PF', month, amount: new Prisma.Decimal(23600), workers: 21, paidOn: onDay(month, 14), reference: `TRRN ${n}${month.replace('-', '')}1` });
        challans.push({ ...base, vendorId, kind: 'ESI', month, amount: new Prisma.Decimal(6650), workers: 21, paidOn: onDay(month, 14), reference: `ESIC ${n}${month.replace('-', '')}` });
      }
    } else {
      papers.push(paper(vendorId, 'WC_POLICY', `WC/${n}/UIIC`, { validFrom: yearOn, validTo: yearTo, workers: 12 }));
    }
  }
  // A challan is never paid after today: a month whose payday is still ahead is left for the contractor to show.
  await prisma.labourPaper.createMany({ data: papers });
  await prisma.labourChallan.createMany({ data: challans.filter((c) => ymd(c.paidOn as Date) <= ymd(today)) });
}
