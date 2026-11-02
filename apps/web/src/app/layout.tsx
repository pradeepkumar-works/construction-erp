import type { Metadata, Viewport } from 'next';
import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Providers } from './providers';
import { WebVitals } from '@/components/shell/WebVitals';
import { BRAND } from '@/lib/brand';
import { tokenCss } from '@/ds/css';
import { resolve } from '@/ds';
import { Inter } from 'next/font/google';
import './globals.css';

/** Inter for everything (the Quiet look): titles and text in one face, set apart by size and weight. */
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: BRAND.name,
  description: `${BRAND.name}: ${BRAND.description}`,
};

const LIGHT_CANVAS = resolve('light').color.surface.canvas;
const NIGHT_CANVAS = resolve('dark').color.surface.canvas;

export const viewport: Viewport = { themeColor: LIGHT_CANVAS };

/**
 * Runs before the first paint: a signed-in page in dark mode, chosen or from the system, starts dark instead of
 * flashing white until the app loads. It reads the same stored choice as `AppearanceProvider`; sign-in and the public
 * pages stay light. It leaves the theme-colour meta to `AppearanceProvider`: changed before hydration, React adds a second
 * one. (The `\\/` keep the regex's slashes once the template literal is read: with a bare `\/` the script did not parse.)
 */
const APPEARANCE_SCRIPT = `try{if(!/^\\/(login|signup|welcome|privacy|forgot-password|set-password)(\\/|$)/.test(location.pathname)){var a=JSON.parse(localStorage.getItem('nirmaan.appearance')||'{}');var d=a.mode==='dark'||(a.mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.density=a.density==='compact'?'compact':'comfortable';if(d){var r=document.documentElement.style;r.colorScheme='dark';r.background='${NIGHT_CANVAS}'}}}catch(e){}`;

const TOKEN_CSS = tokenCss();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
        <style>{TOKEN_CSS}</style>
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
