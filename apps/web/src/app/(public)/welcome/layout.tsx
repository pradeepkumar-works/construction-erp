import type { Metadata } from 'next';
import React from 'react';
import { BRAND } from '@/lib/brand';

const title = `${BRAND.name}: construction ERP for contractors`;
const description =
  'Site progress and DPRs, RA bills and receivables, purchase orders, subcontractors and payables, quality checks, GST registers and Tally export, with a site app that works without signal.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website', images: [{ url: '/landing/web-dashboard.webp', width: 1600, height: 1000 }] },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
