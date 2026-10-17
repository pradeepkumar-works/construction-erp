import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, signIn } from './helpers';

type Doc = { id: string; docNo: string; current: { id: string; revision: string; status: string; attachments: { fileName: string }[] } | null; revisionCount: number };
type Transmittal = { id: string; transmittalNo: string; acknowledgedBy: string | null; items: { docNo: string; revision: string; copies: number }[] };
type Letter = { id: string; letterNo: string; direction: string; awaitingReply: boolean; riskNo: string | null; replies: { letterNo: string }[]; inReplyTo: { id: string } | null };

/** A one-page PDF, enough for the upload to accept it as a drawing. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);

/**
 * Document register (v3 item 28): the project manager adds a drawing with its file, issues a new revision (site is told),
 * sends it on a transmittal that is then signed for, and records a letter about a delay and its reply.
 */
test.describe.serial('drawings, transmittals and letters', () => {
  const docNo = `E2E-${Date.now()}`;
  const subject = `E2E hindrance ${Date.now()}`;
  let docId = '';

  test('the project manager adds a drawing and issues a new revision', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.getByRole('link', { name: 'Documents' }).click();
    await page.getByRole('button', { name: 'Add document' }).click();
    const modal = formPanel(page, 'Add drawing or document');
    await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
    await modal.getByLabel('Number').fill(docNo);
    await modal.getByLabel('Title').fill('Retaining wall at Km 14+100');
    await modal.locator('input[type=file]').setInputFiles({ name: `${docNo}-R0.pdf`, mimeType: 'application/pdf', buffer: PDF });
    await expect(modal.getByText(`${docNo}-R0.pdf`)).toBeVisible();
    await modal.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(`${docNo} added to the register`)).toBeVisible();
    await expect(modal).toBeHidden();

    // The drawer opens on the new document; R1 supersedes R0.
    const drawer = page.locator('.ant-drawer-open');
    await expect(drawer.getByText('Retaining wall at Km 14+100')).toBeVisible();
    await drawer.getByRole('button', { name: 'New revision' }).click();
    const rev = page.locator('.ant-modal').filter({ hasText: `New revision of ${docNo}` });
    await expect(rev.getByLabel('Revision')).toHaveValue('R1');
    await rev.getByLabel('What changed').fill('Weep holes at 1.5 m centres');
    await rev.getByRole('button', { name: 'Add revision' }).click();
    await expect(page.getByText(`${docNo} Rev R1 recorded`)).toBeVisible();
    await expect(drawer.getByRole('row', { name: /R0/ }).getByText('Superseded')).toBeVisible();

    const pm = await apiToken('pm@demo.com');
    const found = (await api<{ items: Doc[] }>(pm, `/documents?q=${encodeURIComponent(docNo)}`)).items;
    expect(found).toHaveLength(1);
    docId = found[0].id;
    expect(found[0].revisionCount).toBe(2);
    expect(found[0].current?.revision).toBe('R1');

    // Site is told about the revision issued for construction, and sees only the current one.
    const se = await apiToken('engineer@demo.com');
    const notes = (await api<{ items: { title: string }[] }>(se, '/notifications?pageSize=20')).items;
    expect(notes.some((n) => n.title === `${docNo} Rev R1 issued for construction`)).toBe(true);
    const projectId = (await api<{ projectId: string }>(pm, `/documents/${docId}`)).projectId;
    const site = await api<Doc[]>(se, `/documents/site?projectId=${projectId}`);
    expect(site.find((d) => d.id === docId)?.current?.revision).toBe('R1');
  });

  test('the drawing goes out on a transmittal that is signed for', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto(`/documents?id=${docId}`);
    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByRole('button', { name: 'Send' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'New transmittal' });
    await expect(modal.getByText(`${docNo} Rev R1`)).toBeVisible();
    await modal.getByLabel('To', { exact: true }).fill('Sri Jagannath Constructions');
    await modal.getByLabel('Copies').fill('2');
    await modal.getByRole('button', { name: 'Record transmittal' }).click();
    await expect(page.getByText(/TRN-\d{4}-\d{4} recorded/)).toBeVisible();

    const trn = page.locator('.ant-drawer-open').filter({ hasText: 'Transmittal TRN-' });
    await trn.getByPlaceholder('Received by').fill('Site in-charge, SJC');
    await trn.getByRole('button', { name: 'Acknowledged' }).click();
    await expect(page.getByText(/TRN-\d{4}-\d{4} acknowledged/)).toBeVisible();

    const pm = await apiToken('pm@demo.com');
    const sent = (await api<{ items: Transmittal[] }>(pm, `/transmittals?documentId=${docId}`)).items;
    expect(sent).toHaveLength(1);
    expect(sent[0].acknowledgedBy).toBe('Site in-charge, SJC');
    expect(sent[0].items).toEqual([expect.objectContaining({ docNo, revision: 'R1', copies: 2 })]);
  });

  test('a letter about a delay is answered, and site cannot read letters', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/documents?tab=letters');
    await page.getByRole('button', { name: 'Record letter' }).click();
    const modal = formPanel(page, 'Record a letter');
    await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
    await modal.getByLabel('From').fill('Executive Engineer, R&B Division, Khordha');
    await modal.getByLabel('Subject').fill(subject);
    await chooseOption(modal.getByLabel('About a delay or risk'), 'Encroachment');
    await modal.getByLabel('Reply needed by').click();
    await page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-now-btn').click();
    await modal.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByText(/IN-\d{4}-\d{4} recorded/)).toBeVisible();
    await expect(modal).toBeHidden();

    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByRole('button', { name: 'Reply' }).click();
    const reply = formPanel(page, 'Reply').filter({ hasText: 'In reply to' });
    await expect(reply.getByLabel('Subject')).toHaveValue(`Re: ${subject}`);
    await reply.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByText(/OUT-\d{4}-\d{4} recorded/)).toBeVisible();

    const pm = await apiToken('pm@demo.com');
    const letters = (await api<{ items: Letter[] }>(pm, `/letters?q=${encodeURIComponent(subject)}`)).items;
    const received = letters.find((l) => l.direction === 'IN')!;
    const sent = letters.find((l) => l.direction === 'OUT')!;
    expect(received.awaitingReply).toBe(false);
    expect(received.replies.map((r) => r.letterNo)).toEqual([sent.letterNo]);
    expect(sent.inReplyTo?.id).toBe(received.id);
    expect(sent.riskNo).toBe(received.riskNo);
    expect(received.riskNo).toMatch(/^RISK-/);

    const se = await apiToken('engineer@demo.com');
    await expect(api(se, '/letters')).rejects.toThrow(/403/);
    for (const l of letters) await api(pm, `/letters/${l.id}`, { method: 'DELETE' });
  });
});
