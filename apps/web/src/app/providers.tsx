'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import { AuthProvider } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

const c = BRAND.colors;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
        },
      }),
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: c.primary,
          colorInfo: c.primary,
          borderRadius: 6,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: c.ink, bodyBg: c.canvas },
          Menu: {
            darkItemBg: c.ink,
            darkSubMenuItemBg: c.ink,
            darkItemSelectedBg: c.primary,
            darkItemHoverBg: c.primaryDeep,
            darkGroupTitleColor: 'rgba(255,255,255,0.45)',
            itemHeight: 36,
            itemMarginBlock: 2,
            groupTitleFontSize: 11,
            groupTitleLineHeight: 1.2,
          },
          Card: { headerFontSize: 15 },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
