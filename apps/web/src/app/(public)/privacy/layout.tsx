import type { Metadata } from 'next';
import React from 'react';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Privacy: ${BRAND.name}`,
  description: `How ${BRAND.name} handles your company's data: what is kept, where, who can see it, and how to export or delete it.`,
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
