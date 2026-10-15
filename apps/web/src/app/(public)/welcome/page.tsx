'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightOutlined } from '@ant-design/icons';
import { BILLING_GST_PCT } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { formatINR } from '@/lib/format';
import { useAuthOptions } from '@/lib/queries';
import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome';
import { DAY, DEMO_PROJECTS, FAQ, FLOWS, LOCAL, MODULES, ROLES, TRUST } from './content';

const SECTIONS = [
  { href: '#modules', label: 'What it does' },
  { href: '#money', label: 'Billing and Tally' },
  { href: '#site-app', label: 'Site app' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'Questions' },
];

/** "Create your company" when sign-up is open, and "Try the demo" always. */
function Ctas({ signup, onDark }: { signup?: boolean; onDark?: boolean }) {
  return (
    <div className="lp-cta">
      {signup ? (
        <Link href="/signup" className="lp-btn lp-btn-primary">
          Create your company
        </Link>
      ) : null}
      <Link href="/login" className={signup ? `lp-btn ${onDark ? 'lp-btn-ghost-dark' : 'lp-btn-ghost'}` : 'lp-btn lp-btn-primary'}>
        Try the demo <ArrowRightOutlined />
      </Link>
    </div>
  );
}

/** A screenshot of the web app in a plain browser frame. */
function Shot({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <figure className="lp-frame">
      <div className="lp-frame-bar" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <img src={src} alt={alt} width={1600} height={1000} loading={eager ? 'eager' : 'lazy'} />
    </figure>
  );
}

/** A screenshot of the site app in a plain phone frame. */
function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <figure className={className ? `lp-phone ${className}` : 'lp-phone'}>
      <img src={src} alt={alt} width={540} height={1080} loading="lazy" />
    </figure>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="lp-eyebrow">{children}</p>;
}

/** Sections fade up once as they scroll into view; nothing moves when the visitor prefers less motion (see the CSS). */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('.rv'));
    if (typeof IntersectionObserver === 'undefined') return;
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
    return () => io.disconnect();
  }, [root]);
}

