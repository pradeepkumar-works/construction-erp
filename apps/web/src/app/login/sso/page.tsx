'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Spin } from 'antd';
import { SSO_PROBLEMS, isSsoProblem, type LoginResponse } from '@erp/shared';
import { tk } from '@/ds';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AuthCard } from '@/components/auth/AuthCard';
import { LinkButton } from '@/components/common/LinkButton';
import { SSO_BINDING } from '@/components/auth/SsoSignIn';

/** The value the tab kept when its sign-in started, read once and forgotten. */
function takeBinding(): string | null {
  try {
    const b = window.sessionStorage.getItem(SSO_BINDING);
    window.sessionStorage.removeItem(SSO_BINDING);
    return b;
  } catch {
    return null;
  }
}

/**
 * Where the API sends the browser back after single sign-on (ARCHITECTURE "Single sign-on"): `#code=` is a one-time
 * code, exchanged here for the session, and `#error=` says what went wrong. Both are in the fragment, which no server
 * sees, and both leave the address bar at once. The code is exchanged only with the value this tab kept when it
 * started the sign-in: a tab that started none (a link someone else sent) exchanges nothing.
 */
export default function SsoReturnPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const code = hash.get('code');
    const error = hash.get('error') ?? '';
    const b = takeBinding();
    // A failure the API sent back is shown as the exchange's own would be: in the promise's answer, not while drawing.
    const exchange =
      code && b
        ? api.post<LoginResponse>('/auth/sso/exchange', { code, b })
        : Promise.reject(new Error(code ? SSO_PROBLEMS.BROWSER : isSsoProblem(error) ? SSO_PROBLEMS[error] : SSO_PROBLEMS.EXPIRED));
    exchange
      .then(({ data }) => {
        signIn(data);
        router.replace('/');
      })
      .catch((err) => setProblem(errorMessage(err, SSO_PROBLEMS.EXPIRED)));
  }, [router, signIn]);

  if (!problem)
    return (
      <AuthCard title="Signing in…" subtitle="Opening your company on Nirmaan.">
        <Spin description="Signing in…" />
      </AuthCard>
    );
  return (
    <AuthCard title="Single sign-on did not finish" subtitle="Nothing was changed.">
      <Alert type="error" showIcon title={problem} style={{ marginBottom: tk.space[6] }} />
      <LinkButton type="primary" block size="large" href="/login?sso=1">
        Back to sign in
      </LinkButton>
    </AuthCard>
  );
}
