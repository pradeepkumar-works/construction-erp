import React, { Suspense } from 'react';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
