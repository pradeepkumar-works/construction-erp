'use client';

import React from 'react';
import { SUBMISSION_STATUS_LABELS, toNumber, unitLabel, type BoardStage, type MaterialRequestDto } from '@erp/shared';
import { formatQty, timeAgo } from '@/lib/format';
import { DueCell } from '@/components/list/DueCell';
import { RecordLink } from '@/components/record/RecordLink';
import { BoardCard, PipelineBoard, type BoardListProps } from '@/components/boards/PipelineBoard';

/** Where an indent stands, from its lines: waiting for approval, approved with nothing ordered, ordered, then all in. */
const STAGES: BoardStage[] = [
  { key: 'APPROVAL', label: SUBMISSION_STATUS_LABELS.SUBMITTED },
  { key: 'TO_ORDER', label: 'To order' },
  { key: 'ORDERED', label: 'Ordered, to receive' },
  { key: 'RECEIVED', label: 'Received' },
];

/** A draft, a rejected indent or one sent back is left to the table. A line met from stock counts as received. */
function stageOf(r: MaterialRequestDto) {
  if (r.status === 'SUBMITTED') return 'APPROVAL';
  if (r.status !== 'APPROVED') return null;
  if (r.items.every((i) => toNumber(i.receivedQty) + toNumber(i.coveredQty) >= toNumber(i.quantity))) return 'RECEIVED';
  return r.items.some((i) => toNumber(i.orderedQty) > 0) ? 'ORDERED' : 'TO_ORDER';
}

function firstItem(r: MaterialRequestDto) {
  const [first] = r.items;
  if (!first) return null;
  const more = r.items.length > 1 ? ` +${r.items.length - 1} more` : '';
  return `${first.itemName} · ${formatQty(first.quantity)} ${unitLabel(first.unit)}${more}`;
}

export function MrBoard(props: BoardListProps<MaterialRequestDto> & { showProject: boolean; onOpen: (id: string) => void }) {
  const { onOpen, showProject, ...rest } = props;
  return (
    <PipelineBoard<MaterialRequestDto>
      {...rest}
      label="Indents by stage"
      stages={STAGES}
      stageOf={stageOf}
      rowKey={(r) => r.id}
      noun={['indent', 'indents']}
      card={(r) => (
        <BoardCard
          title={
            <RecordLink href={`/material-requests/${r.id}`} onOpen={() => onOpen(r.id)} className="mono">
              {r.requestNo}
            </RecordLink>
          }
          lines={[
            showProject ? <span key="project" translate="no">{r.projectName}</span> : null,
            firstItem(r),
            `Raised ${timeAgo(r.submittedAt ?? r.createdAt)}`,
          ]}
          aside={<DueCell date={r.requiredDate} done={stageOf(r) === 'RECEIVED'} />}
        />
      )}
    />
  );
}
