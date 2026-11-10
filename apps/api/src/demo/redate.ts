import { Prisma, type PrismaClient } from '@prisma/client';
import { DEMO_CLOCK_SKIP_COLUMNS, DEMO_CLOCK_SKIP_TABLES, demoShiftDays, demoShiftMonths } from './demo-clock-rules';

type Db = Pick<PrismaClient, '$queryRawUnsafe' | '$executeRawUnsafe' | '$transaction'>;
type Tx = Pick<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;

/** Far enough that a first step lands every row clear of every other before the second brings them back: no unique key on a date trips half way. */
const FAR_DAYS = 40_000;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

interface Column {
  table: string;
  column: string;
  isDate: boolean;
}

export interface RedateResult {
  organizationId: string;
  days: number;
  months: number;
}

/** Every date and timestamp column, by table, and which tables carry `organizationId` (directly or through their parent). */
async function dateColumns(db: Tx) {
  const cols = await db.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('date', 'timestamp without time zone', 'timestamp with time zone')`,
  );
  const orgTables = new Set(
    (await db.$queryRawUnsafe<{ table_name: string }[]>(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizationId'`)).map((r) => r.table_name),
  );
  const fks = await db.$queryRawUnsafe<{ child: string; fk: string; parent: string }[]>(
    `SELECT kcu.table_name AS child, kcu.column_name AS fk, ccu.table_name AS parent
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY kcu.table_name, kcu.column_name`,
  );
  const byTable = new Map<string, Column[]>();
  for (const c of cols) {
    if (DEMO_CLOCK_SKIP_TABLES.has(c.table_name) || DEMO_CLOCK_SKIP_COLUMNS.has(c.column_name)) continue;
    byTable.set(c.table_name, [...(byTable.get(c.table_name) ?? []), { table: c.table_name, column: c.column_name, isDate: c.data_type === 'date' }]);
  }
  // A child table without its own organizationId (a revision of a document) is moved through its parent's.
  const parentOf = new Map<string, { fk: string; parent: string }>();
  for (const f of fks) if (!orgTables.has(f.child) && orgTables.has(f.parent) && !parentOf.has(f.child)) parentOf.set(f.child, { fk: f.fk, parent: f.parent });
  return { byTable, orgTables, parentOf };
}

const shift = (cols: Column[], days: number) => cols.map((c) => `${q(c.column)} = ${q(c.column)} + ${c.isDate ? `${days}` : `interval '${days} days'`}`).join(', ');

