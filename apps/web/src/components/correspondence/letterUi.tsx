'use client';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LetterDirection, LetterDto, LetterRefDto, LetterStatus } from '@erp/shared';
import { LETTER_DIRECTION_LABELS, LETTER_STATUS_COLORS, LETTER_STATUS_LABELS } from '@erp/shared';
import { AppTag, toneOf } from '@/components/common/AppTag';

export const DirectionTag = ({ direction }: { direction: LetterDirection }) => (
  <AppTag tone={direction === 'IN' ? 'info' : 'violet'} dot={false} style={{ margin: 0 }}>
    {LETTER_DIRECTION_LABELS[direction]}
  </AppTag>
);

export const LetterStatusTag = ({ status }: { status: LetterStatus }) => (
  <AppTag tone={toneOf(LETTER_STATUS_COLORS[status])} dot style={{ margin: 0 }}>
    {LETTER_STATUS_LABELS[status]}
  </AppTag>
);

/** A letter's own page. */
export const letterHref = (id: string) => `/correspondence/${id}`;

/** Its number, or what it is until it has one (an outward draft is numbered when issued). */
export const letterLabel = (l: Pick<LetterDto | LetterRefDto, 'letterNo'> & { status?: LetterStatus }) => l.letterNo ?? (l.status === 'AWAITING_APPROVAL' ? LETTER_STATUS_LABELS.AWAITING_APPROVAL : LETTER_STATUS_LABELS.DRAFT);

/** Everything that shows letters: the registers, the record, My work, the documents and delay counts. */
export function useInvalidateLetters() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['letters', 'documents', 'risks', 'dashboard', 'notifications']) qc.invalidateQueries({ queryKey: [k] });
  };
}
