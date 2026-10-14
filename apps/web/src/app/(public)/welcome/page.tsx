'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from 'antd';
import {
  AlertOutlined,
  AuditOutlined,
  CalculatorOutlined,
  CameraOutlined,
  CheckSquareOutlined,
  CloudSyncOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FundOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';
import { useAuthOptions } from '@/lib/queries';

const FEATURES: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <FileTextOutlined />, title: 'DPR and progress from site', text: 'Quantities against BOQ activities, manpower from attendance, photos and the day\'s issues, from the site engineer\'s phone.' },
  { icon: <CheckSquareOutlined />, title: 'One approval flow', text: 'Approve, reject or send back with a reason. Rupee limits per role, and every step in the audit trail.' },
  { icon: <CalculatorOutlined />, title: 'BOQ and measurement book', text: 'Import the BOQ from Excel, record nos × L × B × D on site, and see executed and measured quantity side by side.' },
  { icon: <InboxOutlined />, title: 'Material and stock', text: 'Material requests, GRN against what was approved, issue to site, and an alert when an item falls below its minimum.' },
  { icon: <ToolOutlined />, title: 'Machinery log', text: 'Hours worked, idle and breakdown, diesel and hire rates for owned and hired equipment.' },
  { icon: <WalletOutlined />, title: 'Site expenses with GST', text: 'Bill photo, vendor GSTIN, taxable value and GST, approved before it counts as project cost.' },
  { icon: <FundOutlined />, title: 'Cost against work done', text: 'Expenses, material issued, machinery and labour against BOQ value executed, project by project.' },
  { icon: <AlertOutlined />, title: 'Delays and risks', text: 'Hindrances with days lost and who caused them, for extension-of-time claims, and a 5 × 5 risk register.' },
  { icon: <FilePdfOutlined />, title: 'Weekly and monthly reports', text: 'A progress report built from approved data, ready to print or save as PDF for the client.' },
];

const STEPS: { who: string; what: string }[] = [
  { who: 'Site engineer', what: 'Enters the day\'s progress, DPR and material needs on the phone, with photos. No signal? It saves on the phone and sends later.' },
  { who: 'Project manager', what: 'Gets a notification, checks the photos and quantities, and approves or sends it back with a note.' },
  { who: 'Office and management', what: 'See progress, cost and pending approvals for every project the same day, and print the client report.' },
];

export default function WelcomePage() {
  const { data: options } = useAuthOptions();
  const year = new Date().getFullYear();
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/welcome" className="lp-brand" aria-label={BRAND.name}>
          <BrandMark size={34} />
          <Wordmark color="#fff" size={20} />
        </Link>
        <nav>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link href="/login">
            <Button type="primary">Sign in</Button>
          </Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-kicker">Construction ERP for contractors</p>
          <h1>Site to office, the same day.</h1>
          <p className="lp-lead">
            {BRAND.name} puts the BOQ, daily progress, DPRs, materials, machinery and approvals for every project in one place, with a site app
            that works where your sites are: without signal.
          </p>
          <div className="lp-cta">
            {options?.signup ? (
              <Link href="/signup">
                <Button type="primary" size="large">
                  Create your company
                </Button>
              </Link>
            ) : null}
            <Link href="/login">
              <Button size="large" type={options?.signup ? 'default' : 'primary'} className="lp-ghost">
                Try the demo
              </Button>
            </Link>
          </div>
          <p className="lp-small">Demo accounts are listed on the sign-in page. Road, building and water supply projects come with standard activity lists.</p>
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
            <p>Every entry carries photos, who sent it and when. Nothing reaches the dashboard until it is approved.</p>
          </div>
          <div>
            <CloudSyncOutlined />
            <h3>Works offline</h3>
            <p>Entries and photos wait on the phone and send themselves when the network is back. Nothing is entered twice.</p>
          </div>
          <div>
            <SafetyCertificateOutlined />
            <h3>Each company's data kept apart</h3>
            <p>Site staff see only their own projects, and every company's records are kept separate, down to the database.</p>
          </div>
        </div>
      </section>

      <section id="features" className="lp-wrap lp-section">
        <h2>Everything a site sends to the office</h2>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card">
              <span className="lp-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="lp-how">
        <div className="lp-wrap lp-how-inner">
          <div>
            <h2>How a day works</h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.who}>
                  <span className="lp-num">{i + 1}</span>
                  <div>
                    <h3>{s.who}</h3>
                    <p>{s.what}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-phones" aria-hidden>
            <img src="/landing/phone-progress-new.webp" alt="" width={540} height={1080} />
            <img src="/landing/phone-approvals.webp" alt="" width={540} height={1080} />
          </div>
        </div>
      </section>

      <section className="lp-wrap lp-section lp-final">
        <AuditOutlined className="lp-final-icon" />
        <h2>See your own projects in {BRAND.name}</h2>
        <p>Start with one project. Import its BOQ, invite the site team, and the first DPR can come in the same week.</p>
        <div className="lp-cta lp-cta-center">
          {options?.signup ? (
            <Link href="/signup">
              <Button type="primary" size="large">
                Create your company
              </Button>
            </Link>
          ) : null}
          <Link href="/login">
            <Button size="large" type={options?.signup ? 'default' : 'primary'}>
              Try the demo
            </Button>
          </Link>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span className="lp-brand">
            <BrandMark size={22} />
            <Wordmark color="#fff" size={14} />
          </span>
          <span>
            © {year} {BRAND.name}. {BRAND.description}.
          </span>
        </div>
      </footer>
    </div>
  );
}
