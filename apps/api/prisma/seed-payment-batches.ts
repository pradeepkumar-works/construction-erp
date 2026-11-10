import { PrismaClient } from '@prisma/client';
import { bankFileRows, bankFileText, docNoPrefix, docPatternOf, paymentMode } from '@erp/shared';
import { seedToday } from './seed-clock';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Bank payments: the payments already made through the bank against approved requests, with their UTRs, as one settled
 * batch from the company's salary debit account, so Accounts › Bank payments opens on a batch with its file. It writes
 * only the batch and its lines; the payments stay as they are. Only when the company has no batch yet.
 */
export async function seedPaymentBatches(prisma: PrismaClient, organizationId: string) {
  if (await prisma.paymentBatch.count({ where: { organizationId } })) return;
  const payments = await prisma.vendorPayment.findMany({
    where: { organizationId, mode: 'BANK', reference: { not: null }, paymentRequestId: { not: null }, batchLine: null, vendor: { bankAccountNo: { not: null }, bankIfsc: { not: null } } },
    include: { vendor: true, paymentRequest: { select: { id: true, requestNo: true } } },
    orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }],
    take: 5,
  });
  const [accounts, settings, org] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'accounts@demo.com' }, select: { id: true } }),
    prisma.payrollSettings.findUnique({ where: { organizationId }, select: { debitAccountNo: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { docSeries: true } }),
  ]);
  if (!payments.length || !accounts) return;
  const paidOn = payments[0].paymentDate;
  const debitAccount = settings?.debitAccountNo ?? '50200012345678';
  const file = bankFileRows(
    'GENERIC',
    { debitAccount, valueDate: ymd(paidOn) },
    payments.map((p) => ({ name: p.vendor.name, accountNo: p.vendor.bankAccountNo, ifsc: p.vendor.bankIfsc, amount: p.amount.toFixed(2), narration: p.paymentRequest!.requestNo, reference: p.paymentRequest!.requestNo })),
  );
  const batchNo = `${docNoPrefix(docPatternOf(org?.docSeries, 'PB'), seedToday())}0001`;
  await prisma.paymentBatch.create({
    data: {
      organizationId,
      batchNo,
      debitAccount,
      format: 'GENERIC',
      status: 'SETTLED',
      createdById: accounts.id,
      createdAt: paidOn,
      exportedById: accounts.id,
      exportedAt: paidOn,
      paymentDate: paidOn,
      fileName: `${batchNo}-generic.csv`,
      fileContent: bankFileText(file.rows),
      settledAt: paidOn,
      lines: {
        create: payments.map((p) => ({
          organizationId,
          paymentRequestId: p.paymentRequest!.id,
          amount: p.amount,
          open: false,
          accountNo: p.vendor.bankAccountNo!.replace(/\s+/g, '').toUpperCase(),
          ifsc: p.vendor.bankIfsc!.replace(/\s+/g, '').toUpperCase(),
          payMode: paymentMode(p.amount.toFixed(2)),
          vendorPaymentId: p.id,
          createdAt: paidOn,
        })),
      },
    },
  });
}
