'use client';

import React, { useState } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { errorStatus } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { FeedbackHost, mutationFailed } from '@/lib/notify';
import { A11yPatches } from '@/lib/a11y-patches';
import { appTheme, componentConfig, themeCssVariables } from '@/lib/theme';
import { renderEmpty } from '@/components/common/renderEmpty';

const isClientError = (err: unknown) => {
  const status = errorStatus(err);
  return !!status && status >= 400 && status < 500;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => {
      const client: QueryClient = new QueryClient({
        // A failed save that asked for it (`meta: FAIL_NOTICE`) says why in plain words, with Retry.
        mutationCache: new MutationCache({ onError: (err, variables, _ctx, mutation) => mutationFailed(client, err, variables, mutation) }),
        defaultOptions: {
          // One retry for a dropped connection or a server error; a 4xx (not allowed, not found) will not change, so it shows at once.
          // Lists and records count as fresh for 30 s, so going back to a list, or opening a record prefetched on hover,
          // shows it at once without asking again; saving anything invalidates what it changed.
          queries: { retry: (failures, err) => failures < 1 && !isClientError(err), refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      });
      return client;
    },
  );

  return (
    <ConfigProvider theme={appTheme} {...componentConfig} renderEmpty={renderEmpty}>
      <style>{themeCssVariables}</style>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <FeedbackHost />
          <A11yPatches />
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
