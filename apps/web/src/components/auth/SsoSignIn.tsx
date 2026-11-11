'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { SSO_PROVIDER_INFO } from '@erp/shared';
import { tk } from '@/ds';
import { API_URL, errorMessage } from '@/lib/api';
import { useSsoCompany } from '@/lib/queries';
import { CODE_INPUT, upper } from '@/components/form/inputs';

/** The company code this browser last signed in with by single sign-on, so the button is ready next time. */
const REMEMBERED = 'erp_sso_company';

function remembered(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function remember(code: string | null) {
  try {
    if (code) window.localStorage.setItem(REMEMBERED, code);
    else window.localStorage.removeItem(REMEMBERED);
  } catch {
    /* ignore storage errors */
  }
}

/** The API starts the sign-in and sends the browser to the company's provider (ARCHITECTURE "Single sign-on"). */
export const ssoStartUrl = (code: string, binding?: string) => `${API_URL}/auth/sso/${encodeURIComponent(code)}/start${binding ? `?b=${binding}` : ''}`;

/**
 * The tab a sign-in starts in keeps a random value and sends it to /start; the return page exchanges the one-time code
 * only with it (`/login/sso`), so a code made in someone else's browser cannot sign this one in. sessionStorage is the
 * tab's own and outlives the trip to the provider; the web and the API may be on different sites, so no cookie can.
 */
export const SSO_BINDING = 'erp_sso_binding';

function newBinding(): string | null {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const b = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    window.sessionStorage.setItem(SSO_BINDING, b);
    return b;
  } catch {
    return null;
  }
}

/**
 * Sign in › Use single sign-on: the company code, then the provider's button. Drawn only in the browser (the
 * sign-in page shows it once the server's options say SSO is on), so the remembered code is read as it first draws.
 */
export function SsoSignIn({ onPassword, initialCode }: { onPassword: () => void; initialCode?: string | null }) {
  const [code, setCode] = useState<string | null>(() => initialCode?.trim().toUpperCase() || remembered());
  const lookup = useSsoCompany(code);
  const company = lookup.data ?? null;
  const error = lookup.error ? errorMessage(lookup.error, 'That company code was not found. Check it with your admin.') : null;
  useEffect(() => {
    if (company) remember(company.companyCode);
  }, [company]);

  return (
    <>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: tk.space[6] }} />}
      {company ? (
        <>
          <Button
            type="primary"
            block
            size="large"
            href={ssoStartUrl(company.companyCode)}
            onClick={(e) => {
              const b = newBinding();
              if (!b) return;
              e.preventDefault();
              window.location.assign(ssoStartUrl(company.companyCode, b));
            }}
          >
            Sign in with {SSO_PROVIDER_INFO[company.provider].button}
          </Button>
          <p className="auth-alt">
            Company code <strong translate="no">{company.companyCode}</strong>.{' '}
            <button
              type="button"
              className="auth-link"
              onClick={() => {
                remember(null);
                setCode(null);
              }}
            >
              Use another company code
            </button>
          </p>
        </>
      ) : (
        <Form layout="vertical" requiredMark={false} initialValues={{ code: code ?? '' }} onFinish={(v: { code: string }) => (v.code.trim() === code ? void lookup.refetch() : setCode(v.code.trim()))}>
          <Form.Item name="code" label="Company code" normalize={upper} tooltip="Your admin has it: Company settings › Sign-in" rules={[{ required: true, message: 'Enter your company code, e.g. ACME' }]}>
            <Input
              {...CODE_INPUT}
              size="large"
              maxLength={20}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the one field of this step
              autoFocus
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={lookup.isFetching}>
            Continue
          </Button>
        </Form>
      )}
      <p className="auth-alt">
        <button type="button" className="auth-link" onClick={onPassword}>
          Sign in with your email and password
        </button>
      </p>
    </>
  );
}
