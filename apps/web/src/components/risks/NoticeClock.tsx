'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, App, Button } from 'antd';
import { MailOutlined } from '@/components/common/icons';
import { canDraftNotice, needsNotice, type RiskDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNoticeClock, useNoticeDraft } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { requestNew } from '@/lib/new-intent';
import { DRAFT_PAGES } from '@/components/ai/drafts';

const left = (n: number) => (n > 1 ? `${n} days left` : n === 1 ? '1 day left' : n === 0 ? 'due today' : n === -1 ? '1 day late' : `${-n} days late`);

/**
 * A delay's notice clock: when the hindrance notice is due under the contract, or the letter that gave it.
 * Draft notice opens the letter form filled in from the delay, its DPR entries and the contract's clause.
 */
export function NoticeClock({ risk }: { risk: RiskDto }) {
  const { user } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const shown = risk.kind === 'DELAY' && needsNotice(risk.responsibleParty);
  const { data } = useNoticeClock(risk.id, shown);
  const draft = useNoticeDraft();
  if (!shown || !data || !user) return null;
  const open = async () => {
    try {
      const d = await draft.mutateAsync(risk.id);
      requestNew('letter', () => router.push(DRAFT_PAGES.letter), d);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  if (data.noticeSent) {
    const late = data.noticeSent.letterDate > data.due;
    return (
      <Alert
        type={late ? 'warning' : 'success'}
        showIcon
        style={{ marginTop: 12 }}
        title={
          <span>
            Notice given:{' '}
            <Link href={`/correspondence/${data.noticeSent.letterId}`} className="text-link">
              {data.noticeSent.letterNo}
            </Link>{' '}
            of {formatDate(data.noticeSent.letterDate)}
            {late ? `, after the notice period ended on ${formatDate(data.due)}` : ''}
          </span>
        }
      />
    );
  }
  if (!data.running) return null;
  return (
    <Alert
      type={data.daysLeft <= 3 ? 'error' : 'warning'}
      showIcon
      style={{ marginTop: 12 }}
      title={`Hindrance notice due ${formatDate(data.due)}: ${left(data.daysLeft)}`}
      description={`The contract asks for notice within ${data.noticeDays} days of the hindrance. ${data.source}. The clock stops when a letter sent to the client is linked to this delay.`}
      action={
        canDraftNotice(user.roleKey) ? (
          <Button size="small" icon={<MailOutlined />} loading={draft.isPending} onClick={() => void open()}>
            Draft notice
          </Button>
        ) : undefined
      }
    />
  );
}
