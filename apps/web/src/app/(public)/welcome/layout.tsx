import type { Metadata } from 'next';
import React from 'react';
import { BRAND } from '@/lib/brand';

const title = `${BRAND.name}: construction ERP with AI for Indian contractors`;
const description =
  'Site entries become RA bills and Tally vouchers, and every morning it reads the records and tells each person what needs them. DPRs, billing, purchase, quality and accounts, with a site app that works without signal.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: 'website', images: [{ url: '/landing/web-watch.webp', width: 1600, height: 1000 }] },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
