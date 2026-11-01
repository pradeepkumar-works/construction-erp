import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, signIn } from './helpers';

type Letter = {
  id: string;
  letterNo: string | null;
  direction: string;
  status: string;
  awaitingReply: boolean;
  riskNo: string | null;
  signatoryName: string | null;
  replies: { letterNo: string | null }[];
  inReplyTo: { id: string } | null;
};
type Person = { id: string; fullName: string; canSign: boolean; onProject: boolean };

/**
 * Correspondence: the document controller records a letter about a delay, numbered from the road project's
 * series; the reply is a notice, so it waits for the project manager's signature and gets its number only when he or she
 * approves it; site engineers do not keep letters.
 */
test('a letter received is numbered, answered with a notice the project manager signs, and site cannot read letters', async ({ page, browser }) => {
  const subject = `E2E hindrance ${Date.now()}`;
  await signIn(page, 'docs@demo.com');
  await page.goto('/correspondence');
  await expect(page.getByRole('heading', { name: 'Inward register', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Record inward letter' }).first().click();
  const modal = formPanel(page, 'Record inward letter');
  await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
  await modal.getByLabel('From').fill('The Executive Engineer, R&B Division, Khordha');
  await modal.getByLabel('Subject').fill(subject);
  await chooseOption(modal.getByLabel('About a delay or risk'), 'Encroachment');
  await modal.getByLabel('Reply needed by').click();
  await page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-now-btn').click();
  await modal.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByText(/RD01\/IN\/\d\d-\d\d\/\d{3} recorded/)).toBeVisible();
  await expect(modal).toBeHidden();

  // The reply, from the letter's drawer: a notice, so a draft for the signatory.
  const drawer = page.locator('.ant-drawer-open').filter({ hasText: subject });
  await drawer.getByRole('button', { name: 'Reply' }).click();
  const reply = formPanel(page, 'Reply');
  await expect(reply.getByLabel('Subject')).toHaveValue(`Re: ${subject}`);
  await chooseOption(reply.getByLabel('Category'), 'Notice');
  await reply.getByLabel('Letter text').fill('Under the agreement we notify you that the encroachment at km 18 is holding up the work.');
  await reply.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft letter saved')).toBeVisible();

  const docs = await apiToken('docs@demo.com');
  const found = (await api<{ items: Letter[] }>(docs, `/letters?q=${encodeURIComponent(subject)}&pageSize=10`)).items;
  const received = found.find((l) => l.direction === 'IN')!;
  const draft = (await api<{ items: Letter[] }>(docs, `/letters?direction=OUT&q=${encodeURIComponent(subject)}&pageSize=10`)).items[0];
  expect(received.letterNo).toMatch(/^RD01\/IN\/\d\d-\d\d\/\d{3}$/);
  expect(draft).toMatchObject({ status: 'DRAFT', letterNo: null, riskNo: received.riskNo });
  expect(draft.inReplyTo?.id).toBe(received.id);
  // A notice is not issued without its signatory.
  await expect(api(docs, `/letters/${draft.id}/issue`, { method: 'POST' })).rejects.toThrow(/400/);

  const people = await api<Person[]>(docs, `/letters/people?projectId=${(await api<{ projectId: string }>(docs, `/letters/${draft.id}`)).projectId}`);
  const signer = people.find((p) => p.canSign && p.onProject)!;
  await api(docs, `/letters/${draft.id}/send-for-approval`, { method: 'POST', body: { signatoryId: signer.id } });

  const pm = await browser.newPage();
  await signIn(pm, 'pm@demo.com');
  await pm.goto(`/correspondence/${draft.id}`);
  await pm.getByRole('button', { name: 'Sign and number' }).click();
  await expect(pm.getByText(/Signed: RD01\/OUT\/\d\d-\d\d\/\d{3}/)).toBeVisible();

  const answered = await api<Letter>(docs, `/letters/${received.id}`);
  const sent = await api<Letter>(docs, `/letters/${draft.id}`);
  expect(sent.status).toBe('ISSUED');
  expect(answered.awaitingReply).toBe(false);
  expect(answered.replies.map((r) => r.letterNo)).toEqual([sent.letterNo]);

  const se = await apiToken('engineer@demo.com');
  await expect(api(se, '/letters')).rejects.toThrow(/403/);
  for (const l of [sent, answered]) await api(docs, `/letters/${l.id}`, { method: 'DELETE' });
});
