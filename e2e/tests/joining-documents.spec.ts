import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, localToday, signIn } from './helpers';

type Line = { kind: string; label: string; required: boolean; state: string; file: { id: string } | null };
type Checklist = { lines: Line[]; outstanding: string[]; letterProblem: string | null };
type Event = { id: string; type: string; letterNo: string; toCtc: string | null };

async function upload(token: string, name: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new Blob(['%PDF-1.4 joining document'], { type: 'application/pdf' }), name);
  const res = await fetch(`${API_URL}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
  expect(res.ok, `upload ${name}`).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/**
 * Joining documents: a new person's offer and appointment letters wait until every required paper is verified or set
 * aside with a reason; only HR checks a paper; the HR dashboard lists who is outstanding; the Documents tab shows the
 * checklist.
 */
test('the offer and appointment letters wait for the joining documents', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const pm = await apiToken('pm@demo.com');
  const today = localToday();
  const person = await api<{ id: string; fullName: string }>(hr, '/staff/employees', {
    method: 'POST',
    body: { fullName: `Joining Test ${Date.now() % 100000}`, designation: 'Site engineer', joinedOn: today },
  });
  const base = `/staff/employees/${person.id}`;

  // Nothing filed: every required paper is outstanding and both letters are held.
  let list = await api<Checklist>(hr, `${base}/checklist`);
  expect(list.lines.filter((l) => l.required)).toHaveLength(7);
  expect(list.outstanding).toHaveLength(7);
  expect(list.letterProblem).toMatch(/^Verify .* before the offer letter/);
  expect((await api<{ documentsPending: { employeeId: string }[] }>(hr, '/staff/hr-dashboard')).documentsPending.map((d) => d.employeeId)).toContain(person.id);
  const joined = (await api<{ items: Event[] }>(hr, `/staff/events?employeeId=${person.id}&type=JOINED`)).items[0];
  await expect(api(hr, `/staff/events/${joined.id}/letter`)).rejects.toThrow(/400 .*before the appointment letter/);
  await expect(api(hr, `${base}/events`, { method: 'POST', body: { type: 'OFFERED', effectiveDate: today, toCtc: 480000 } })).rejects.toThrow(/400 .*Verify/);

  // A check needs a file, and sending back needs a reason; the project manager checks nothing.
  await expect(api(hr, `${base}/checklist/PAN/check`, { method: 'POST', body: { decision: 'VERIFIED' } })).rejects.toThrow(/Upload it first/);
  await api(hr, `${base}/checklist/PAN`, { method: 'PUT', body: { attachmentId: await upload(hr, 'pan.pdf') } });
  await expect(api(hr, `${base}/checklist/PAN/check`, { method: 'POST', body: { decision: 'REJECTED' } })).rejects.toThrow(/Say what is wrong/);
  await expect(api(pm, `${base}/checklist/PAN/check`, { method: 'POST', body: { decision: 'VERIFIED' } })).rejects.toThrow(/403|404/);

  // Six papers filed and verified, the experience letter set aside for a fresher.
  for (const kind of ['PHOTO', 'AADHAAR', 'SSC', 'INTER', 'DEGREE']) await api(hr, `${base}/checklist/${kind}`, { method: 'PUT', body: { attachmentId: await upload(hr, `${kind}.pdf`) } });
  for (const kind of ['PHOTO', 'AADHAAR', 'PAN', 'SSC', 'INTER', 'DEGREE']) list = await api<Checklist>(hr, `${base}/checklist/${kind}/check`, { method: 'POST', body: { decision: 'VERIFIED' } });
  expect(list.outstanding).toEqual(['Experience or relieving letter']);
  list = await api<Checklist>(hr, `${base}/checklist/EXPERIENCE/check`, { method: 'POST', body: { decision: 'WAIVED', note: 'Fresher, first job' } });
  expect(list.outstanding).toEqual([]);
  expect(list.letterProblem).toBeNull();

  // Now the letters go out: the appointment letter prints, and the offer is recorded with its CTC.
  await api(hr, `/staff/events/${joined.id}/letter`);
  const offer = await api<Event>(hr, `${base}/events`, { method: 'POST', body: { type: 'OFFERED', effectiveDate: today, toCtc: 480000 } });
  expect(offer.letterNo).toMatch(/^HR-\d{4}-\d{4}$/);
  expect(Number(offer.toCtc)).toBe(480000);
  await api(hr, `/staff/events/${offer.id}/letter`);

  // The Documents tab shows the checklist with every required paper done.
  await signIn(page, 'hr@demo.com');
  await page.goto(`/staff?tab=staff&employee=${person.id}`);
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Documents' }).click();
  await expect(drawer.getByText('Joining documents')).toBeVisible();
  await expect(drawer.getByText('Every required paper is verified.')).toBeVisible();
  await expect(drawer.getByText('Fresher, first job')).toBeVisible();
});
