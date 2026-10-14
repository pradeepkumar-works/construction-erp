import type { Metadata } from 'next';
import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Providers } from './providers';
import { BRAND, brandCssVars } from '@/lib/brand';
import { Archivo, Public_Sans } from 'next/font/google';
import './globals.css';

/** Archivo (condensed, heavy) for headings and the wordmark; Public Sans for everything else. */
const display = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-display', display: 'swap' });
const body = Public_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name}: ${BRAND.description}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} style={brandCssVars as React.CSSProperties}>
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
