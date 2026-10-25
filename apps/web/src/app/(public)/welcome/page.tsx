'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightOutlined } from '@/components/common/icons';
import { BILLING_GST_PCT } from '@erp/shared';
import { formatINR, RUPEE } from '@/lib/format';
import { useAuthOptions } from '@/lib/queries';
import { usePageTitle } from '@/lib/page-title';
import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome';
import { BILL_EXAMPLES, DAY, DEMO_HOLDS, DEMO_TERMS, FAQ, FLOWS, LOCAL, MODULES, ROLES, TRUST } from './content';

/*
 * The product page, set as type (the taste skill's "Type and nothing else" direction, with the Nirmaan colours and faces):
 * a first screen of words on a field of Nirmaan blue, then the demo company's own day, its modules, a bill you can work out,
 * and the app's real screens arriving large and few. See .claude/skills/design-taste-frontend.
 */

const SECTIONS = [
  { href: '#modules', label: 'What it does' },
  { href: '#money', label: 'Billing and Tally' },
  { href: '#site-app', label: 'Site app' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'Questions' },
];

/** "Create your company" when sign-up is open, and "Try the demo" always. */
function Ctas({ signup, onField }: { signup?: boolean; onField?: boolean }) {
  return (
    <div className="lp-cta">
      {signup ? (
        <Link href="/signup" className={onField ? 'lp-btn lp-btn-ink' : 'lp-btn lp-btn-primary'}>
          Create your company
        </Link>
      ) : null}
      <Link href="/login" className={signup ? `lp-btn ${onField ? 'lp-btn-ghost-dark' : 'lp-btn-ghost'}` : onField ? 'lp-btn lp-btn-ink' : 'lp-btn lp-btn-primary'}>
        Try the demo <ArrowRightOutlined />
      </Link>
    </div>
  );
}

/** A screenshot of the web app, shown as it is: no browser frame, the product's own edge. */
function Shot({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <figure className="lp-shot" data-ui>
      <img src={src} alt={alt} width={1600} height={1000} loading={eager ? 'eager' : 'lazy'} />
    </figure>
  );
}

