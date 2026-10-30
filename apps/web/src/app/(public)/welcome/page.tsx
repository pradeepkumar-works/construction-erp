'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightOutlined } from '@/components/common/icons';
import { BILLING_GST_PCT } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { formatINR } from '@/lib/format';
import { useAuthOptions } from '@/lib/queries';
import { usePageTitle } from '@/lib/page-title';
import { SiteHeader } from '@/components/site/SiteChrome';
import { AI_RULES, CHECKS, DEMO_ROLES, DEMO_TERMS, FAQ, MODULES, MORE_CHECKS, OUTPUTS, PHOTO_CREDITS, READS, STAGES } from './content';
import { AskPanel, BillSheet, BriefSheet, EntryRow, Img, NoticeSheet, Screen, StageFragment, billOf } from './fragments';
import './welcome.css';

/*
 * The product page, set by the taste skill's "product performs" direction (.claude/skills/design-taste-frontend) with the
 * Nirmaan colours and faces: the product does its job in front of the visitor. Ask Nirmaan answers from the demo company's
 * records in the first screen, an entry is approved on the page, the watch list's checks switch on to show what they found,
 * one entry is dragged from site to Tally, and the app's real screens follow in the visitor's own theme.
 */

const SECTIONS = [
  { href: '#watch', label: 'Watch list' },
  { href: '#flow', label: 'Site to Tally' },
  { href: '#modules', label: 'Product' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'Questions' },
];

/** "Create your company" when sign-up is open, and "Try the demo" always. */
function Ctas({ signup }: { signup?: boolean }) {
  return (
    <div className="lp-cta">
      <Link href="/login" className="lp-btn lp-btn-primary">
        Try the demo <ArrowRightOutlined />
      </Link>
      {signup ? (
        <Link href="/signup" className="lp-btn lp-btn-ghost-dark">
          Create your company
        </Link>
      ) : null}
    </div>
  );
}

/** Each section's parts rise once as it scrolls into view; nothing is hidden without the script or with less motion. */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('.rv'));
    el.classList.add('lp-js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    items.forEach((i) => io.observe(i));
    // A jump past a section (a link to #faq, the End key) never makes its parts intersect: show whatever is above the fold.
    const passed = () => {
      for (const i of items) if (!i.classList.contains('in') && i.getBoundingClientRect().top < window.innerHeight) i.classList.add('in');
    };
    window.addEventListener('scroll', passed, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', passed);
    };
  }, [root]);
}

/** The value typed into the bill, read from anything a person might type: "6,36,400", "₹ 6.4 lakh", "25 lakh", "1.2 cr". */
function parseRupees(text: string): number | null {
  const t = text.toLowerCase().replace(/[₹,\s]|rs\.?/g, '');
  const m = /^(\d+(?:\.\d+)?)(lakhs?|lacs?|l|crores?|cr)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.startsWith('c') ? 1e7 : m[2] ? 1e5 : 1);
  return Number.isFinite(n) && n > 0 && n < 1e11 ? Math.round(n) : null;
}

/** Rupees with lakh grouping, as typed back into the field: "6,36,400". */
const grouped = (n: number) => new Intl.NumberFormat('en-IN').format(n);

/** The bill slider runs from ₹1 lakh to ₹5 crore on a log scale, in steps of a thousand rupees. */
const LOW = 5;
const HIGH = Math.log10(5e7);
const toValue = (step: number) => Math.round(10 ** (LOW + (step / 1000) * (HIGH - LOW)) / 1000) * 1000;
const toStep = (value: number) => Math.round(((Math.log10(Math.min(Math.max(value, 1e5), 5e7)) - LOW) / (HIGH - LOW)) * 1000);

/** The approvals row in its three states; the middle one is approved on the page and shows the third. */
function ThreeStates() {
  const [approved, setApproved] = useState(false);
  return (
    <section className="lw-states" aria-labelledby="lw-states-title">
      <div className="lp-wrap lp-section">
        <h2 id="lw-states-title" className="lw-h2 rv">
          Nothing counts until it is approved
        </h2>
        <div className="lw-states-list">
          <div className="lw-state rv">
            <p className="lw-state-word">Arrives</p>
            <EntryRow state="arrives" />
          </div>
          <div className="lw-state rv">
            <p className="lw-state-word">{approved ? 'Approved' : 'Checked'}</p>
            <EntryRow state={approved ? 'counts' : 'checked'} onApprove={() => setApproved(true)} />
            {approved ? (
              <button type="button" className="lw-reset" onClick={() => setApproved(false)}>
                Put it back in the queue
              </button>
            ) : null}
          </div>
          <div className="lw-state rv">
            <p className="lw-state-word">Counts</p>
            <EntryRow state="counts" />
          </div>
        </div>
        <p className="lw-states-text rv">
          The site engineer sends the day from the phone, signal or not. The project manager sees the photos, the crew and the checks, and approves it within
          their limit. Only then does it count in progress, cost and the next bill.
        </p>
      </div>
    </section>
  );
}

