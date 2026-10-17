import React from 'react';
import Link from 'next/link';
import { SUPPORT_ACCESS_DAYS } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome';

/** Where privacy questions go; set NEXT_PUBLIC_PRIVACY_EMAIL on the web project. */
const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_EMAIL;
const UPDATED = '14 October 2026';

export default function PrivacyPage() {
  const name = BRAND.name;
  return (
    <div className="lp">
      <SiteHeader>
        <Link href="/welcome" className="lp-nav-signin">
          Product
        </Link>
        <Link href="/login" className="lp-btn lp-btn-primary lp-btn-sm">
          Sign in
        </Link>
      </SiteHeader>

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
          <li>
            For a paying company: who its invoices are made out to (name, GSTIN, address) and its payments. Card, UPI and bank details are entered with Razorpay,
            the payment provider, and never reach {name}; we keep only Razorpay&apos;s payment reference.
          </li>
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
          <li>
            {name} staff can open a company&apos;s data only after its admin allows support access under Admin, Data &amp; Privacy. It lasts
            {SUPPORT_ACCESS_DAYS} days, is read-only, can be withdrawn at any time, and every visit is recorded in the company&apos;s log.
          </li>
        </ul>

        <h2>Where it is kept, and who helps</h2>
        <ul>
          <li>The database runs on Neon (PostgreSQL) in Singapore, and the application on Vercel. Connections are encrypted.</li>
          <li>Email goes through the configured email provider; push notifications through Expo; WhatsApp and SMS, when a user switches them on, through the messaging provider the company&apos;s plan uses.</li>
          <li>
            When a company switches on Ask {name}, the AI assistant, a question and the records needed to answer it are sent to a large language model from an AI
            provider (today DeepSeek), through the OpenRouter gateway, to write the answer. Requests go only to providers that do not keep or train on this data. The assistant only reads what the asking person can already see, and the
            conversation is kept in {name} for that person, who can delete it.
          </li>
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

      <SiteFooter />
    </div>
  );
}
