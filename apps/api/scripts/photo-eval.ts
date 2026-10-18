/**
 * Site photo checks evaluation (AI item 76): sends a folder of labelled site photos to a deployed API and scores what
 * the model flags against the labels. It calls the real model and costs money (roughly ₹1 a photo), so run it by hand:
 *
 *   AI_EVAL_API=https://<api-host>/api PHOTO_EVAL_DIR=./site-photos npx tsx scripts/photo-eval.ts
 *
 * The folder holds the photos (JPEG, PNG or WebP, under 3.7 MB) and `labels.json`:
 *
 *   [{ "file": "slab-01.jpg", "flags": ["NO_HELMET"], "note": "two workers at the back, no helmets" }, …]
 *
 * `flags` lists what a careful safety officer would flag (empty for a clean photo); OTHER_WORK is not scored, as it
 * needs the record's own words. Each photo is uploaded as the building project's site engineer and drafted as a snag
 * (`POST /photo-checks/snag-draft`), which returns the caption, the draft and the flags above the confidence bar;
 * nothing but the upload and its check is saved. It prints each photo's result and, per flag, how many it found
 * (recall) and how many of its flags were right (precision). A label set needs at least 50 photos to say much.
 */

import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { PHOTO_FLAGS, type PhotoFlag, type SnagDraftDto } from '@erp/shared';

const API = (process.env.AI_EVAL_API ?? 'http://localhost:4000/api').replace(/\/$/, '');
const DIR = process.env.PHOTO_EVAL_DIR ?? '';
const AS = process.env.PHOTO_EVAL_USER ?? 'engineer2@demo.com';
const PASSWORD = process.env.PHOTO_EVAL_PASSWORD ?? 'password123';
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const SCORED = PHOTO_FLAGS.filter((f) => f !== 'OTHER_WORK');

type Label = { file: string; flags: PhotoFlag[]; note?: string };

async function main() {
  if (!DIR) throw new Error('Set PHOTO_EVAL_DIR to a folder with the photos and labels.json');
  const labels = JSON.parse(readFileSync(join(DIR, 'labels.json'), 'utf8')) as Label[];
  const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: AS, password: PASSWORD }) });
  if (!login.ok) throw new Error(`login ${AS}: ${login.status}`);
  const token = ((await login.json()) as { accessToken: string }).accessToken;
  const auth = { authorization: `Bearer ${token}` };
  const projects = (await (await fetch(`${API}/projects?pageSize=100`, { headers: auth })).json()) as { items: { id: string; type: string }[] };
  const project = projects.items.find((p) => p.type === 'BUILDING') ?? projects.items[0];
  if (!project) throw new Error(`${AS} is on no project`);

  const score = new Map(SCORED.map((f) => [f, { tp: 0, fp: 0, fn: 0 }]));
  let failed = 0;
  let ms = 0;
  for (const l of labels) {
    const type = TYPES[extname(l.file).toLowerCase()];
    if (!type) {
      console.log(`- ${l.file}: skipped, not a JPEG, PNG or WebP`);
      continue;
    }
    const started = Date.now();
    const form = new FormData();
    form.append('file', new Blob([readFileSync(join(DIR, l.file))], { type }), l.file);
    const up = await fetch(`${API}/uploads`, { method: 'POST', headers: auth, body: form });
    if (!up.ok) {
      failed++;
      console.log(`✗ ${l.file}: upload ${up.status}`);
      continue;
    }
    const { id } = (await up.json()) as { id: string };
    const res = await fetch(`${API}/photo-checks/snag-draft`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ attachmentId: id, projectId: project.id }) });
    ms += Date.now() - started;
    if (!res.ok) {
      failed++;
      console.log(`✗ ${l.file}: ${res.status} ${(await res.text()).slice(0, 160)}`);
      continue;
    }
    const d = (await res.json()) as SnagDraftDto;
    const got = new Set(d.flags.map((f) => f.key).filter((k) => k !== 'OTHER_WORK'));
    const want = new Set(l.flags.filter((k) => k !== 'OTHER_WORK'));
    for (const f of SCORED) {
      const s = score.get(f)!;
      if (got.has(f) && want.has(f)) s.tp++;
      else if (got.has(f)) s.fp++;
      else if (want.has(f)) s.fn++;
    }
    const same = [...got].sort().join() === [...want].sort().join();
    console.log(`${same ? '✓' : '✗'} ${l.file}: ${d.caption ?? '(no caption)'}`);
    console.log(`    flags ${d.flags.map((f) => `${f.key} ${Math.round(f.confidence * 100)}%`).join(', ') || 'none'}; labelled ${l.flags.join(', ') || 'none'}`);
  }

  console.log('\nFlag              found  right');
  for (const [f, s] of score) {
    const recall = s.tp + s.fn ? `${s.tp}/${s.tp + s.fn}` : '-';
    const precision = s.tp + s.fp ? `${s.tp}/${s.tp + s.fp}` : '-';
    console.log(`${f.padEnd(18)}${recall.padStart(5)}  ${precision.padStart(5)}`);
  }
  const done = labels.length - failed;
  console.log(`\n${done} of ${labels.length} photos read, ${failed} failed, ${done ? Math.round(ms / done / 100) / 10 : 0} s a photo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
