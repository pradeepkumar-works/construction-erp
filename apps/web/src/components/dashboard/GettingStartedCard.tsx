'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Progress, Typography, theme } from 'antd';
import { CheckCircleFilled, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { GettingStartedStep } from '@erp/shared';
import { seesGettingStarted } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useGettingStarted } from '@/lib/queries';
import { BRAND } from '@/lib/brand';
import { themeColor } from '@/lib/theme';
import { LinkButton } from '@/components/common/LinkButton';

/** What each step asks for, where to do it, and which day of the first week it fits. */
const STEPS: Record<GettingStartedStep, { title: string; help: string; href: string; action: string; day: number }> = {
  PROJECT: { title: 'Create your first project', help: 'Name, client, contract value and dates. Tick "Add the standard activities" to get a schedule to start from.', href: '/projects', action: 'Projects', day: 1 },
  BOQ: { title: 'Add the BOQ', help: 'Import the bill of quantities from Excel on the project\'s BOQ tab, or add items by hand.', href: '/projects', action: 'Open a project', day: 1 },
  ACTIVITIES: { title: 'Plan the activities', help: 'On the Activities tab, add from the template, set planned quantities and link each to its BOQ item.', href: '/projects', action: 'Open a project', day: 1 },
  TEAM: { title: 'Invite your team', help: 'Add project managers, site engineers and the store keeper. Each gets an invite link by email, or you share it on WhatsApp.', href: '/users', action: 'Users', day: 2 },
  MEMBERS: { title: 'Put people on projects', help: 'On each project\'s Overview, add the engineers and managers who work on it. Site staff only see their projects.', href: '/projects', action: 'Open a project', day: 2 },
  APPROVAL_RULES: { title: 'Decide who approves what', help: 'Set rupee limits per role, for example project managers approve expenses up to ₹25,000. Without rules, admin, management and project managers approve everything.', href: '/approval-rules', action: 'Approval rules', day: 3 },
  FIRST_ENTRY: { title: 'First entry from site', help: 'A site engineer installs the Nirmaan app, signs in and sends a progress entry or the day\'s DPR. It works without signal too.', href: '/progress', action: 'Progress entries', day: 4 },
  FIRST_APPROVAL: { title: 'Approve the first entry', help: 'The project manager opens Approvals, checks the photos and approves. The dashboard and BOQ quantities update.', href: '/approvals', action: 'Approvals', day: 5 },
};

const hiddenKey = (orgId: string) => `nirmaan.gettingStarted.hidden.${orgId}`;

/** First-week setup checklist on the dashboard, for admin and management, until every step is done or it is hidden. */
export function GettingStartedCard() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const allowed = !!user && seesGettingStarted(user.roleKey);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (!user) return;
    try {
      setHidden(localStorage.getItem(hiddenKey(user.organizationId)) === '1');
    } catch {
      setHidden(false);
    }
  }, [user]);
  const { data } = useGettingStarted(allowed && !hidden);
  if (!user || !allowed || hidden || !data || data.done === data.total) return null;

  const hide = () => {
    try {
      localStorage.setItem(hiddenKey(user.organizationId), '1');
    } catch {
      // private mode: hidden for this visit only
    }
    setHidden(true);
  };
  const day = Math.max(1, dayjs().startOf('day').diff(dayjs(data.organizationCreatedAt).startOf('day'), 'day') + 1);
  const next = data.steps.find((s) => !s.done)?.key;

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderTop: `3px solid ${BRAND.colors.accent}` }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Your first week on {BRAND.name}</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
            {day <= 7 ? `Day ${day} of 7 · ` : ''}
            {data.done} of {data.total} done
          </Typography.Text>
        </div>
      }
      extra={<Button type="text" size="small" icon={<CloseOutlined />} onClick={hide} aria-label="Hide the setup checklist" />}
    >
      <Progress percent={Math.round((data.done / data.total) * 100)} showInfo={false} strokeColor={BRAND.colors.accent} size="small" style={{ marginBottom: 8 }} aria-label={`Setup checklist: ${data.done} of ${data.total} done`} />
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {data.steps.map((s, i) => {
          const step = STEPS[s.key];
          const isNext = s.key === next;
          return (
            <li key={s.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderTop: i ? `1px solid ${themeColor('colorBorderSecondary')}` : undefined }}>
              <span style={{ width: 22, flex: '0 0 22px', textAlign: 'center', marginTop: 1 }}>
                {s.done ? <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 18 }} /> : <Typography.Text className="mono" strong type={isNext ? undefined : 'secondary'}>{i + 1}</Typography.Text>}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text strong={isNext} delete={s.done} type={s.done ? 'secondary' : undefined}>
                  {step.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  Day {step.day}
                </Typography.Text>
                {!s.done && (
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {step.help}
                  </div>
                )}
              </div>
              {!s.done && (
                <LinkButton href={step.href} size="small" type={isNext ? 'primary' : 'default'}>
                  {step.action}
                </LinkButton>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
