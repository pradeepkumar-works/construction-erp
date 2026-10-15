'use client';

import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

const POINTS = ['Progress, DPRs and photos from site, even offline', 'RA bills, purchases and payments with GST', 'Approvals on the phone, exports to Tally'];

/**
 * The split layout used by the sign-in, sign-up and password pages: a quiet navy brand panel on the left
 * (hidden on narrow screens) and the form on white, with plenty of room around it.
 */
export function AuthCard({ title, subtitle, children, width = 400 }: { title?: React.ReactNode; subtitle: React.ReactNode; children: React.ReactNode; width?: number }) {
  const year = new Date().getFullYear();
  return (
    <div className="auth">
      <aside className="auth-aside" aria-hidden>
        <Link href="/welcome" className="auth-brand" tabIndex={-1}>
          <BrandMark size={34} />
          <Wordmark color="#fff" size={20} />
        </Link>
        <div className="auth-pitch">
          <p className="auth-kicker">Construction ERP</p>
          <h2 className="auth-headline">From site to Tally, in one place.</h2>
          <span className="auth-datum" />
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <p className="auth-aside-foot">Built for construction contractors in India</p>
      </aside>

      <main className="auth-main">
        <div className="auth-form" style={{ maxWidth: width }}>
          <Link href="/welcome" className="auth-brand auth-brand-compact" aria-label={BRAND.name}>
            <BrandMark size={32} />
            <Wordmark color={BRAND.colors.ink} size={19} />
          </Link>
          {title ? <h1 className="auth-title">{title}</h1> : null}
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
        <footer className="auth-foot">
          <span>
            © {year} {BRAND.name}
          </span>
          <nav>
            <Link href="/welcome">Product</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
