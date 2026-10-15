import React, { Suspense } from 'react';
import './site.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
