/**
 * Ask Nirmaan's usage, controls and pricing: the plan's AI allowance and the roles rule as unit tests, then
 * on the demo company billed as an ordinary customer: the allowance in the trial and once paid, the company's own cap
 * held under it, a used-up allowance, the read-only (unpaid) state stopping every AI call, roles an admin closed, use by
 * person and month, and the admins' conversation log with its export. No real model is called, nothing is charged, and
 * the company is put back as it was. CI runs it after the seed:
 *
 *   DATABASE_URL=… node dist/scripts/ai-billing-test.js
 */
import assert from 'node:assert/strict';
import { AI_ROLE_CHOICES, aiRoleAllowed, type RoleKey } from '@erp/shared';
import { aiPlanAllowanceInr, billingConfig } from '../common/billing';

// The test model and test billing keys, whatever the environment says: nothing here calls the real model or Razorpay.
process.env.AI_PROVIDER = 'fake';
Object.assign(process.env, {
  RAZORPAY_KEY_ID: 'rzp_test_ai_billing',
  RAZORPAY_KEY_SECRET: 'ai-billing-secret',
  RAZORPAY_API_URL: 'http://localhost:1/v1',
  BILLING_PRICE: '1500',
  BILLING_SELLER_NAME: 'Nirmaan Test Seller',
  BILLING_SELLER_GSTIN: '21AAACN1234F1Z5',
  BILLING_UNIT: 'project',
  BILLING_AI_INR_PER_UNIT: '150',
  BILLING_AI_TRIAL_INR: '1000',
  // The demo company is billed here like any customer.
  BILLING_EXEMPT_ORG_CODES: 'NOBODY',
});

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('the plan includes the trial amount in the trial, per unit once paid, nothing while read-only, and leaves exempt companies alone', () => {
  const cfg = billingConfig()!;
  assert.ok(cfg, 'billing is on with the test keys');
  assert.equal(cfg.aiPerUnitInr, 150);
  assert.equal(cfg.aiTrialInr, 1000);
  assert.equal(aiPlanAllowanceInr(cfg, 'TRIAL', 7), 1000);
  assert.equal(aiPlanAllowanceInr(cfg, 'ACTIVE', 4), 600);
  assert.equal(aiPlanAllowanceInr(cfg, 'ACTIVE', 0), 150);
  assert.equal(aiPlanAllowanceInr(cfg, 'READ_ONLY', 4), 0);
  assert.equal(aiPlanAllowanceInr(cfg, 'EXEMPT', 4), null);
});

test('the allowance amounts fall back to their defaults when unset or not whole rupees', () => {
  const saved = { per: process.env.BILLING_AI_INR_PER_UNIT, trial: process.env.BILLING_AI_TRIAL_INR };
  try {
    delete process.env.BILLING_AI_INR_PER_UNIT;
    process.env.BILLING_AI_TRIAL_INR = 'lots';
    assert.equal(billingConfig()!.aiPerUnitInr, 150);
    assert.equal(billingConfig()!.aiTrialInr, 1000);
    process.env.BILLING_AI_INR_PER_UNIT = '0';
    assert.equal(billingConfig()!.aiPerUnitInr, 0);
  } finally {
    process.env.BILLING_AI_INR_PER_UNIT = saved.per;
    process.env.BILLING_AI_TRIAL_INR = saved.trial;
  }
});

test('admins always have it, guests never, and an empty list opens it to all staff', () => {
  assert.ok(!AI_ROLE_CHOICES.includes('ADMIN'));
  assert.ok(!AI_ROLE_CHOICES.includes('CLIENT_ENGINEER') && !AI_ROLE_CHOICES.includes('CONSULTANT'));
  assert.ok(aiRoleAllowed('ADMIN', ['SITE_ENGINEER']));
  assert.ok(aiRoleAllowed('SITE_ENGINEER', []));
  assert.ok(aiRoleAllowed('SITE_ENGINEER', ['SITE_ENGINEER', 'PROJECT_MANAGER']));
  assert.ok(!aiRoleAllowed('STORE_MANAGER', ['SITE_ENGINEER']));
  assert.ok(!aiRoleAllowed('CLIENT_ENGINEER', []));
  assert.ok(!aiRoleAllowed('CONSULTANT', ['CONSULTANT']));
});

