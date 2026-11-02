'use client';

import React from 'react';
import { TENDER_STATUS_LABELS, type BoardStage, type TenderDto } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { DueCell } from '@/components/list/DueCell';
import { RecordLink } from '@/components/record/RecordLink';
import { BoardCard, PipelineBoard, type BoardListProps } from '@/components/boards/PipelineBoard';
import { RankText } from './tenderUi';

/**
 * Where each bid stands: priced, in, opened, then won or lost. Won and Lost are columns of their own, since the rupees
 * won and the rupees lost answer different questions; a tender not bid or cancelled is left to the table.
 */
const STAGES: BoardStage[] = [
  { key: 'PREPARING', label: TENDER_STATUS_LABELS.PREPARING },
  { key: 'SUBMITTED', label: TENDER_STATUS_LABELS.SUBMITTED },
  { key: 'OPENED', label: 'Bids opened' },
  { key: 'WON', label: TENDER_STATUS_LABELS.WON },
  { key: 'LOST', label: TENDER_STATUS_LABELS.LOST },
];

const stageOf = (t: TenderDto) => (t.status === 'SUBMITTED' && t.openedOn ? 'OPENED' : t.status);

function Standing({ t }: { t: TenderDto }) {
  if (t.status === 'PREPARING') return <DueCell date={t.submitBy} />;
  if (t.rank)
    return (
      <span>
        <RankText rank={t.rank} />
        {` of ${t.bidders}`}
      </span>
    );
  return <span translate="no">{t.submittedOn ? `Submitted ${formatDate(t.submittedOn)}` : null}</span>;
}

export function TenderBoard(props: BoardListProps<TenderDto> & { onOpen: (id: string) => void }) {
  const { onOpen, ...rest } = props;
  return (
    <PipelineBoard<TenderDto>
      {...rest}
      label="Tenders by stage"
      stages={STAGES}
      stageOf={stageOf}
      amountOf={(t) => t.quotedAmount}
      rowKey={(t) => t.id}
      noun={['tender', 'tenders']}
      card={(t, money) => (
        <BoardCard
          title={
            <RecordLink href={`/tenders/${t.id}`} onOpen={() => onOpen(t.id)} strong>
              {t.title}
            </RecordLink>
          }
          lines={[<span key="no" translate="no">{[t.tenderNo, t.clientName].filter(Boolean).join(' · ')}</span>]}
          amount={t.quotedAmount ? money(t.quotedAmount) : null}
          aside={<Standing t={t} />}
        />
      )}
    />
  );
}