/** A screenshot of the site app. */
function Phone({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="lp-phone" data-ui>
      <img src={src} alt={alt} width={540} height={1080} loading="lazy" />
    </figure>
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

/** Minutes since midnight from "07:50". */
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** "3 h 40 min" between two moments of the day. */
function gapInWords(from: string, to: string) {
  const m = minutesOf(to) - minutesOf(from);
  const h = Math.floor(m / 60);
  return [h ? `${h} h` : '', m % 60 ? `${m % 60} min` : ''].filter(Boolean).join(' ');
}

/** The value typed into the bill, read from anything a person might type: "6,36,400", "₹ 6.4 lakh", "25 lakh", "1.2 cr". */
function parseRupees(text: string): number | null {
  const t = text.toLowerCase().replace(/[₹,\s]|rs\.?/g, '');
  const m = /^(\d+(?:\.\d+)?)(lakhs?|lacs?|l|crores?|cr)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.startsWith('c') ? 1e7 : m[2] ? 1e5 : 1);
  return Number.isFinite(n) && n > 0 && n < 1e11 ? Math.round(n) : null;
}

/** Rupees with lakh grouping, as typed back into the line: "6,36,400". */
const grouped = (n: number) => new Intl.NumberFormat('en-IN').format(n);

/** The bill you can work out: type a value of work, read the RA bill on the demo highway's terms. */
function BillLine() {
  const [text, setText] = useState(grouped(BILL_EXAMPLES[0].value));
  const value = parseRupees(text);
  const bill = useMemo(() => {
    if (value === null) return null;
    const share = (pct: number) => Math.round((value * pct) / 100);
    const gst = share(DEMO_TERMS.gstPct);
    const lines = DEMO_TERMS.deductions.map((d) => ({ ...d, amount: share(d.pct) }));
    const deducted = lines.reduce((s, l) => s + l.amount, 0);
    return { gst, lines, deducted, net: value + gst - deducted };
  }, [value]);

  return (
    <div className="lp-billline">
      <label htmlFor="lp-bill-value" className="lp-billline-label">
        Value of work measured this bill, in rupees
      </label>
      <div className="lp-billline-field" data-ui>
        <span aria-hidden>₹</span>
        <input id="lp-bill-value" inputMode="decimal" autoComplete="off" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="lp-bill-help" />
      </div>
      <p id="lp-bill-help" className="lp-billline-help">
        Figures, or lakh and crore: 6,36,400 or 6.4 lakh or 1.2 cr.
      </p>
      <div className="lp-bill" data-ui aria-live="polite">
        {bill && value !== null ? (
          <table>
            <caption>RA bill on the demo highway contract</caption>
            <tbody>
              <tr>
                <th scope="row">Work measured</th>
                <td>{formatINR(value)}</td>
              </tr>
              <tr>
                <th scope="row">GST at {DEMO_TERMS.gstPct}%</th>
                <td>+ {formatINR(bill.gst)}</td>
              </tr>
              {bill.lines.map((l) => (
                <tr key={l.label} className="lp-bill-less">
                  <th scope="row">
                    {l.label} at {l.pct}%
                  </th>
                  <td>− {formatINR(l.amount)}</td>
                </tr>
              ))}
              <tr className="lp-bill-net">
                <th scope="row">The client pays</th>
                <td>{formatINR(bill.net)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="lp-bill-empty">Type a value of work, such as 6,36,400 or 25 lakh, to see the bill.</p>
        )}
      </div>
      <div className="lp-billline-examples">
        {BILL_EXAMPLES.map((e) => (
          <button key={e.value} type="button" className="lp-chip" onClick={() => setText(grouped(e.value))}>
            {e.label}, {RUPEE}
            {grouped(e.value)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "The demo already holds …": one sentence whose parts light one at a time. Still, and all lit, for less motion. */
function HoldsSentence() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setLit((i) => (i + 1) % DEMO_HOLDS.length), 2000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <p className="lp-holds">
      <strong>The demo company already holds </strong>
      {DEMO_HOLDS.map((h, i) => (
        <React.Fragment key={h}>
          <span className={i === lit ? 'lp-lit' : undefined}>{h}</span>
          {i < DEMO_HOLDS.length - 1 ? ', ' : '.'}
        </React.Fragment>
      ))}
    </p>
  );
}

export default function WelcomePage() {
  usePageTitle('Construction ERP for Indian contractors');
  const { data: options } = useAuthOptions();
  const [tab, setTab] = useState(MODULES[0].key);
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const signup = !!options?.signup;
  const pricing = options?.pricing ?? null;
  const shown = MODULES.find((m) => m.key === tab) ?? MODULES[0];
  const dayEnd = DAY[DAY.length - 1].time;

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = MODULES.findIndex((m) => m.key === tab);
    const next = MODULES[(i + keys[e.key] + MODULES.length) % MODULES.length];
    setTab(next.key);
    document.getElementById(`lp-tab-${next.key}`)?.focus();
  };

  return (
    <div className="lp lp-welcome" ref={root}>
      <section className="lp-hero" aria-labelledby="lp-title">
        <SiteHeader links={SECTIONS} onField>
          <Link href="/login" className="lp-nav-signin">
            Sign in
          </Link>
        </SiteHeader>
        <div className="lp-wrap lp-hero-inner">
          <h1 id="lp-title" className="lp-hero-title">
            <span className="lp-line">
              <span>From site</span>
            </span>{' '}
            <span className="lp-line">
              <span>to Tally.</span>
            </span>
          </h1>
          <div className="lp-hero-side">
            <p className="lp-lead">
              Nirmaan is the construction ERP for Indian contractors. What your site engineer enters in the evening becomes the measurement, the RA
              bill and the Tally voucher, and nothing counts until it is approved.
            </p>
            <Ctas signup={signup} onField />
          </div>
        </div>
      </section>

      <section className="lp-day" aria-labelledby="lp-day-title">
        <div className="lp-wrap lp-section">
          <h2 id="lp-day-title" className="lp-big rv">
            One day, three sites, no phone calls
          </h2>
          <ol className="lp-stages" data-ui>
            {DAY.map((d, i) => {
              const next = DAY[i + 1]?.time;
              const grow = next ? minutesOf(next) - minutesOf(d.time) : 0;
              return (
                <li key={d.time} className="rv" style={{ flexGrow: grow, transitionDelay: `${i * 80}ms` }}>
                  <div className="lp-stage-bar">
                    <time>{d.time}</time>
                    <span>{next ? `${gapInWords(d.time, next)} to the next` : 'The day is on the books'}</span>
                  </div>
                  <h3>{d.what}</h3>
                  <p className="lp-stage-where">{d.where}</p>
                  <p>{d.detail}</p>
                </li>
              );
            })}
          </ol>
          <div className="lp-day-shot rv">
            <Shot src="/landing/web-dashboard.webp" alt="My work for management: payments due, guarantees expiring, late deliveries, approvals waiting and the watch list" />
            <p className="lp-caption">By {dayEnd} the office sees it: My work for the demo company's management, with everything that waits on them.</p>
          </div>
        </div>
      </section>

      <section id="modules" className="lp-modules" aria-labelledby="lp-modules-title">
        <div className="lp-wrap lp-section lp-modules-inner">
          <div className="lp-modules-index">
            <h2 id="lp-modules-title" className="rv">
              Site, billing, purchase, quality and accounts
            </h2>
            <div className="lp-index" role="tablist" aria-label="Modules" aria-orientation="vertical">
              {MODULES.map((m) => (
                <button
                  key={m.key}
                  id={`lp-tab-${m.key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === m.key}
                  aria-controls={`lp-panel-${m.key}`}
                  tabIndex={tab === m.key ? 0 : -1}
                  className="lp-index-item"
                  onClick={() => setTab(m.key)}
                  onKeyDown={onTabKey}
                >
                  {m.tab}
                </button>
              ))}
            </div>
          </div>
          {MODULES.map((m) => (
            <div key={m.key} id={`lp-panel-${m.key}`} role="tabpanel" aria-labelledby={`lp-tab-${m.key}`} hidden={m !== shown} className="lp-panel">
              <h3>{m.title}</h3>
              <p className="lp-panel-lead">{m.lead}</p>
              <Shot src={m.shot.src} alt={m.shot.alt} />
              <dl className="lp-feats">
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

      <section id="money" className="lp-money" aria-labelledby="lp-money-title">
        <div className="lp-wrap lp-section">
          <div className="lp-money-head rv">
            <h2 id="lp-money-title" className="lp-big">
              Every rupee follows the work
            </h2>
            <p>
              Bills are made from approved measurements, with the contract&apos;s deductions already applied. Try one: this is the running bill on the
              demo highway&apos;s terms.
            </p>
          </div>
          <BillLine />
          <div className="lp-flows">
            {FLOWS.map((f, i) => (
              <div key={f.name} className="lp-flow rv" style={{ transitionDelay: `${i * 80}ms` }}>
                <h3>{f.name}</h3>
                <ol>
                  {f.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  <li className="lp-flow-end">Tally voucher</li>
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-once" aria-labelledby="lp-once-title">
        <div className="lp-wrap lp-once-head">
          <h2 id="lp-once-title" className="rv">
            Typed once
          </h2>
          <p className="rv">
            Entered on site, ended in Tally. WMM at Ch. 14+300 is entered on the phone as 296 cum. The same 296 is in the measurement book, the RA bill, the client&apos;s certificate and the
            voucher in Tally. Nobody keys it in again at the office.
          </p>
        </div>
        <div className="lp-wrap lp-specimens" aria-hidden>
          <span className="lp-specimen">Site</span>
          <span className="lp-specimen">Tally</span>
        </div>
      </section>

      <section className="lp-local" aria-labelledby="lp-local-title">
        <div className="lp-wrap lp-section">
          <h2 id="lp-local-title" className="lp-big rv">
            Made for Indian contracts
          </h2>
          <table className="lp-lineup rv">
            <caption className="lp-sr">What the app keeps for you, and where it shows</caption>
            <tbody>
              {LOCAL.map((l) => (
                <tr key={l.what}>
                  <th scope="row">{l.what}</th>
                  <td>{l.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lp-local-shot rv">
            <Shot src="/landing/web-tally.webp" alt="The Tally export with RA bills, receipts, vendor bills and payments ready to send as vouchers" />
            <p className="lp-caption">The Tally export: each bill, receipt and payment goes once, with projects as cost centres.</p>
          </div>
        </div>
      </section>

      <section id="site-app" className="lp-app" aria-labelledby="lp-app-title">
        <div className="lp-wrap lp-section">
          <div className="lp-app-row">
            <dl className="lp-facts rv">
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
            <div className="rv">
              <h2 id="lp-app-title">Built for sites without signal</h2>
              <p className="lp-app-text">
                The site engineer enters the day where it happens: progress, DPR, attendance, measurements, material, machinery, expenses, inspections and
                tests, with photos from the camera. No network at the cutting or the pump house? Entries wait in the outbox and go when the phone is back
                in range. The project manager approves them from the phone, within their limit, or sends them back with a reason.
              </p>
            </div>
          </div>
          <div className="lp-phones rv">
            <Phone src="/landing/phone-home.webp" alt="The site app's home screen with new entry buttons and today's DPRs" />
            <Phone src="/landing/phone-dpr-offline.webp" alt="The site app's daily report form: project, date, weather, site condition and manpower" />
            <Phone src="/landing/phone-approvals.webp" alt="Approvals on the phone: progress and DPRs waiting for the project manager" />
          </div>
        </div>
      </section>

      <section className="lp-roles" aria-labelledby="lp-roles-title">
        <div className="lp-wrap lp-section lp-roles-inner">
          <h2 id="lp-roles-title" className="rv">
            One record, from the site to the client
          </h2>
          <dl className="lp-role-list rv">
            {ROLES.map((r) => (
              <div key={r.who}>
                <dt>{r.who}</dt>
                <dd>{r.what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="lp-proof" aria-label="The demo company">
        <div className="lp-wrap lp-section">
          <HoldsSentence />
          <div className="lp-trust">
            {TRUST.map((t) => (
              <div key={t.title}>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="lp-pricing" aria-labelledby="lp-pricing-title">
        <div className="lp-wrap lp-section lp-pricing-inner">
          <div>
            <h2 id="lp-pricing-title">One plan, every module</h2>
            <p className="lp-pricing-text">
              Site, billing, purchase, quality, accounts, the site app and the client portal are all included. Start with one project and add the rest when
              you are ready.
            </p>
          </div>
          <div className="lp-price">
            <p className="lp-price-figure" translate="no">
              {pricing ? (
                <>
                  <span className="lp-price-sign">₹</span>
                  {grouped(Number(pricing.price))}
                </>
              ) : (
                'Free'
              )}
            </p>
            <p className="lp-price-period">
              {pricing ? `per ${pricing.unit === 'PROJECT' ? 'active project' : 'user'} a month, plus ${BILLING_GST_PCT}% GST` : 'to start, then one monthly price'}
            </p>
            <ul>
              {pricing ? <li>Free for the first {pricing.trialDays} days, no card needed</li> : <li>Every module and the site app from day one</li>}
              {pricing ? pricing.unit === 'PROJECT' ? <li>Unlimited users on every project</li> : <li>Client and consultant logins are free</li> : null}
              {pricing && pricing.yearChargedMonths < 12 ? <li>Pay a year ahead and get {12 - pricing.yearChargedMonths} months free</li> : null}
              <li>A GST tax invoice for every payment</li>
              <li>If a payment is missed, your data stays and can be read</li>
            </ul>
            <Ctas signup={signup} />
          </div>
        </div>
      </section>

      <section id="faq" className="lp-faq" aria-labelledby="lp-faq-title">
        <div className="lp-wrap lp-section lp-faq-inner">
          <h2 id="lp-faq-title">
            What contractors ask first
          </h2>
          <div className="lp-faq-text">
            {FAQ.map((f) => (
              <p key={f.q}>
                <strong>{f.q}</strong> {f.a}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final" aria-labelledby="lp-final-title">
        <Link href={signup ? '/signup' : '/login'} className="lp-final-link">
          <span className="lp-final-top">
            <span>
              <h2 id="lp-final-title">{signup ? 'Start with one project this week' : 'Open the demo company'}</h2>
              <span className="lp-final-note">
                {signup
                  ? 'Create your company, import a BOQ from Excel and invite the site team. The first DPR can come the same week.'
                  : 'Sign in with an account from the sign-in page: three works, their bills, orders and inspections are already there.'}
              </span>
            </span>
            <svg className="lp-final-arrow" viewBox="0 0 48 48" aria-hidden>
              <path d="M12 36 36 12M16 12h20v20" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
          </span>
          <span className="lp-final-word" aria-hidden>
            {signup ? 'Start' : 'Try it'}
          </span>
          <span className="lp-sr">{signup ? 'Create your company' : 'Try the demo'}</span>
        </Link>
      </section>

      <SiteFooter signup={signup} />
    </div>
  );
}
