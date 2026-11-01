'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import { ArrowUpOutlined, CheckOutlined, CloseOutlined, MailOutlined, RollbackOutlined } from '@/components/common/icons';
import { formatINR } from '@/lib/format';
import { ASK, BILL_LINES, BRIEF, DEMO_TERMS, ENTRY, STAGES, type AskTurn } from './content';

/*
 * The product's own fragments on the product page, built in HTML at true size from the demo company's records: Ask Nirmaan,
 * an approvals row, the four stops of one entry and the documents it writes. Each root carries `data-ui`, so the product's
 * own borders and radii apply inside (the taste skill's "product performs" direction).
 */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A screen of the web app in the visitor's theme, shown as it is: no browser frame. */
export function Screen({ name, alt, eager, className }: { name: string; alt: string; eager?: boolean; className?: string }) {
  return (
    <picture className={className}>
      <source srcSet={`/landing/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />
      <Img src={`/landing/${name}.webp`} alt={alt} width={1600} height={1000} eager={eager} />
    </picture>
  );
}

/** Every picture on the page: a plain img at its own size (the files are already cut to it), lazy unless it is at the top. */
export function Img({ src, alt, width, height, eager }: { src: string; alt: string; width: number; height: number; eager?: boolean }) {
  return <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

/** A link to a record in the demo: sign in, then land on its page. */
const demoHref = (next: string) => `/login?next=${encodeURIComponent(next)}`;

/** Ask Nirmaan with the demo company's questions: pick one and read the answer as the panel gives it, word by word. */
export function AskPanel() {
  const [turn, setTurn] = useState<AskTurn>(ASK[0]);
  // 'done' first, so the page arrives with an answer showing and keeps it without the script.
  const [phase, setPhase] = useState<'reading' | 'writing' | 'done'>('done');
  const [words, setWords] = useState(0);
  const [free, setFree] = useState('');
  const [freeAsked, setFreeAsked] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const total = [turn.lead, ...turn.points].join(' ').split(' ').length;

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const ask = (t: AskTurn) => {
    clear();
    setFreeAsked(null);
    setTurn(t);
    if (reduced()) {
      setPhase('done');
      return;
    }
    setPhase('reading');
    setWords(0);
    const n = [t.lead, ...t.points].join(' ').split(' ').length;
    timers.current.push(
      window.setTimeout(() => {
        setPhase('writing');
        for (let i = 1; i <= n; i++) timers.current.push(window.setTimeout(() => setWords(i), i * 22));
        timers.current.push(window.setTimeout(() => setPhase('done'), n * 22 + 40));
      }, 700),
    );
  };

  const onFree = (e: React.FormEvent) => {
    e.preventDefault();
    const q = free.trim();
    if (!q) return;
    clear();
    setPhase('done');
    setFreeAsked(q);
    setFree('');
  };

  // The answer's words, cut to what has been "written" so far: each part starts where the one before it ended.
  const written = phase === 'writing' ? words : total;
  const parts = [turn.lead, ...turn.points].map((text) => text.split(' '));
  const starts = parts.map((_, i) => parts.slice(0, i).reduce((n, w) => n + w.length, 0));
  const [lead, ...points] = parts.map((w, i) => w.slice(0, Math.max(0, written - starts[i])).join(' '));

  return (
    <div className="ui-ask" data-ui>
      <div className="ui-ask-head">
        <SparkleIcon className="ui-ask-mark" />
        <span className="ui-ask-title">Ask Nirmaan</span>
        <span className="ui-ask-co" translate="no">
          Demo Infra Projects
        </span>
      </div>
      <div className="ui-ask-body" aria-live="polite">
        <p className="ui-ask-q">{freeAsked ?? turn.q}</p>
        {freeAsked ? (
          <div className="ui-ask-a">
            <p>This page answers the four questions below from the demo company’s records. Sign in to the demo to ask it anything about them.</p>
            <Link href="/login" className="ui-ask-src">
              Open the demo
            </Link>
          </div>
        ) : phase === 'reading' ? (
          <p className="ui-ask-reading">
            <span className="ui-ask-dot" aria-hidden />
            {turn.read}…
          </p>
        ) : (
          <div className="ui-ask-a">
            <p className="ui-ask-read">{turn.read}</p>
            <p>{lead}</p>
            <ul>
              {points.map((p, i) => (p ? <li key={i}>{p}</li> : null))}
            </ul>
            {phase === 'done' ? (
              <div className="ui-ask-srcs">
                {turn.sources.map((s) => (
                  <Link key={s.label} href={demoHref(s.next)} className="ui-ask-src">
                    {s.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="ui-ask-try" role="group" aria-label="Questions to ask">
        {ASK.map((t) => (
          <button key={t.key} type="button" className="ui-ask-chip" aria-pressed={!freeAsked && t.key === turn.key} onClick={() => ask(t)}>
            {t.q}
          </button>
        ))}
      </div>
      <form className="ui-ask-input" onSubmit={onFree}>
        <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="Ask about projects, bills, orders, stock…" aria-label="Ask Nirmaan a question" />
        <button type="submit" aria-label="Ask">
          <ArrowUpOutlined />
        </button>
      </form>
      <p className="ui-ask-note">It only reads; it never changes anything. Open the linked records before you act.</p>
    </div>
  );
}

/** The approvals queue's row for the day's WMM entry, in one of its three states. The checked one can be approved. */
export function EntryRow({ state, onApprove }: { state: 'arrives' | 'checked' | 'counts'; onApprove?: () => void }) {
  return (
    <div className={`ui-row ui-row-${state}`} data-ui>
      <div className="ui-row-main">
        <span className="ui-row-title">{ENTRY.title}</span>
        <span className="ui-row-meta">
          {ENTRY.project} · {ENTRY.where} · {ENTRY.by}
        </span>
      </div>
      <span className="ui-row-amount" translate="no">
        {formatINR(ENTRY.value)}
      </span>
      {state === 'arrives' ? (
        <span className="ui-tag ui-tag-pending">
          <i aria-hidden />
          Sent {ENTRY.sent}, from the outbox
        </span>
      ) : state === 'counts' ? (
        <span className="ui-tag ui-tag-success">
          <i aria-hidden />
          Approved by {ENTRY.approver}, {ENTRY.approved}
        </span>
      ) : null}
      {state === 'checked' ? (
        <div className="ui-row-more">
          <span className="ui-row-checks">
            <CheckOutlined /> 4 photos, no flags from the photo check · {ENTRY.crew}
          </span>
          <span className="ui-row-actions">
            <button type="button" className="ui-btn ui-btn-ok" onClick={onApprove}>
              <CheckOutlined /> Approve
            </button>
            <button type="button" className="ui-btn" tabIndex={-1} aria-disabled>
              <RollbackOutlined /> Request changes
            </button>
            <button type="button" className="ui-btn ui-btn-no" tabIndex={-1} aria-disabled>
              <CloseOutlined /> Reject
            </button>
          </span>
        </div>
      ) : null}
      {state === 'counts' ? <span className="ui-row-checks ui-row-after">Now in progress, cost against work done and the next RA bill.</span> : null}
    </div>
  );
}

const share = (value: number, pct: number) => Math.round((value * pct) / 100);

/** The RA bill on the demo highway's terms for a value of work: GST added, the contract's deductions taken. */
export function billOf(value: number) {
  const gst = share(value, DEMO_TERMS.gstPct);
  const lines = DEMO_TERMS.deductions.map((d) => ({ ...d, amount: share(value, d.pct) }));
  const deducted = lines.reduce((s, l) => s + l.amount, 0);
  return { gst, lines, deducted, net: value + gst - deducted };
}

/** The entry at one of its four stops, from the phone's outbox to the Tally voucher. */
export function StageFragment({ stage }: { stage: (typeof STAGES)[number]['key'] }) {
  const value = ENTRY.value;
  const gst = share(value, DEMO_TERMS.gstPct);
  if (stage === 'site')
    return (
      <div className="ui-card ui-phone" data-ui>
        <p className="ui-card-top">
          <span>Outbox</span>
          <span className="ui-tag ui-tag-pending">
            <i aria-hidden />
            No signal, sends itself
          </span>
        </p>
        <p className="ui-card-title">WMM laying</p>
        <dl className="ui-dl">
          <div>
            <dt>Quantity</dt>
            <dd>{ENTRY.qty} m³</dd>
          </div>
          <div>
            <dt>Chainage</dt>
            <dd>14+200 to 14+650</dd>
          </div>
          <div>
            <dt>Labour</dt>
            <dd>18</dd>
          </div>
          <div>
            <dt>Photos</dt>
            <dd>4</dd>
          </div>
        </dl>
        <p className="ui-card-foot">Saved {ENTRY.sent} by {ENTRY.by}</p>
      </div>
    );
  if (stage === 'approve')
    return (
      <div className="ui-card ui-phone" data-ui>
        <p className="ui-card-top">
          <span>Approvals</span>
          <span className="ui-tag ui-tag-success">
            <i aria-hidden />
            Approved
          </span>
        </p>
        <p className="ui-card-title">WMM laying, {ENTRY.qty} Cum</p>
        <dl className="ui-dl">
          <div>
            <dt>Value</dt>
            <dd translate="no">{formatINR(value)}</dd>
          </div>
          <div>
            <dt>By</dt>
            <dd>
              {ENTRY.approver}, {ENTRY.approved}
            </dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd translate="no">RD-2026-01</dd>
          </div>
        </dl>
        <p className="ui-card-foot">Counts in progress and cost from now on</p>
      </div>
    );
  if (stage === 'bill')
    return (
      <div className="ui-card ui-wide" data-ui>
        <p className="ui-card-top">
          <span>RA bill 2 · abstract of cost</span>
          <span className="ui-tag ui-tag-info">
            <i aria-hidden />
            All 5 checks pass
          </span>
        </p>
        <table className="ui-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">This bill</th>
              <th scope="col">Rate</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Wet mix macadam</td>
              <td>{ENTRY.qty} Cum</td>
              <td translate="no">{formatINR(ENTRY.rate)}</td>
              <td translate="no">{formatINR(value)}</td>
            </tr>
          </tbody>
        </table>
        <p className="ui-card-foot">From the measurement book, Ch. 14+200 to 14+650</p>
      </div>
    );
  return (
    <div className="ui-card ui-wide" data-ui>
      <p className="ui-card-top">
        <span>TallyPrime · sales voucher</span>
        <span className="ui-tag ui-tag-success">
          <i aria-hidden />
          Sent once
        </span>
      </p>
      <table className="ui-table">
        <tbody>
          <tr>
            <td>Odisha Works Department</td>
            <td>Dr</td>
            <td translate="no">{formatINR(value + gst)}</td>
          </tr>
          <tr>
            <td>Works contract income</td>
            <td>Cr</td>
            <td translate="no">{formatINR(value)}</td>
          </tr>
          <tr>
            <td>Output CGST 9%</td>
            <td>Cr</td>
            <td translate="no">{formatINR(gst / 2)}</td>
          </tr>
          <tr>
            <td>Output SGST 9%</td>
            <td>Cr</td>
            <td translate="no">{formatINR(gst / 2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="ui-card-foot">Cost centre RD-2026-01 · nobody keys it in again</p>
    </div>
  );
}

/** The morning brief as it arrives by email. */
export function BriefSheet() {
  return (
    <article className="ui-sheet ui-sheet-mail" data-ui>
      <p className="ui-mail-from">
        <MailOutlined /> Nirmaan · to {BRIEF.to}
      </p>
      <h3 className="ui-sheet-title">Your morning, {BRIEF.date}</h3>
      <ul className="ui-mail-lines">
        {BRIEF.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <span className="ui-btn ui-btn-primary">Open My work</span>
      <p className="ui-sheet-small">Written by Ask Nirmaan from your records at 7:00. Also on WhatsApp if your alerts are on.</p>
    </article>
  );
}

/** RA bill 2 on the demo highway: the two layers approved on 30 Oct, priced on the contract's terms. */
export function BillSheet() {
  const lines = BILL_LINES.map((l) => ({ ...l, amount: l.qty * l.rate }));
  const value = lines.reduce((s, l) => s + l.amount, 0);
  const bill = billOf(value);
  return (
    <article className="ui-sheet" data-ui>
      <p className="ui-sheet-small">Odisha Works Department · Roads Division, Khordha</p>
      <h3 className="ui-sheet-title">RA bill 2 · Bhubaneswar - Puri Highway Widening</h3>
      <table className="ui-table ui-table-bill">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
            <th scope="col">Rate</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.item}>
              <td>{l.item}</td>
              <td>
                {l.qty} {l.unit}
              </td>
              <td translate="no">{formatINR(l.rate)}</td>
              <td translate="no">{formatINR(l.amount)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>GST at {DEMO_TERMS.gstPct}%</td>
            <td translate="no">+ {formatINR(bill.gst)}</td>
          </tr>
          {bill.lines.map((l) => (
            <tr key={l.label} className="ui-less">
              <td colSpan={3}>
                {l.label} at {l.pct}%
              </td>
              <td translate="no">− {formatINR(l.amount)}</td>
            </tr>
          ))}
          <tr className="ui-net">
            <td colSpan={3}>Net payable</td>
            <td translate="no">{formatINR(bill.net)}</td>
          </tr>
        </tbody>
      </table>
      <p className="ui-sheet-small">Measured up to 30 Oct 2026 · with the measurement annex</p>
    </article>
  );
}

/** The hindrance notice, drafted from the delay register for the project manager to check and send. */
export function NoticeSheet() {
  return (
    <article className="ui-sheet ui-sheet-letter" data-ui>
      <p className="ui-sheet-small">Draft · numbered from the outward series when sent</p>
      <p className="ui-letter-to">
        The Executive Engineer
        <br />
        RWSS Division, Jajpur
      </p>
      <h3 className="ui-sheet-title">Notice of hindrance under clause 5.1: railway crossing permission for the raw water main</h3>
      <p>
        Work on the raw water main of the Jajpur Rural Piped Water Supply Scheme has been held up since 5 October 2026, as permission to cross the
        railway line is still awaited.
      </p>
      <p>
        We give notice of this hindrance under clause 5.1 of the agreement and will claim an extension of time for the days lost, recorded in our
        hindrance register as RISK-2026-0008.
      </p>
      <p className="ui-sheet-small">Drafted by Ask Nirmaan from the delay register · to be checked and signed by the project manager</p>
    </article>
  );
}