export default function WelcomePage() {
  const { data: options } = useAuthOptions();
  const [tab, setTab] = useState(MODULES[0].key);
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const signup = !!options?.signup;
  const pricing = options?.pricing ?? null;

  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = MODULES.findIndex((m) => m.key === tab);
    const next = MODULES[(i + (e.key === 'ArrowRight' ? 1 : MODULES.length - 1)) % MODULES.length];
    setTab(next.key);
    document.getElementById(`lp-tab-${next.key}`)?.focus();
  };

  return (
    <div className="lp" ref={root}>
      <SiteHeader links={SECTIONS}>
        <Link href="/login" className="lp-nav-signin">
          Sign in
        </Link>
        <Link href={signup ? '/signup' : '/login'} className="lp-btn lp-btn-primary lp-btn-sm">
          {signup ? 'Start free' : 'Try the demo'}
        </Link>
      </SiteHeader>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <div className="lp-hero-text">
            <Eyebrow>Construction ERP for Indian contractors</Eyebrow>
            <h1>
              <span>From site to Tally,</span> <span>in one place.</span>
            </h1>
            <span className="lp-datum" aria-hidden />
          </div>
          <div className="lp-hero-side">
            <p className="lp-lead">
              What your site engineer enters in the evening becomes the measurement, the running bill and the Tally voucher. Nobody types it twice, and
              nothing counts until it is approved.
            </p>
            <Ctas signup={signup} onDark />
            <p className="lp-hero-note">The demo has a highway, a hospital and a water scheme in Odisha already in it.</p>
          </div>
        </div>
        <div className="lp-wrap lp-hero-stage">
          <Shot src="/landing/web-dashboard.webp" alt="The company dashboard: active projects, contract value, pending approvals, delayed activities and receivables" eager />
          <Phone src="/landing/phone-home.webp" alt="The site app's home screen with new entry buttons and today's DPRs" className="lp-hero-phone" />
        </div>
      </section>

      <section className="lp-day" aria-labelledby="lp-day-title">
        <div className="lp-wrap lp-section">
          <div className="lp-head rv">
            <Eyebrow>A day in the demo company</Eyebrow>
            <h2 id="lp-day-title">One day, three sites, no phone calls</h2>
          </div>
          <ol className="lp-day-list">
            {DAY.map((d, i) => (
              <li key={d.time} className="rv" style={{ transitionDelay: `${i * 90}ms` }}>
                <time>{d.time}</time>
                <h3>{d.what}</h3>
                <p className="lp-day-where">{d.where}</p>
                <p>{d.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="modules" className="lp-modules">
        <div className="lp-wrap lp-section">
          <div className="lp-head rv">
            <Eyebrow>What it does</Eyebrow>
            <h2>Site, billing, purchase, quality and accounts</h2>
            <div className="lp-tabs" role="tablist" aria-label="Modules" onKeyDown={onTabKey}>
              {MODULES.map((m) => (
                <button
                  key={m.key}
                  id={`lp-tab-${m.key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === m.key}
                  aria-controls={`lp-panel-${m.key}`}
                  tabIndex={tab === m.key ? 0 : -1}
                  className="lp-tab"
                  onClick={() => setTab(m.key)}
                >
                  {m.tab}
                </button>
              ))}
            </div>
          </div>
          {MODULES.map((m) => (
            <div key={m.key} id={`lp-panel-${m.key}`} role="tabpanel" aria-labelledby={`lp-tab-${m.key}`} hidden={tab !== m.key} className="lp-panel">
              <div className="lp-panel-text">
                <h3>{m.title}</h3>
                <p className="lp-panel-lead">{m.lead}</p>
                <ul className="lp-feats">
                  {m.features.map((f) => (
                    <li key={f.title}>
                      <span className="lp-feat-icon" aria-hidden>
                        {f.icon}
                      </span>
                      <div>
                        <h4>{f.title}</h4>
                        <p>{f.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <Shot src={m.shot.src} alt={m.shot.alt} />
            </div>
          ))}
        </div>
      </section>

      <section id="money" className="lp-dark">
        <div className="lp-wrap lp-section">
          <div className="lp-head rv">
            <Eyebrow>Billing and Tally</Eyebrow>
            <h2>Every rupee follows the work</h2>
            <p className="lp-head-lead">
              Bills are made from approved measurements, purchases are checked against what reached site, and every bill, receipt and payment ends as a
              Tally voucher.
            </p>
          </div>
          <div className="lp-flows">
            {FLOWS.map((f, i) => (
              <div key={f.name} className="lp-flow rv" style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="lp-flow-name">{f.name}</span>
                <ol>
                  {f.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  <li className="lp-flow-end">Tally</li>
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-local">
        <div className="lp-wrap lp-section lp-local-inner">
          <div className="rv">
            <Eyebrow>Made for Indian contracts</Eyebrow>
            <h2>The deductions, taxes and limits are already in it</h2>
            <p className="lp-head-lead">No spreadsheet on the side for retention, TDS or the MSME limit. The register below is what the app keeps for you.</p>
            <Shot src="/landing/web-tally.webp" alt="The Tally export with RA bills, receipts, vendor bills and payments ready to send as vouchers" />
          </div>
          <ol className="lp-register rv" aria-label="What is handled">
            {LOCAL.map((l, i) => (
              <li key={l}>
                <span className="lp-register-no">{String(i + 1).padStart(2, '0')}</span>
                <span>{l}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="site-app" className="lp-app">
        <div className="lp-wrap lp-section lp-app-inner">
          <div className="lp-phones rv" aria-hidden>
            <Phone src="/landing/phone-dpr-offline.webp" alt="" />
            <Phone src="/landing/phone-approvals.webp" alt="" />
          </div>
          <div className="rv">
            <Eyebrow>The site app</Eyebrow>
            <h2>Built for sites without signal</h2>
            <ol className="lp-steps">
              <li>
                <span className="lp-num">1</span>
                <div>
                  <h3>Enter it where it happens</h3>
                  <p>Progress, DPR, attendance, measurements, material, machinery, expenses, inspections and tests, with photos from the camera.</p>
                </div>
              </li>
              <li>
                <span className="lp-num">2</span>
                <div>
                  <h3>It sends itself later</h3>
                  <p>No network at the cutting or the pump house? Entries wait in the outbox and go when the phone is back in range.</p>
                </div>
              </li>
              <li>
                <span className="lp-num">3</span>
                <div>
                  <h3>Approve from anywhere</h3>
                  <p>Project managers get the request on the phone, or on WhatsApp, and approve progress, DPRs, RA bills, orders and vendor bills.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="lp-roles">
        <div className="lp-wrap lp-section">
          <div className="lp-head rv">
            <Eyebrow>Who uses it</Eyebrow>
            <h2>One record, from the site to the client</h2>
          </div>
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

      <section className="lp-proof">
        <div className="lp-wrap lp-section">
          <div className="lp-head lp-head-row rv">
            <div>
              <Eyebrow>See it for yourself</Eyebrow>
              <h2>Open a working company, not a slide deck</h2>
            </div>
            <p className="lp-head-lead">
              Every screen on this page comes from the demo: Demo Infra Projects Pvt Ltd, with three works in Odisha, their bills, orders and inspections.
            </p>
          </div>
          <div className="lp-projects">
            {DEMO_PROJECTS.map((p, i) => (
              <article key={p.code} className="lp-project rv" style={{ transitionDelay: `${i * 90}ms` }}>
                <div className="lp-project-top">
                  <span className="lp-project-type">{p.type}</span>
                  <span className="lp-project-code">{p.code}</span>
                </div>
                <h3>{p.name}</h3>
                <p>
                  {p.client}
                  <br />
                  {p.place}, Odisha
                </p>
              </article>
            ))}
          </div>
          <div className="lp-trust">
            {TRUST.map((t) => (
              <div key={t.title} className="rv">
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="lp-pricing">
        <div className="lp-wrap lp-section lp-pricing-inner">
          <div className="rv">
            <Eyebrow>Pricing</Eyebrow>
            <h2>One plan, every module</h2>
            <p className="lp-head-lead">
              Site, billing, purchase, quality, accounts, the site app and the client portal are all included. Start with one project and add the rest when
              you are ready.
            </p>
          </div>
          <div className="lp-plan rv">
            {pricing ? (
              <>
                <p className="lp-plan-price">
                  <strong>{formatINR(pricing.price)}</strong>
                  <span>
                    per {pricing.unit === 'PROJECT' ? 'active project' : 'user'} a month, plus {BILLING_GST_PCT}% GST
                  </span>
                </p>
                <ul>
                  <li>Free for the first {pricing.trialDays} days, no card needed</li>
                  {pricing.unit === 'PROJECT' ? <li>Unlimited users on every project</li> : <li>Client and consultant logins are free</li>}
                  {pricing.yearChargedMonths < 12 ? <li>Pay a year ahead and get {12 - pricing.yearChargedMonths} months free</li> : null}
                  <li>A GST tax invoice for every payment</li>
                  <li>If a payment is missed, your data stays and can be read; nothing is deleted</li>
                </ul>
              </>
            ) : (
              <>
                <p className="lp-plan-price">
                  <strong>Free trial</strong>
                  <span>then a simple monthly price, paid a month or a year ahead</span>
                </p>
                <ul>
                  <li>Every module and the site app from day one</li>
                  <li>A GST tax invoice for every payment</li>
                  <li>If a payment is missed, your data stays and can be read; nothing is deleted</li>
                </ul>
              </>
            )}
            <Ctas signup={signup} />
          </div>
        </div>
      </section>

      <section id="faq" className="lp-faq">
        <div className="lp-wrap lp-section lp-faq-inner">
          <div className="rv">
            <Eyebrow>Questions</Eyebrow>
            <h2>What contractors ask first</h2>
          </div>
          <div className="lp-faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap lp-section rv">
          <h2>Start with one project this week</h2>
          <p>Import its BOQ from Excel and invite the site team. The first DPR can come in the same week; bills, orders and Tally can follow when you are ready.</p>
          <Ctas signup={signup} onDark />
        </div>
      </section>

      <SiteFooter signup={signup} />
    </div>
  );
}
