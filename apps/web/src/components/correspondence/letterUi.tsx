'use client';

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LetterDirection, LetterDto, LetterRefDto, LetterStatus } from '@erp/shared';
import { LETTER_DIRECTION_LABELS, LETTER_STATUS_LABELS, letterStatusLabel } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';

export const DirectionTag = ({ direction }: { direction: LetterDirection }) => (
  <AppTag variant="kind" style={{ margin: 0 }}>
    {LETTER_DIRECTION_LABELS[direction]}
  </AppTag>
);

/** A letter's state; one waiting for approval says whether it waits for the signature or the seal. */
export const LetterStatusTag = ({ letter }: { letter: Pick<LetterDto, 'status' | 'signedAt'> }) => (
  <AppTag kind="letter" status={letter.status} style={{ margin: 0 }}>
    {letterStatusLabel(letter)}
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
