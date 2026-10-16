'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { isGuest } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { AppearanceProvider } from '@/lib/appearance';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login${pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''}`);
    }
  }, [loading, user, router, pathname]);

  // The client's engineer and consultant only have the portal (and their notifications).
  const guestAway = !!user && isGuest(user.roleKey) && !pathname.startsWith('/portal') && !pathname.startsWith('/notifications');
  useEffect(() => {
    if (guestAway) router.replace('/portal');
  }, [guestAway, router]);

  if (loading || !user || guestAway) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <AppearanceProvider>
      <AppShell user={user}>{children}</AppShell>
    </AppearanceProvider>
  );
}
