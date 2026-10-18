import type { Metadata, Viewport } from 'next';
import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Providers } from './providers';
import { WebVitals } from '@/components/shell/WebVitals';
import { BRAND } from '@/lib/brand';
import { Archivo, Public_Sans } from 'next/font/google';
import './globals.css';

/** Archivo (condensed, heavy) for headings and the wordmark; Public Sans for everything else. */
const display = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-display', display: 'swap' });
const body = Public_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name}: ${BRAND.description}`,
};

export const viewport: Viewport = { themeColor: BRAND.colors.canvas };

/**
 * Runs before the first paint (UX item 81): a signed-in page in dark mode, chosen or from the system, starts dark instead of
 * flashing white until the app loads. It reads the same stored choice as `AppearanceProvider`; sign-in and the public
 * pages stay light. It leaves the theme-colour meta to `AppearanceProvider`: changed before hydration, React adds a second
 * one. (The `\\/` keep the regex's slashes once the template literal is read: with a bare `\/` the script did not parse.)
 */
const APPEARANCE_SCRIPT = `try{if(!/^\\/(login|signup|welcome|privacy|forgot-password|set-password)(\\/|$)/.test(location.pathname)){var a=JSON.parse(localStorage.getItem('nirmaan.appearance')||'{}');var d=a.mode==='dark'||(a.mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';if(d){var r=document.documentElement.style;r.colorScheme='dark';r.background='${BRAND.colors.nightLayout}'}}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body>
        <WebVitals />
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
