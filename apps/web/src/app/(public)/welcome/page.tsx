'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import { ArrowRightOutlined, AuditOutlined, CameraOutlined, CheckOutlined, CloudSyncOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';
import { useAuthOptions } from '@/lib/queries';
import { FAQ, FLOWS, LOCAL, MODULES, ROLES } from './content';

/** "Create your company" when sign-up is open, and "Try the demo" always. */
function Ctas({ signup, center, ghost }: { signup?: boolean; center?: boolean; ghost?: boolean }) {
  return (
    <div className={center ? 'lp-cta lp-cta-center' : 'lp-cta'}>
      {signup ? (
        <Link href="/signup">
          <Button type="primary" size="large">
            Create your company
          </Button>
        </Link>
      ) : null}
      <Link href="/login">
        <Button size="large" type={signup ? 'default' : 'primary'} className={ghost ? 'lp-ghost' : undefined}>
          Try the demo
        </Button>
      </Link>
    </div>
  );
}

/** A screenshot of the web app in a plain browser frame. */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="lp-frame">
      <div className="lp-frame-bar" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <img src={src} alt={alt} width={1600} height={1000} loading="lazy" />
    </figure>
  );
}

export default function WelcomePage() {
  const { data: options } = useAuthOptions();
  const [tab, setTab] = useState(MODULES[0].key);
  const year = new Date().getFullYear();
  const signup = !!options?.signup;

  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = MODULES.findIndex((m) => m.key === tab);
    const next = MODULES[(i + (e.key === 'ArrowRight' ? 1 : MODULES.length - 1)) % MODULES.length];
    setTab(next.key);
    document.getElementById(`lp-tab-${next.key}`)?.focus();
  };

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/welcome" className="lp-brand" aria-label={BRAND.name}>
          <BrandMark size={34} />
          <Wordmark color="#fff" size={20} />
        </Link>
        <nav>
          <a href="#modules">Features</a>
          <a href="#money">Billing and Tally</a>
          <a href="#site-app">Site app</a>
          <a href="#faq">Questions</a>
          <Link href="/login">
            <Button type="primary">Sign in</Button>
          </Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-kicker">Construction ERP for contractors</p>
          <h1>From site to Tally, in one place.</h1>
          <p className="lp-lead">
            {BRAND.name} runs a contractor&apos;s projects end to end: progress and DPRs from site, RA bills and payments from the client, purchase
            orders, subcontractors and vendor payments, quality checks, and vouchers ready for TallyPrime.
          </p>
          <Ctas signup={signup} ghost />
          <p className="lp-small">Demo accounts are listed on the sign-in page. The site app works without signal.</p>
        </div>
        <div className="lp-hero-art" aria-hidden>
          <img className="lp-shot-web" src="/landing/web-dashboard.webp" alt="" width={1600} height={1000} />
          <img className="lp-shot-phone" src="/landing/phone-home.webp" alt="" width={540} height={1080} />
        </div>
      </section>
      <div className="lp-datum" />

      <section className="lp-band">
        <div className="lp-wrap lp-three">
          <div>
            <CameraOutlined />
            <h3>Proof from site</h3>
            <p>Every entry carries photos, who sent it and when. Nothing reaches a bill or the dashboard until it is approved.</p>
          </div>
          <div>
            <CloudSyncOutlined />
            <h3>Works offline</h3>
            <p>Entries and photos wait on the phone and send themselves when the network is back. Nothing is entered twice.</p>
          </div>
          <div>
            <SafetyCertificateOutlined />
            <h3>Each company&apos;s data kept apart</h3>
            <p>Site staff see only their own projects, and every company&apos;s records are kept separate, down to the database.</p>
          </div>
        </div>
      </section>

      <section id="modules" className="lp-wrap lp-section">
        <p className="lp-eyebrow">What it does</p>
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
        {MODULES.map((m) => (
          <div key={m.key} id={`lp-panel-${m.key}`} role="tabpanel" aria-labelledby={`lp-tab-${m.key}`} hidden={tab !== m.key} className="lp-panel">
            <div className="lp-panel-text">
              <h3>{m.title}</h3>
              <p className="lp-panel-lead">{m.lead}</p>
              <ul className="lp-feats">
                {m.features.map((f) => (
                  <li key={f.title}>
                    <span className="lp-icon">{f.icon}</span>
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
      </section>

      <section id="money" className="lp-dark">
        <div className="lp-wrap lp-section">
          <p className="lp-eyebrow">Billing and Tally</p>
          <h2>Every rupee follows the work</h2>
          <p className="lp-dark-lead">
            Bills are made from approved measurements, purchases are checked against what reached site, and every bill, receipt and payment ends as a
            Tally voucher. Tally stays your books.
          </p>
          <div className="lp-flows">
            {FLOWS.map((f) => (
              <div key={f.name} className="lp-flow">
                <span className="lp-flow-name">{f.name}</span>
                <ol>
                  {f.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  <li className="lp-flow-end">
                    <ArrowRightOutlined /> Tally
                  </li>
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-wrap lp-section lp-local">
        <div>
          <p className="lp-eyebrow">Made for Indian contracts</p>
          <h2>The deductions, taxes and limits are already in it</h2>
          <ul className="lp-checks">
            {LOCAL.map((l) => (
              <li key={l}>
                <CheckOutlined />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
        <Shot src="/landing/web-tally.webp" alt="The Tally export with RA bills, receipts, vendor bills and payments ready to send as vouchers" />
      </section>

      <section className="lp-roles">
        <div className="lp-wrap lp-section">
          <p className="lp-eyebrow">Who uses it</p>
          <h2>One system, every desk</h2>
          <div className="lp-role-grid">
            {ROLES.map((r) => (
              <div key={r.who} className="lp-card">
                <h3>{r.who}</h3>
                <p>{r.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="site-app" className="lp-how">
        <div className="lp-wrap lp-how-inner">
          <div>
            <p className="lp-eyebrow">The site app</p>
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
                  <p>No network? Entries wait in the outbox and go when the phone is back in range. Photos are made smaller first.</p>
                </div>
              </li>
              <li>
                <span className="lp-num">3</span>
                <div>
                  <h3>Approve from anywhere</h3>
                  <p>Project managers get a notification and approve progress, DPRs, RA bills, purchase orders and vendor bills from the phone.</p>
                </div>
              </li>
            </ol>
          </div>
          <div className="lp-phones" aria-hidden>
            <img src="/landing/phone-progress-new.webp" alt="" width={540} height={1080} loading="lazy" />
            <img src="/landing/phone-approvals.webp" alt="" width={540} height={1080} loading="lazy" />
          </div>
        </div>
      </section>

      <section id="faq" className="lp-wrap lp-section lp-faq">
        <p className="lp-eyebrow">Questions</p>
        <h2>What contractors ask first</h2>
        <div>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap lp-section">
          <AuditOutlined className="lp-final-icon" />
          <h2>See your own projects in {BRAND.name}</h2>
          <p>Start with one project. Import its BOQ, invite the site team, and the first DPR can come in the same week. Bills, orders and Tally can follow when you are ready.</p>
          <Ctas signup={signup} center />
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span className="lp-brand">
            <BrandMark size={22} />
            <Wordmark color="#fff" size={14} />
          </span>
          <nav className="lp-foot-links">
            <a href="#modules">Features</a>
            <a href="#money">Billing and Tally</a>
            <a href="#site-app">Site app</a>
            <a href="#faq">Questions</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/login">Sign in</Link>
          </nav>
          <span>
            © {year} {BRAND.name}. {BRAND.description}.
          </span>
        </div>
      </footer>
    </div>
  );
}