/** The watch list's checks as sentences with switches: on, a band shows what the check found in the demo company. */
function Checks() {
  const [on, setOn] = useState<Record<string, boolean>>({ material: true, bank: true });
  return (
    <section id="watch" className="lw-checks" aria-labelledby="lw-checks-title">
      <div className="lp-wrap lw-checks-head">
        <h2 id="lw-checks-title" className="lw-h2 rv">
          It watches every site, every morning
        </h2>
        <p className="lw-text rv">
          Each morning the watch list reads the work, stock, fuel, labour, bills and payments, and says what needs someone, what it costs and the working
          behind it. Switch a check on to see what it found in the demo company this month.
        </p>
      </div>
      <ul className="lw-bands">
        {CHECKS.map((c) => {
          const lit = !!on[c.key];
          return (
            <li key={c.key} className={`lw-band lw-band-${c.tone}${lit ? ' lw-band-on' : ''}`}>
              <div className="lp-wrap lw-band-inner">
                <div className="lw-band-words">
                  <p className="lw-band-says" id={`lw-check-${c.key}`}>
                    {c.says}
                  </p>
                  <p className="lw-band-found" hidden={!lit}>
                    {c.found}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={lit}
                  aria-labelledby={`lw-check-${c.key}`}
                  className="lw-switch"
                  data-ui
                  onClick={() => setOn((o) => ({ ...o, [c.key]: !o[c.key] }))}
                >
                  <span className="lw-switch-knob" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="lp-wrap lw-checks-foot">
        <p className="lw-text rv">{MORE_CHECKS}</p>
        <div className="lw-checks-shot rv">
          <Screen name="web-watch" alt="The watch list: early warnings with what to do, what it costs and the working behind each one" />
        </div>
      </div>
    </section>
  );
}

/** One entry dragged from site to Tally: the clause and the product's fragment change together. */
function Flow() {
  const [i, setI] = useState(0);
  const stage = STAGES[i];
  return (
    <section id="flow" className="lw-flow" aria-labelledby="lw-flow-title">
      <div className="lw-flow-split">
        <div className="lw-flow-words">
          <div className="lp-wrap lw-flow-wrap">
            <h2 id="lw-flow-title" className="lw-flow-clause" key={stage.key}>
              {stage.clause}
            </h2>
            <p className="lw-flow-text">
              One entry of 296 Cum on the Bhubaneswar - Puri highway. Typed once on site, it is the same 296 in the approval, the RA bill and the voucher in
              Tally. Nobody keys it in again at the office.
            </p>
          </div>
        </div>
        <div className="lw-flow-stage">
          <div className="lw-flow-frag" key={stage.key}>
            <StageFragment stage={stage.key} />
          </div>
        </div>
      </div>
      <div className="lp-wrap lw-flow-control">
        <label htmlFor="lw-flow-range" className="lp-sr">
          Stage of the entry
        </label>
        <input
          id="lw-flow-range"
          type="range"
          min={0}
          max={STAGES.length - 1}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-valuetext={`${stage.name}: ${stage.clause}`}
          className="lw-range"
        />
        <ol className="lw-flow-names">
          {STAGES.map((s, n) => (
            <li key={s.key}>
              <button type="button" aria-current={n === i ? 'step' : undefined} onClick={() => setI(n)}>
                {s.name}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The documents it writes: pick a name, read the sheet. */
function Writes() {
  const [k, setK] = useState<(typeof OUTPUTS)[number]['key']>('brief');
  return (
    <section className="lw-writes" aria-labelledby="lw-writes-title">
      <div className="lp-wrap lp-section lw-writes-inner">
        <div className="lw-writes-index">
          <h2 id="lw-writes-title" className="lw-h2 rv">
            It writes the paperwork
          </h2>
          <p className="lw-text rv">From the same records: the brief that reaches management at seven, the running bill, and the letter the contract asks for.</p>
          <div className="lw-names rv" role="group" aria-label="Documents">
            {OUTPUTS.map((o) => (
              <button key={o.key} type="button" className="lw-name" aria-pressed={o.key === k} onClick={() => setK(o.key)}>
                {o.name}
              </button>
            ))}
          </div>
        </div>
        <div className="lw-writes-stage rv">
          <div className="lw-sheet-wrap" key={k}>
            {k === 'brief' ? <BriefSheet /> : k === 'bill' ? <BillSheet /> : <NoticeSheet />}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "What did site measure this month?": the visitor's value of work, and what the client pays on the demo highway's terms. */
function BillFigure() {
  const [text, setText] = useState(grouped(2500000));
  const value = parseRupees(text);
  const bill = value === null ? null : billOf(value);
  return (
    <section id="money" className="lw-figure" aria-labelledby="lw-figure-title">
      <div className="lp-wrap lw-figure-inner">
        <div className="lw-figure-top">
          <h2 id="lw-figure-title" className="lw-h2 rv">
            What did site measure this month?
          </h2>
          <div className="lw-figure-control rv" data-ui>
            <label htmlFor="lw-bill-value">Value of work measured, in rupees</label>
            <div className="lw-figure-field">
              <span aria-hidden>₹</span>
              <input
                id="lw-bill-value"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-describedby="lw-bill-help"
              />
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              value={toStep(value ?? 1e5)}
              onChange={(e) => setText(grouped(toValue(Number(e.target.value))))}
              aria-label="Value of work measured"
              aria-valuetext={value === null ? 'None' : formatINR(value)}
              className="lw-range lw-range-light"
            />
            <p id="lw-bill-help" className="lw-figure-help">
              Figures, or lakh and crore: 6,36,400 or 6.4 lakh or 1.2 cr.
            </p>
          </div>
        </div>
        <div className="lw-figure-bottom" aria-live="polite">
          <p className="lw-figure-number" translate="no">
            {bill ? formatINR(bill.net) : '—'}
            <span className="lw-figure-unit">the client pays</span>
          </p>
          <p className="lw-figure-how">
            {bill
              ? `The value plus ${DEMO_TERMS.gstPct}% GST, less ${DEMO_TERMS.deductions.map((d) => `${d.pct}% ${d.short}`).join(', ')}: the demo highway contract’s own terms, as the RA bill applies them.`
              : 'Type a value of work, such as 6,36,400 or 25 lakh, to see the bill.'}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The modules: the names as an index; the chosen one's screen crossfades in, and the screens turn by themselves until the visitor picks one. */
function Modules() {
  const [tab, setTab] = useState(MODULES[0].key);
  const [held, setHeld] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shown = MODULES.find((m) => m.key === tab) ?? MODULES[0];

  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    const io = new IntersectionObserver(([e]) => (seen = e.isIntersecting), { threshold: 0.4 });
    if (box.current) io.observe(box.current);
    const t = window.setInterval(() => {
      if (!seen || document.hidden) return;
      setTab((k) => MODULES[(MODULES.findIndex((m) => m.key === k) + 1) % MODULES.length].key);
    }, 6000);
    return () => {
      window.clearInterval(t);
      io.disconnect();
    };
  }, [held]);

  const pick = (key: string) => {
    setHeld(true);
    setTab(key);
  };
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = MODULES.findIndex((m) => m.key === tab);
    const next = MODULES[(i + keys[e.key] + MODULES.length) % MODULES.length];
    pick(next.key);
    document.getElementById(`lw-tab-${next.key}`)?.focus();
  };

  return (
    <section id="modules" className="lw-modules" aria-labelledby="lw-modules-title">
      <div className="lp-wrap lp-section" ref={box}>
        <div className="lw-modules-head">
          <h2 id="lw-modules-title" className="lw-h2 rv">
            Every department on one record
          </h2>
          <div className="lw-index rv" role="tablist" aria-label="Modules">
            {MODULES.map((m) => (
              <button
                key={m.key}
                id={`lw-tab-${m.key}`}
                type="button"
                role="tab"
                aria-selected={tab === m.key}
                aria-controls={`lw-panel-${m.key}`}
                tabIndex={tab === m.key ? 0 : -1}
                className="lw-index-item"
                onClick={() => pick(m.key)}
                onKeyDown={onTabKey}
              >
                {m.tab}
              </button>
            ))}
          </div>
        </div>
        <div className="lw-screens rv" aria-hidden>
          {MODULES.map((m) => (
            <Screen key={m.key} name={m.shot.src} alt="" className={m === shown ? 'lw-screen lw-screen-on' : 'lw-screen'} />
          ))}
        </div>
        {MODULES.map((m) => (
          <div key={m.key} id={`lw-panel-${m.key}`} role="tabpanel" aria-labelledby={`lw-tab-${m.key}`} hidden={m !== shown} className="lw-panel">
            <p className="lp-sr">{m.shot.alt}</p>
            <div className="lw-panel-head">
              <h3>{m.title}</h3>
              <p>{m.lead}</p>
            </div>
            <dl className="lw-feats">
              {m.features.map((f) => (
                <div key={f.title}>
                  <dt>{f.title}</dt>
                  <dd>{f.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function WelcomePage() {
  usePageTitle('Construction ERP with AI for Indian contractors');
  const { data: options } = useAuthOptions();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const signup = !!options?.signup;
  const pricing = options?.pricing ?? null;
  const year = new Date().getFullYear();

  return (
    <div className="lp lp-welcome" ref={root}>
      <section className="lw-hero" aria-labelledby="lw-title">
        <SiteHeader links={SECTIONS} onField>
          <Link href="/login" className="lp-nav-signin">
            Sign in
          </Link>
        </SiteHeader>
        <div className="lp-wrap lw-hero-inner">
          <div className="lw-hero-words">
            <h1 id="lw-title" className="lw-hero-title">
              <span className="lp-line">
                <span>The ERP that</span>
              </span>{' '}
              <span className="lp-line">
                <span>reads your sites</span>
              </span>
            </h1>
            <p className="lw-lead">
              Nirmaan is the construction ERP for Indian contractors. Site entries become RA bills and Tally vouchers, and every morning it reads the records
              and tells each person what needs them.
            </p>
            <Ctas signup={signup} />
          </div>
          <div className="lw-hero-ask">
            <AskPanel />
          </div>
        </div>
      </section>

      <ThreeStates />
      <Checks />
      <Flow />
      <Writes />
      <BillFigure />
      <Modules />

      <section className="lw-reads" aria-labelledby="lw-reads-title">
        <div className="lp-wrap lp-section lw-reads-inner">
          <figure className="lw-reads-photo rv">
            <Img src="/landing/photo-paver.webp" alt="A slipform paver parked on a city road under construction, Bangalore" width={1600} height={916} />
            <figcaption>A paver on a road being rebuilt in Bangalore.</figcaption>
          </figure>
          <div className="lw-reads-words">
            <h2 id="lw-reads-title" className="lw-h2 rv">
              It reads what the site already makes
            </h2>
            <dl className="lw-reads-list rv">
              {READS.map((r) => (
                <div key={r.from}>
                  <dt>{r.from}</dt>
                  <dd>{r.to}</dd>
                </div>
              ))}
            </dl>
            <p className="lw-text rv">
              Devices on site connect through the Nirmaan Connector, a small program on a site computer that only calls out. No port is opened on the site.
            </p>
          </div>
        </div>
      </section>

      <section id="site-app" className="lw-app" aria-labelledby="lw-app-title">
        <div className="lp-wrap lp-section lw-app-inner">
          <div className="lw-app-words">
            <h2 id="lw-app-title" className="lw-h2 rv">
              Built for sites without signal
            </h2>
            <p className="lw-text rv">
              The site engineer enters the day where it happens: progress, DPR, attendance, measurements, material, machinery and tests, with photos from the
              camera, in English or Hindi. With no network at the cutting or the pump house, entries wait in the outbox and go when the phone is back in range.
            </p>
            <dl className="lw-facts rv">
              <div>
                <dt>Without signal</dt>
                <dd>Entries wait on the phone</dd>
              </div>
              <div>
                <dt>Languages</dt>
                <dd>English and Hindi</dd>
              </div>
              <div>
                <dt>Approvals</dt>
                <dd>On the phone or WhatsApp</dd>
              </div>
            </dl>
          </div>
          <div className="lw-phones rv">
            <figure className="lw-phone" data-ui>
              <Img src="/landing/phone-home.webp" alt="The site app's home screen with new entry buttons and today's DPRs" width={540} height={1080} />
            </figure>
            <figure className="lw-phone" data-ui>
              <Img src="/landing/phone-dpr-offline.webp" alt="The site app's daily report form: project, date, weather, site condition and manpower" width={540} height={1080} />
            </figure>
            <figure className="lw-phone" data-ui>
              <Img src="/landing/phone-approvals.webp" alt="Approvals on the phone: progress and DPRs waiting for the project manager" width={540} height={1080} />
            </figure>
          </div>
        </div>
        <figure className="lw-app-photo">
          <Img src="/landing/photo-mountain-road.webp" alt="A new road cut along a forested hillside above a river valley, with switchbacks below" width={1600} height={1067} />
          <figcaption className="lp-wrap">New roads being cut above Kamand, Himachal Pradesh.</figcaption>
        </figure>
      </section>

      <section className="lw-trust" aria-labelledby="lw-trust-title">
        <div className="lp-wrap lp-section lw-trust-inner">
          <h2 id="lw-trust-title" className="lw-h2">
            AI that only reads what you may see
          </h2>
          <dl className="lw-trust-list">
            {AI_RULES.map((r) => (
              <div key={r.title}>
                <dt>{r.title}</dt>
                <dd>{r.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="pricing" className="lw-pricing" aria-labelledby="lw-pricing-title">
        <div className="lp-wrap lp-section lw-pricing-inner">
          <div>
            <h2 id="lw-pricing-title" className="lw-h2">
              One plan, every module
            </h2>
            <p className="lw-text">
              Site, billing, purchase, quality, accounts, Ask Nirmaan, the site app and the client portal are all in it. Start with one project and add the
              rest when you are ready.
            </p>
          </div>
          <div className="lw-price">
            <p className="lw-price-figure" translate="no">
              {pricing ? (
                <>
                  <span className="lw-price-sign">₹</span>
                  {grouped(Number(pricing.price))}
                </>
              ) : (
                'Free'
              )}
            </p>
            <p className="lw-price-period">
              {pricing ? `per ${pricing.unit === 'PROJECT' ? 'active project' : 'user'} a month, plus ${BILLING_GST_PCT}% GST` : 'to start, then one monthly price'}
            </p>
            <ul>
              {pricing ? <li>Free for the first {pricing.trialDays} days, no card needed</li> : <li>Every module and the site app from day one</li>}
              {pricing ? pricing.unit === 'PROJECT' ? <li>Unlimited users on every project</li> : <li>Client and consultant logins are free</li> : null}
              {pricing && pricing.yearChargedMonths < 12 ? <li>Pay a year ahead and get {12 - pricing.yearChargedMonths} months free</li> : null}
              <li>A GST tax invoice for every payment</li>
              <li>If a payment is missed, your data stays and can be read</li>
            </ul>
            <Link href={signup ? '/signup' : '/login'} className="lp-btn lp-btn-primary">
              {signup ? 'Create your company' : 'Try the demo'} <ArrowRightOutlined />
            </Link>
          </div>
        </div>
      </section>

      <section id="faq" className="lw-faq" aria-labelledby="lw-faq-title">
        <div className="lp-wrap lp-section lw-faq-inner">
          <h2 id="lw-faq-title" className="lw-h2">
            What contractors ask first
          </h2>
          <div className="lw-faq-list">
            {FAQ.map((f, i) => (
              <details key={f.q} name="lw-faq" className="lw-faq-item" open={i === 0}>
                <summary>
                  <span>{f.q}</span>
                  <i aria-hidden />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lw-final" aria-labelledby="lw-final-title">
        <div className="lp-wrap lw-final-inner">
          <form action="/login" method="get" className="lw-final-form">
            <h2 id="lw-final-title" className="lw-final-sentence">
              <span>See it as </span>
              <select name="demo" aria-label="Demo account" defaultValue="pm" className="lw-final-select">
                {DEMO_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>{' '}
              <button type="submit" className="lw-final-go" aria-label="Open the demo today">
                today
              </button>
            </h2>
            <p className="lw-final-note">
              Opens the demo company ready to sign in as that person. Its projects, bills, orders, tests and watch list are already there.
              {signup ? (
                <>
                  {' '}
                  Or <Link href="/signup">create your company</Link> and import a BOQ from Excel.
                </>
              ) : null}
            </p>
          </form>
        </div>
      </section>

      <footer className="lw-foot">
        <div className="lp-wrap">
          <div className="lw-foot-line">
            <p>{BRAND.name}, construction ERP for Indian contractors</p>
            <nav aria-label="Get started">
              <Link href="/login">Try the demo</Link>
              {signup ? <Link href="/signup">Create your company</Link> : null}
              <Link href="/login">Sign in</Link>
            </nav>
            <p>
              © {year} {BRAND.name} · <Link href="/privacy">Privacy</Link>
            </p>
          </div>
          <p className="lw-credits">
            Pictures:{' '}
            {PHOTO_CREDITS.map((c, i) => (
              <React.Fragment key={c.page}>
                <a href={c.page}>“{c.title}”</a> by {c.by}, <a href={c.licenceUrl}>{c.licence}</a>, via Wikimedia Commons
                {i < PHOTO_CREDITS.length - 1 ? '; ' : '.'}
              </React.Fragment>
            ))}{' '}
            Screens and figures are the demo company’s.
          </p>
        </div>
      </footer>
    </div>
  );
}