async function unitTests(): Promise<number> {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`AI allowance rules: ${tests.length - failed} of ${tests.length} tests pass`);
  return failed;
}

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { AiService } = await import('../ai/ai.service');
  const { AuthService } = await import('../auth/auth.service');
  const { BillingService } = await import('../billing/billing.service');
  const { todayIn } = await import('../notifications/time');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const ai = app.get(AiService);
  const auth = app.get(AuthService);
  const billing = app.get(BillingService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const statusOf = async (fn: () => Promise<unknown>): Promise<number | null> => {
    try {
      await fn();
      return null;
    } catch (e) {
      return (e as { getStatus?: () => number }).getStatus?.() ?? -1;
    }
  };
  const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
  const as = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`No ${email} in the demo company`);
    return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
  };
  const admin = as('admin@demo.com');
  const engineer = as('engineer@demo.com');
  const pm = users.find((u) => u.role.key === 'PROJECT_MANAGER');
  const manager = pm ? as(pm.email) : null;
  const support = { ...admin, support: { staffName: 'Support', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } };

  const today = todayIn();
  const day = (n: number) => new Date(new Date(`${today}T00:00:00Z`).getTime() + n * 86_400_000);
  const saved = { trialEndsAt: org.trialEndsAt, paidUntil: org.paidUntil, aiEnabled: org.aiEnabled, aiMonthlyCapInr: org.aiMonthlyCapInr, aiRoles: org.aiRoles };
  const set = (data: Partial<typeof saved>) => prisma.organization.update({ where: { id: org.id }, data });
  const startedAt = new Date();
  let threadId: string | null = null;

  try {
    await set({ aiEnabled: true, aiMonthlyCapInr: null, aiRoles: [] });
    const activeProjects = Math.max(1, await prisma.project.count({ where: { organizationId: org.id, status: 'ACTIVE' } }));

    // In the trial: the trial amount, and the company's own cap is held under it.
    await set({ trialEndsAt: day(10), paidUntil: null });
    let s = await ai.settings(admin);
    check('the trial includes the trial amount', s.plan?.status === 'TRIAL' && s.plan.allowanceInr === 1000, JSON.stringify(s.plan));
    check("the trial's cap is the plan's when the company set none", s.effectiveCapInr === 1000, String(s.effectiveCapInr));
    await set({ aiMonthlyCapInr: 400 });
    check('a lower cap of its own holds', (await ai.settings(admin)).effectiveCapInr === 400);
    await set({ aiMonthlyCapInr: 99_999 });
    check('a cap above the plan is held to the plan', (await ai.settings(admin)).effectiveCapInr === 1000);
    const summary = await billing.summary(admin);
    check('Billing shows the AI included in the trial', summary.ai.allowanceInr === 1000 && summary.ai.trialInr === 1000 && summary.ai.perUnitInr === 150, JSON.stringify(summary.ai));

    // Paid: so much per active project.
    await set({ paidUntil: day(30), aiMonthlyCapInr: null });
    s = await ai.settings(admin);
    check('once paid the plan includes 150 per active project', s.plan?.status === 'ACTIVE' && s.plan.allowanceInr === 150 * activeProjects && s.plan.units === activeProjects, JSON.stringify(s.plan));
    check('Billing shows the same allowance', (await billing.summary(admin)).ai.allowanceInr === 150 * activeProjects);
    check('a paid company can ask', (await ai.status(engineer)).enabled === true);

    // A used-up allowance stops questions with 429 and stops the bill-check line, but the brief stays offered.
    await set({ aiMonthlyCapInr: 0 });
    check('a used-up allowance says so', (await ai.status(engineer)).reason === 'CAP_REACHED');
    check('a used-up allowance refuses a question with 429', (await statusOf(() => ai.assertCanAsk(engineer))) === 429);
    check('a used-up allowance still offers the morning brief', (await ai.offeredTo(engineer)) === true);
    await set({ aiMonthlyCapInr: null });

    // Read-only (trial over, nothing paid): no AI call of any kind, and the plan includes nothing.
    await set({ trialEndsAt: day(-1), paidUntil: null });
    const ro = await ai.status(engineer);
    check('a read-only company is told why', ro.enabled === false && ro.reason === 'READ_ONLY', JSON.stringify(ro));
    check('admins of a read-only company are pointed to Billing', (await ai.status(admin)).canManage === true);
    check('a read-only company cannot ask (402)', (await statusOf(() => ai.assertCanAsk(engineer))) === 402);
    check('a read-only company cannot read a document or check photos (402)', (await statusOf(() => ai.singleTurn(engineer, 'system', [{ type: 'text', text: 'x' }], 1000))) === 402);
    check('a read-only company gets no model-written bill-check line', (await ai.checkSummary(engineer, { bill: 'RA 1', flags: [], passed: [] }, 'All checks passed')) === null);
    check('a read-only company gets no brief or weekly summary written', (await ai.writeFromFacts(engineer, 'system', { a: 1 }, 'draft', (t) => t)) === null);
    check('a read-only company is not offered the morning brief', (await ai.offeredTo(engineer)) === false);
    s = await ai.settings(admin);
    check('the read-only plan includes nothing', s.plan?.status === 'READ_ONLY' && s.plan.allowanceInr === 0 && s.effectiveCapInr === 0, JSON.stringify(s.plan));

    // Exempt companies keep the server default (or their own cap), as before billing.
    process.env.BILLING_EXEMPT_ORG_CODES = org.code;
    s = await ai.settings(admin);
    check('an exempt company has no plan allowance', s.plan === null && s.effectiveCapInr > 0, JSON.stringify({ plan: s.plan, cap: s.effectiveCapInr }));
    check('an exempt company can ask even with its trial date past', (await ai.status(engineer)).enabled === true);
    process.env.BILLING_EXEMPT_ORG_CODES = 'NOBODY';
    await set({ paidUntil: day(30) });

    // Roles: an admin opens it to project managers only.
    const updated = await ai.updateSettings(admin, { roles: manager ? ['PROJECT_MANAGER'] : ['STORE_MANAGER'] });
    check('the roles are saved', updated.roles.length === 1, JSON.stringify(updated.roles));
    const roleOff = await ai.status(engineer);
    check('a role left out is told so', roleOff.enabled === false && roleOff.reason === 'ROLE_OFF', JSON.stringify(roleOff));
    check('a role left out is refused (403)', (await statusOf(() => ai.assertCanAsk(engineer))) === 403);
    check('a role left out is not offered the morning brief', (await ai.offeredTo(engineer)) === false);
    check('a role left out loses the Ask button', !(await auth.me(engineer)).ai);
    check('admins keep it', (await ai.status(admin)).enabled === true && !!(await auth.me(admin)).ai);
    if (manager) check('the chosen role has it', (await ai.status(manager)).enabled === true);
    const roleAudit = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: 'AI_SETTINGS', actorId: admin.id, createdAt: { gte: startedAt } }, orderBy: { createdAt: 'desc' } });
    check('the change of roles is in the audit log', !!roleAudit?.note?.includes('open to admins'), roleAudit?.note ?? 'none');
    check('only admins choose roles', (await statusOf(() => ai.updateSettings(engineer, { roles: [] }))) === 403);
    await ai.updateSettings(admin, { roles: [] });
    check('an empty list opens it to all staff again', (await ai.status(engineer)).enabled === true);

    // Use by person and the conversation log: a conversation of the engineer's, one answer rated not helpful.
    const words = `ai-billing-test ${Date.now()}`;
    const thread = await prisma.aiThread.create({ data: { organizationId: org.id, userId: engineer.id, title: `Cement stock ${words}` } });
    threadId = thread.id;
    await prisma.aiMessage.create({ data: { organizationId: org.id, threadId, role: 'user', text: `How much cement is left? ${words}` } });
    await prisma.aiMessage.create({
      data: { organizationId: org.id, threadId, role: 'assistant', text: '120 bags at the Jajpur store.', model: 'test', costPaise: 250, feedback: -1, toolCalls: [{ name: 'stock_on_hand', input: {} }, { name: 'stock_on_hand', input: {} }] },
    });
    s = await ai.settings(admin);
    const mine = s.byUser.find((u) => u.userId === engineer.id);
    check('use by person counts the question, the rating and the cost', !!mine && mine.questions >= 1 && mine.notHelpful >= 1 && mine.spentInr >= 2.5 && mine.roleKey === engineer.roleKey, JSON.stringify(mine));
    const old = await ai.settings(admin, '2020-01');
    check('another month shows only its own use', old.month === '2020-01' && old.spentThisMonthInr === 0 && old.byUser.length === 0, JSON.stringify({ spent: old.spentThisMonthInr, people: old.byUser.length }));

    const month = today.slice(0, 7);
    const log = await ai.conversations(admin, { q: words, month, page: 1, pageSize: 25 });
    const row = log.items.find((r) => r.id === threadId);
    check('the log finds the conversation by its words', log.total === 1 && !!row && row.fullName === engineer.fullName && row.questions === 1 && row.notHelpful === 1 && row.spentInr === 2.5, JSON.stringify(log));
    check('the log filters by person', (await ai.conversations(admin, { q: words, userId: admin.id, page: 1, pageSize: 25 })).total === 0);
    check('the log filters by month', (await ai.conversations(admin, { q: words, month: '2020-01', page: 1, pageSize: 25 })).total === 0);
    check('only admins read the log', (await statusOf(() => ai.conversations(engineer, { page: 1, pageSize: 25 }))) === 403);
    check('a support session cannot read the log', (await statusOf(() => ai.conversations(support, { page: 1, pageSize: 25 }))) === 403);
    check('a support session cannot open a conversation', (await statusOf(() => ai.conversation(support, threadId!))) === 403);
    const detail = await ai.conversation(admin, threadId);
    check('an admin reads the whole conversation with its cost and tools', detail.messages.length === 2 && detail.messages[1].costInr === 2.5 && detail.messages[1].tools.join() === 'stock_on_hand' && detail.messages[1].feedback === -1, JSON.stringify(detail.messages[1]));
    const readAudit = await prisma.auditLog.count({ where: { organizationId: org.id, entityId: threadId, action: 'AI_CONVERSATION_READ', actorId: admin.id } });
    check('opening a conversation is in the audit log', readAudit === 1, String(readAudit));
    const rows = await ai.exportConversations(admin, { q: words, page: 1, pageSize: 25 });
    check('the export has each question and answer in order', rows.length === 2 && rows[0].role === 'Question' && rows[1].role === 'Answer' && rows[1].rating === 'Not helpful' && rows[1].costInr === 2.5, JSON.stringify(rows));
    const exportAudit = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: 'AI_CONVERSATIONS_EXPORTED', actorId: admin.id, createdAt: { gte: startedAt } } });
    check('exporting is in the audit log', !!exportAudit?.note?.startsWith('2 questions and answers'), exportAudit?.note ?? 'none');
    check('only admins export the log', (await statusOf(() => ai.exportConversations(engineer, { page: 1, pageSize: 25 }))) === 403);
    check('another company cannot open it', (await statusOf(() => ai.conversation({ ...admin, organizationId: '00000000-0000-0000-0000-000000000000' }, threadId!))) !== null);
  } finally {
    if (threadId) await prisma.aiThread.delete({ where: { id: threadId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id, action: { in: ['AI_SETTINGS', 'AI_CONVERSATION_READ', 'AI_CONVERSATIONS_EXPORTED'] }, createdAt: { gte: startedAt } } });
    await set(saved);
    await app.close();
  }

  problems.forEach((p) => console.error(`FAIL ${p}`));
  console.log(`Demo data: ${problems.length} problems`);
  return problems.length;
}

(async () => {
  const failed = await unitTests();
  const problems = process.env.DATABASE_URL ? await demo() : 0;
  process.exit(failed || problems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
