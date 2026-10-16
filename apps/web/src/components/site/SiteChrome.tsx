import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

/** Top bar of the public pages (product page, privacy): the logo, section links and whatever actions the page passes in. */
export function SiteHeader({ links, children }: { links?: { href: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <Link href="/welcome" className="lp-brand" aria-label={BRAND.name}>
          <BrandMark size={32} />
          <Wordmark color={BRAND.colors.onAccent} size={19} />
        </Link>
        {links?.length ? (
          <nav className="lp-nav-links" aria-label="Sections">
            {links.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
        ) : null}
        <div className="lp-nav-actions">{children}</div>
      </div>
    </header>
  );
}

/** Footer of the public pages. */
export function SiteFooter({ signup }: { signup?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-foot">
      <div className="lp-wrap">
        <div className="lp-foot-top">
          <div className="lp-foot-brand">
            <span className="lp-brand">
              <BrandMark size={28} />
              <Wordmark color={BRAND.colors.onAccent} size={17} />
            </span>
            <p>{BRAND.description}.</p>
          </div>
          <nav className="lp-foot-col" aria-label="Product">
            <h3>Product</h3>
            <Link href="/welcome#modules">What it does</Link>
            <Link href="/welcome#money">Billing and Tally</Link>
            <Link href="/welcome#site-app">Site app</Link>
            <Link href="/welcome#pricing">Pricing</Link>
            <Link href="/welcome#faq">Questions</Link>
          </nav>
          <nav className="lp-foot-col" aria-label="Get started">
            <h3>Get started</h3>
            <Link href="/login">Try the demo</Link>
            {signup ? <Link href="/signup">Create your company</Link> : null}
            <Link href="/login">Sign in</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
        <div className="lp-foot-bottom">
          <span>
            © {year} {BRAND.name}
          </span>
          <span>Made for construction contractors in India</span>
        </div>
      </div>
    </footer>
  );
}
