import { Prisma, PrismaClient } from '@prisma/client';
import { STANDARD_RESIDUAL_PCT, accumulatedTo, bookDepreciation, docNoPrefix, docPatternOf, type AssetClassCode, type DepreciableAsset, type DepreciationMethod } from '@erp/shared';
import { day, seedToday } from './seed-clock';

const D = (v: number) => new Prisma.Decimal(v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (s: string, n: number) => ymd(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const monthEnd = (s: string) => ymd(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0)));

interface Seeded {
  code: string | null;
  name: string;
  assetClass: AssetClassCode;
  method: DepreciationMethod;
  cost: number;
  lifeYears: number;
  usedDaysAgo: number;
  serialNo?: string;
  fundedBy: 'IN_BOOKS' | 'BANK' | 'CASH';
}

/**
 * The fixed asset register. The owned machines were in the books before they began on Nirmaan: their book value then is
 * the opening Plant and Machinery (each machine's share by its own schedule), so the register equals the balance sheet.
 * A laptop and office furniture were bought since, from the bank, and a printer for cash. Depreciation is posted month by
 * month from the books' first month to the month before last; last month is left to prepare. The second backhoe and DG
 * set at the water scheme stay out, to be made assets from Plant. Only when the company has no fixed asset yet.
 */
export async function seedFixedAssets(prisma: PrismaClient, organizationId: string) {
  if (await prisma.fixedAsset.count({ where: { organizationId } })) return;
  const [accounts, st, org] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'accounts@demo.com' }, select: { id: true } }),
    prisma.booksState.findUnique({ where: { organizationId } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { docSeries: true } }),
  ]);
  if (!accounts || !st?.booksFrom) return;
  const booksFrom = ymd(st.booksFrom);
  const openingAsOf = plusDays(booksFrom, -1);
  const plant = await prisma.bookLine.aggregate({ where: { organizationId, voucher: { source: 'OPENING' }, account: { key: 'ACCOUNT:demo-plant' } }, _sum: { debit: true } });
  const openingPlant = Number(plant._sum.debit ?? 0);

  const machines = await prisma.equipment.findMany({ where: { organizationId, ownership: 'OWNED', code: { in: ['EXC-01', 'JCB-01', 'DG-01', 'MIX-01', 'TIP-07'] } }, select: { id: true, code: true, projectId: true, registrationNo: true } });
  const byCode = new Map(machines.map((m) => [m.code, m]));
  const list: Seeded[] = [
    { code: 'EXC-01', name: 'Excavator (Tata Hitachi EX200)', assetClass: 'EARTH_MOVING', method: 'SLM', cost: 4_200_000, lifeYears: 9, usedDaysAgo: 425, fundedBy: 'IN_BOOKS', serialNo: 'EX200-5G-118342' },
    { code: 'JCB-01', name: 'Backhoe loader (JCB 3DX)', assetClass: 'EARTH_MOVING', method: 'WDV', cost: 2_400_000, lifeYears: 9, usedDaysAgo: 1_060, fundedBy: 'IN_BOOKS', serialNo: 'JCB3DX-2318845' },
    { code: 'DG-01', name: 'DG set 62.5 kVA', assetClass: 'PLANT_GENERAL', method: 'SLM', cost: 800_000, lifeYears: 15, usedDaysAgo: 1_480, fundedBy: 'IN_BOOKS' },
    { code: 'MIX-01', name: 'Concrete mixer with hopper', assetClass: 'CONCRETING', method: 'SLM', cost: 350_000, lifeYears: 12, usedDaysAgo: 1_850, fundedBy: 'IN_BOOKS' },
    { code: 'TIP-07', name: 'Tipper 16 cum', assetClass: 'VEHICLES', method: 'WDV', cost: 1_800_000, lifeYears: 8, usedDaysAgo: 520, fundedBy: 'IN_BOOKS' },
    { code: null, name: 'Laptop for the planning engineer', assetClass: 'COMPUTERS', method: 'SLM', cost: 92_000, lifeYears: 3, usedDaysAgo: 140, fundedBy: 'BANK', serialNo: 'PF4XK2LM' },
    { code: null, name: 'Head office furniture: workstations and chairs', assetClass: 'FURNITURE', method: 'SLM', cost: 285_000, lifeYears: 10, usedDaysAgo: 110, fundedBy: 'BANK' },
    { code: null, name: 'Laser printer', assetClass: 'OFFICE_EQUIPMENT', method: 'SLM', cost: 38_500, lifeYears: 5, usedDaysAgo: 75, fundedBy: 'CASH' },
  ];
  const rows = list.filter((a) => !a.code || byCode.has(a.code));
  const schedule = (a: Seeded, opening: DepreciableAsset['opening']): DepreciableAsset => ({ cost: a.cost, residual: Math.round((a.cost * STANDARD_RESIDUAL_PCT) / 100), lifeYears: a.lifeYears, method: a.method, putToUseOn: ymd(day(-a.usedDaysAgo)), opening, disposedOn: null });

  // Each machine's book value on the books' first day, by its own schedule, scaled so they add up to the opening Plant and Machinery.
  const before = rows.filter((a) => a.fundedBy === 'IN_BOOKS' && ymd(day(-a.usedDaysAgo)) <= openingAsOf);
  const natural = before.map((a) => a.cost - accumulatedTo(schedule(a, null), openingAsOf));
  const naturalTotal = natural.reduce((s, v) => s + v, 0);
  const shares = natural.map((v) => Math.round((openingPlant > 0 && naturalTotal > 0 ? (v * openingPlant) / naturalTotal : v) * 100) / 100);
  if (shares.length && openingPlant > 0) shares[shares.length - 1] = Math.round((openingPlant - shares.slice(0, -1).reduce((s, v) => s + v, 0)) * 100) / 100;

  const prefix = docNoPrefix(docPatternOf(org?.docSeries, 'FA'), seedToday());
  const made: { id: string; asset: DepreciableAsset }[] = [];
  for (const [i, a] of rows.entries()) {
    const k = before.indexOf(a);
    const opening = k >= 0 ? { asOf: openingAsOf, amount: Math.round((a.cost - shares[k]) * 100) / 100 } : null;
    const s = schedule(a, opening);
    const m = a.code ? byCode.get(a.code) : undefined;
    const asset = await prisma.fixedAsset.create({
      data: {
        organizationId,
        assetNo: `${prefix}${String(i + 1).padStart(4, '0')}`,
        name: a.name,
        assetClass: a.assetClass,
        method: a.method,
        cost: D(a.cost),
        residual: D(s.residual),
        lifeYears: a.lifeYears,
        putToUseOn: day(-a.usedDaysAgo),
        fundedBy: a.fundedBy,
        serialNo: a.serialNo ?? m?.registrationNo ?? null,
        invoiceNo: a.fundedBy === 'IN_BOOKS' ? null : `INV/${String(4100 + i)}`,
        projectId: m?.projectId ?? null,
        equipmentId: m?.id ?? null,
        openingAsOf: opening ? new Date(`${opening.asOf}T00:00:00Z`) : null,
        openingDepreciation: D(opening?.amount ?? 0),
        createdById: accounts.id,
        createdAt: day(-Math.min(a.usedDaysAgo, 200)),
      },
      select: { id: true },
    });
    made.push({ id: asset.id, asset: s });
  }

  // Posted runs month by month from the books' first month to the month before last.
  const thisMonth = `${seedToday().slice(0, 7)}-01`;
  const lastToPost = plusDays(`${plusDays(thisMonth, -1).slice(0, 7)}-01`, -1);
  for (let from = booksFrom; monthEnd(from) <= lastToPost; from = plusDays(monthEnd(from), 1)) {
    const to = monthEnd(from);
    const lines = made.flatMap(({ id, asset }) => {
      const amount = bookDepreciation(asset, from, to);
      if (!(amount > 0)) return [];
      const start = asset.putToUseOn > from ? asset.putToUseOn : from;
      return [{ organizationId, assetId: id, from: new Date(`${start}T00:00:00Z`), to: new Date(`${to}T00:00:00Z`), amount: D(amount) }];
    });
    if (!lines.length) continue;
    const total = lines.reduce((s, l) => s.add(l.amount), D(0));
    const postedAt = new Date(Date.parse(`${plusDays(to, 3)}T06:30:00Z`));
    await prisma.depreciationRun.create({
      data: {
        organizationId,
        periodFrom: new Date(`${from}T00:00:00Z`),
        periodTo: new Date(`${to}T00:00:00Z`),
        status: 'POSTED',
        total,
        preparedById: accounts.id,
        preparedAt: postedAt,
        postedById: accounts.id,
        postedAt,
        lines: { createMany: { data: lines } },
      },
    });
  }
}
