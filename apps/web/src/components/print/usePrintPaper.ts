'use client';

import { App } from 'antd';
import type { LetterheadDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLetterhead } from '@/lib/queries';
import { letterheadOr, POPUP_BLOCKED } from './printDoc';

/**
 * Prints a paper on the company's letterhead: loads the letterhead with the record, so the click opens the window at
 * once (a pop-up opened after a wait is blocked), and says so when the browser blocks it anyway.
 */
export function usePrintPaper() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { data } = useLetterhead();
  return (open: (letterhead: LetterheadDto) => boolean) => {
    if (!open(letterheadOr(data, user?.organizationName ?? ''))) message.warning(POPUP_BLOCKED);
  };
}
