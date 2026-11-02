'use client';

import React from 'react';
import { BILL_STAGES, BILL_STAGE_LABELS, plural, type BillStage, type BoardStage, type RaBillDto } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { daysUntil } from '@/components/list/DueCell';
import { RecordLink } from '@/components/record/RecordLink';
import { BoardCard, PipelineBoard, type BoardListProps } from '@/components/boards/PipelineBoard';

/** Where an approved bill is with the client, in the words of the list's With client column; a bill not yet approved is left to the table. */
const STAGES: BoardStage[] = BILL_STAGES.map((s) => ({ key: s, label: BILL_STAGE_LABELS[s] }));

/** The day a bill reached its stage, and the word for it. */
const REACHED: Record<BillStage, { word: string; on: (b: RaBillDto) => string | null }> = {
  NOT_SENT: { word: 'Approved', on: (b) => b.reviewedAt },
  SENT: { word: 'Sent', on: (b) => b.sentDate },
  CERTIFIED: { word: 'Certified', on: (b) => b.certifiedDate },
  PAID: { word: 'Paid', on: (b) => b.paidDate },
};

/** "Sent 21 days ago"; a paid bill waits on no one, so it shows the day it was paid. */
function AtStage({ b }: { b: RaBillDto }) {
  const { word, on } = REACHED[b.stage];
  const date = on(b);
  if (!date) return null;
  if (b.stage === 'PAID') return <span translate="no">{`${word} ${formatDate(date)}`}</span>;
  const days = -daysUntil(date);
  return <span translate="no">{days > 0 ? `${word} ${plural(days, 'day')} ago` : `${word} today`}</span>;
}

export function BillBoard(props: BoardListProps<RaBillDto> & { showProject: boolean; onOpen: (id: string) => void }) {
  const { onOpen, showProject, ...rest } = props;
  return (
    <PipelineBoard<RaBillDto>
      {...rest}
      label="RA bills by stage with the client"
      stages={STAGES}
      stageOf={(b) => (b.status === 'APPROVED' ? b.stage : null)}
      amountOf={(b) => b.netPayable}
      rowKey={(b) => b.id}
      noun={['bill', 'bills']}
      card={(b, money) => (
        <BoardCard
          title={
            <RecordLink href={`/bills/${b.id}`} onOpen={() => onOpen(b.id)} strong>
              {b.billLabel}
            </RecordLink>
          }
          lines={[showProject ? <span key="project" translate="no">{[b.projectName, b.clientName].filter(Boolean).join(' · ')}</span> : null]}
          amount={money(b.netPayable)}
          aside={<AtStage b={b} />}
        />
      )}
    />
  );
}
