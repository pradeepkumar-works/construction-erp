import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

/**
 * Top bar of the public pages (product page, privacy): the logo, section links and whatever actions the page passes in.
 * `onField` sets it on the page's first field of colour (the product page's hero) instead of a bar of its own.
 */
export function SiteHeader({ links, onField, children }: { links?: { href: string; label: string }[]; onField?: boolean; children?: React.ReactNode }) {
  return (
    <header className={onField ? 'lp-nav lp-nav-field' : 'lp-nav'}>
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
        <p className="lp-foot-name" aria-hidden translate="no">
          {BRAND.wordmark}
        </p>
        <div className="lp-foot-top">
          <div className="lp-foot-brand">
            <p>{BRAND.description}.</p>
          </div>
          <nav className="lp-foot-col" aria-label="Product">
            <h2>Product</h2>
            <Link href="/welcome#modules">What it does</Link>
            <Link href="/welcome#money">Billing and Tally</Link>
            <Link href="/welcome#site-app">Site app</Link>
            <Link href="/welcome#pricing">Pricing</Link>
            <Link href="/welcome#faq">Questions</Link>
          </nav>
          <nav className="lp-foot-col" aria-label="Get started">
            <h2>Get started</h2>
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
