'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Flex, theme } from 'antd';
import { CustomerServiceOutlined, DisconnectOutlined } from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { BILLING_REMIND_DAYS, PRODUCT_NAME, canManageBilling, canManageCompanyData } from '@erp/shared';
import { useCompanyDeletion } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { endSupportSession } from '@/lib/api';

type Level = 'error' | 'warning' | 'info';

export interface ShellMessage {
  key: string;
  type: Level;
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Can be put away for the rest of the browser session (reminders, never a read-only or deletion notice). */
  dismissible?: boolean;
}

const ORDER: Record<Level, number> = { error: 0, warning: 1, info: 2 };
const DISMISSED = 'nirmaan:dismissed-messages';

function dismissedKeys(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISSED) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** What the company and this browser need to tell the user on every page, most serious first. */
function useShellMessages(user: AuthUser): ShellMessage[] {
  const online = useOnline();
  const deletionAdmin = canManageCompanyData(user.roleKey);
  const { data: deletion } = useCompanyDeletion(deletionAdmin);
  const list: ShellMessage[] = [];

  if (!online) list.push({ key: 'offline', type: 'warning', icon: <DisconnectOutlined />, title: 'You are offline. What you see may be out of date, and changes will not save until the connection is back.' });

  // Staff viewing a company for support see whose data it is and how to leave.
  if (user.support) {
    const exit = () => {
      endSupportSession();
      window.location.href = '/platform';
    };
    list.push({
      key: 'support',
      type: 'warning',
      icon: <CustomerServiceOutlined />,
      title: `Viewing ${user.organizationName} as ${PRODUCT_NAME} support, read-only, until ${formatDateTime(user.support.expiresAt)}. The visit is in the company's log.`,
      action: (
        <Button size="small" onClick={exit}>
          Exit
        </Button>
      ),
    });
  }

  // Everyone sees when the company is read-only for want of payment; admins also see the trial or period running out.
  const b = user.billing;
  if (b && !user.support) {
    const admin = canManageBilling(user.roleKey);
    const renew = admin ? (
      <Link href="/billing">
        <Button size="small" type="primary">
          {b.status === 'READ_ONLY' ? 'Renew' : 'Subscribe'}
        </Button>
      </Link>
    ) : undefined;
    if (b.status === 'READ_ONLY') {
      list.push({
        key: 'read-only',
        type: 'error',
        title: `${user.organizationName} is read-only: the ${PRODUCT_NAME} ${b.paidUntil ? 'subscription' : 'free trial'} has ended. You can still see and export everything.${admin ? '' : ' Ask your admin to renew.'}`,
        action: renew,
      });
    } else {
      const ends = b.status === 'TRIAL' ? b.trialEndsAt : b.status === 'ACTIVE' ? b.paidUntil : null;
      const daysLeft = ends ? Math.round((Date.parse(`${ends}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000) : Infinity;
      if (admin && ends && daysLeft <= BILLING_REMIND_DAYS) {
        list.push({
          key: `billing-ends-${ends}`,
          type: 'info',
          title: `Your ${b.status === 'TRIAL' ? 'free trial' : 'subscription'} ends on ${formatDate(ends)}. After that the company becomes read-only until it is paid.`,
          action: renew,
          dismissible: true,
        });
      }
    }
  }

  // Admins are reminded on every page while the company is set to be deleted.
  if (deletionAdmin && deletion?.scheduledFor) {
    list.push({
      key: 'deletion',
      type: 'error',
      title: `This company and all its data will be deleted on ${formatDate(deletion.scheduledFor)}.`,
      action: (
        <Link href="/company-data">
          <Button size="small" danger>
            Review or cancel
          </Button>
        </Link>
      ),
    });
  }

  return list.sort((a, c) => ORDER[a.type] - ORDER[c.type]);
}

/**
 * Page-level messages (UI roadmap item 63, after Cloudscape's flashbar): one bar above every page instead of a stack of
 * alerts. The most serious message shows; the rest fold behind "N more" until opened.
 */
export function MessageBar({ user }: { user: AuthUser }) {
  const { token } = theme.useToken();
  const all = useShellMessages(user);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setDismissed(dismissedKeys()), []);

  const messages = all.filter((m) => !dismissed.includes(m.key));
  if (!messages.length) return null;
  const shown = expanded ? messages : messages.slice(0, 1);
  const more = messages.length - 1;

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISSED, JSON.stringify(next));
    } catch {
      /* private mode: dismissed for this page view only */
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: 0 }} role="region" aria-label="Messages">
      <Flex vertical gap={token.marginXS}>
        {shown.map((m, i) => (
          <Alert
            key={m.key}
            type={m.type}
            showIcon
            icon={m.icon}
            title={m.title}
            closable={m.dismissible ? { onClose: () => dismiss(m.key), 'aria-label': 'Dismiss' } : false}
            action={
              <Flex gap={token.marginXS} align="center">
                {m.action}
                {i === shown.length - 1 && more > 0 ? (
                  <Button size="small" type="text" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                    {expanded ? 'Show less' : `${more} more`}
                  </Button>
                ) : null}
              </Flex>
            }
          />
        ))}
      </Flex>
    </div>
  );
}