/** Move one company's dates `days` forward, its `YYYY-MM` months `months` on, and mark it dated `today`. */
async function moveOrganization(tx: Tx, organizationId: string, datedOn: string, today: string, schema: Awaited<ReturnType<typeof dateColumns>>) {
  const days = demoShiftDays(datedOn, today);
  const months = demoShiftMonths(datedOn, today);
  for (const [table, cols] of schema.byTable) {
    const own = schema.orgTables.has(table);
    const via = own ? null : schema.parentOf.get(table);
    if (!own && !via) continue;
    for (const step of [days + FAR_DAYS, -FAR_DAYS]) {
      if (own) await tx.$executeRawUnsafe(`UPDATE ${q(table)} SET ${shift(cols, step)} WHERE "organizationId" = $1`, organizationId);
      else
        await tx.$executeRawUnsafe(
          `UPDATE ${q(table)} AS c SET ${shift(cols, step).replace(/"(\w+)" = "\1"/g, '"$1" = c."$1"')} FROM ${q(via!.parent)} AS p WHERE c.${q(via!.fk)} = p."id" AND p."organizationId" = $1`,
          organizationId,
        );
    }
  }
  // A depreciation run for a calendar month stays one: back on the month it was for, then on by the months crossed.
  const monthOf = (col: string) => `date_trunc('month', ${col} - ${days})`;
  const wholeMonth = `extract(day from r."periodFrom" - ${days}) = 1 AND r."periodTo" - ${days} = (${monthOf('r."periodFrom"')} + interval '1 month' - interval '1 day')::date`;
  const newFrom = `(${monthOf('r."periodFrom"')} + interval '${months} months')::date`;
  const newTo = `(${monthOf('r."periodFrom"')} + interval '${months + 1} months' - interval '1 day')::date`;
  await tx.$executeRawUnsafe(
    `UPDATE "DepreciationLine" AS l SET "from" = ${newFrom}, "to" = ${newTo} FROM "DepreciationRun" AS r
      WHERE l."runId" = r."id" AND r."organizationId" = $1 AND l."from" = r."periodFrom" AND l."to" = r."periodTo" AND ${wholeMonth}`,
    organizationId,
  );
  await tx.$executeRawUnsafe(`UPDATE "DepreciationRun" AS r SET "periodFrom" = ${newFrom}, "periodTo" = ${newTo} WHERE r."organizationId" = $1 AND ${wholeMonth}`, organizationId);
  // A TDS return is keyed by its quarter's first day: moved by the days with everything else, it goes to the nearest
  // quarter's first day, so it stays one quarter's return and two never land on the same one.
  await tx.$executeRawUnsafe(`UPDATE "TdsReturn" SET "periodFrom" = date_trunc('quarter', "periodFrom" + 45)::date WHERE "organizationId" = $1`, organizationId);
  if (months) {
    const next = (col: string) => `to_char(to_date(${col} || '-01', 'YYYY-MM-DD') + interval '${months} months', 'YYYY-MM')`;
    // A salary run is keyed by its month (and named by it), so it takes the same two steps through a marked value.
    await tx.$executeRawUnsafe(`UPDATE "PayrollRun" SET "month" = '~' || "month", "runNo" = '~' || "runNo" WHERE "organizationId" = $1`, organizationId);
    await tx.$executeRawUnsafe(
      `UPDATE "PayrollRun" SET "month" = ${next(`substr("month", 2)`)}, "runNo" = replace(substr("runNo", 2), substr("month", 2), ${next(`substr("month", 2)`)}) WHERE "organizationId" = $1`,
      organizationId,
    );
    await tx.$executeRawUnsafe(`UPDATE "StaffLoan" SET "startMonth" = ${next(`"startMonth"`)} WHERE "organizationId" = $1`, organizationId);
    const years = Number(today.slice(0, 4)) - Number(datedOn.slice(0, 4));
    if (years) {
      await tx.$executeRawUnsafe(`UPDATE "LeaveOpening" SET "year" = "year" + 100000 WHERE "organizationId" = $1`, organizationId);
      await tx.$executeRawUnsafe(`UPDATE "LeaveOpening" SET "year" = "year" - 100000 + ${years} WHERE "organizationId" = $1`, organizationId);
    }
  }
  await tx.$executeRawUnsafe(
    `UPDATE "Organization" SET "demoDatedOn" = $2::date,
       "trialEndsAt" = "trialEndsAt" + ${days}, "paidUntil" = "paidUntil" + ${days}
     WHERE "id" = $1`,
    organizationId,
    today,
  );
}

/** Move one demo company, dated `datedOn`, up to `today`, inside the caller's transaction. */
export async function moveDemo(tx: Tx, organizationId: string, datedOn: string, today: string) {
  await moveOrganization(tx, organizationId, datedOn, today, await dateColumns(tx));
}

/**
 * Bring every demo company (a `demoDatedOn` is set only by the demo seed, never on a customer's company) up to `today`:
 * each date and timestamp of its records moves forward by the days since it was last dated, each in one transaction.
 * Idempotent: a second run the same day moves nothing.
 */
export async function redateDemos(db: Db, today: string): Promise<RedateResult[]> {
  const demos = await db.$queryRawUnsafe<{ id: string; datedOn: string }[]>(`SELECT "id", "demoDatedOn"::text AS "datedOn" FROM "Organization" WHERE "demoDatedOn" IS NOT NULL ORDER BY "code"`);
  const out: RedateResult[] = [];
  for (const d of demos) {
    const days = demoShiftDays(d.datedOn, today);
    if (!days) continue;
    const months = demoShiftMonths(d.datedOn, today);
    await db.$transaction(async (tx) => moveDemo(tx, d.id, d.datedOn, today), { timeout: 300_000, maxWait: 30_000 });
    out.push({ organizationId: d.id, days, months });
  }
  return out;
}
