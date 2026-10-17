'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isGuest } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import { ShellSkeleton } from '@/components/shell/ShellSkeleton';
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

  // While the sign-in is checked: the shell's outline and a page of placeholders, where the app will draw them.
  if (loading || !user || guestAway) return <ShellSkeleton />;

  return (
    <AppearanceProvider>
      <AppShell user={user}>{children}</AppShell>
    </AppearanceProvider>
  );
}
