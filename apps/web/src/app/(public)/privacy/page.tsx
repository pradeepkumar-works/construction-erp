import React from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { BrandMark, Wordmark } from '@/components/shell/BrandMark';

/** Where privacy questions go; set NEXT_PUBLIC_PRIVACY_EMAIL on the web project. */
const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_EMAIL;
const UPDATED = '14 October 2026';

export default function PrivacyPage() {
  const name = BRAND.name;
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/welcome" className="lp-brand" aria-label={name}>
          <BrandMark size={34} />
          <Wordmark color="#fff" size={20} />
        </Link>
        <nav>
          <Link href="/welcome">Product</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <main className="lp-wrap lp-doc">
        <h1>Privacy</h1>
        <p className="lp-doc-meta">Last updated {UPDATED}</p>

        <p>
          {name} is used by construction companies to run their projects. The company that signs up owns the data its people put in; {name} keeps it and
          shows it only to the people that company lets in. This page says what is kept, where, who sees it, and how a company takes it out or has it
          erased.
        </p>

        <h2>What is kept</h2>
        <ul>
          <li>Accounts: name, email, role, and optionally a mobile number. Passwords are stored only as salted hashes.</li>
          <li>
            Project records the company enters: BOQs, progress, daily reports, attendance, materials, machinery, expenses, measurements, bills, orders, vendors,
            staff and leave, quality checks, documents and the photos and files attached to them.
          </li>
          <li>An audit log of who submitted, approved, changed or exported what, and when.</li>
          <li>Notifications, and a log of the WhatsApp and SMS messages sent (to whom, which message, whether it went).</li>
          <li>Push tokens for the phones where someone is signed in to the site app, removed when they sign out.</li>
        </ul>
        <p>
          {name} does not sell data, show advertising, or use a company&apos;s records for anything except running the service for that company.
        </p>

        <h2>Who can see it</h2>
        <ul>
          <li>Only people the company&apos;s admin invites. Each sees only the projects they are on and what their role allows.</li>
          <li>
            Clients&apos; engineers and consultants the company invites see only the client portal of their own projects: approved progress, approved
            reports, bills once sent, and inspections.
          </li>
          <li>Every company&apos;s data is kept apart, and the database itself refuses to show one company&apos;s rows to another.</li>
          <li>{name} staff look at a company&apos;s data only when that company asks for help.</li>
        </ul>

        <h2>Where it is kept, and who helps</h2>
        <ul>
          <li>The database runs on Neon (PostgreSQL) in Singapore, and the application on Vercel. Connections are encrypted.</li>
          <li>Email goes through the configured email provider; push notifications through Expo; WhatsApp and SMS, when a user switches them on, through the messaging provider the company&apos;s plan uses.</li>
          <li>These providers handle the data only to deliver the service.</li>
        </ul>

        <h2>Taking your data out</h2>
        <p>
          A company admin can download everything at any time from <b>Admin &gt; Data &amp; Privacy</b>: an Excel file for each kind of record and every photo
          and document, in one zip. Lists in the app also export to Excel.
        </p>

        <h2>Deleting it</h2>
        <ul>
          <li>An admin can remove a user at any time; the records that person entered stay with the company.</li>
          <li>
            An admin can ask for the whole company to be deleted from <b>Admin &gt; Data &amp; Privacy</b>. Nothing is erased for 30 days, and any admin can
            cancel until then. On that day every project, record, photo and user account of the company is erased.
          </li>
          <li>Database backups roll over and the erased data leaves them within the provider&apos;s backup window.</li>
        </ul>

        <h2>Questions</h2>
        <p>
          {CONTACT ? (
            <>
              Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            </>
          ) : (
            <>Ask your company&apos;s admin, who can reach {name} support.</>
          )}
        </p>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-inner">
          <span className="lp-brand">
            <BrandMark size={22} />
            <Wordmark color="#fff" size={14} />
          </span>
          <span>
            © {new Date().getFullYear()} {name}. {BRAND.description}.
          </span>
        </div>
      </footer>
    </div>
  );
}
