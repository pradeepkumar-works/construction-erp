'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Flex, Typography, theme } from 'antd';
import type { FormItemProps } from 'antd';
import { EditOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { AiDraftDto, AiDraftKind } from '@erp/shared';
import { AI_DRAFT_LABELS, draftValueAt } from '@erp/shared';
import { requestNew } from '@/lib/new-intent';

/** The list page whose form each draft opens in. */
export const DRAFT_PAGES: Record<AiDraftKind, string> = {
  'material-request': '/material-requests',
  expense: '/expenses',
  progress: '/progress',
  dpr: '/dpr',
  letter: '/correspondence/outward',
};

/**
 * A form Ask Nirmaan filled in, under its answer: what it is, what to check, and Open form, which opens
 * the list's own form with the values in. Nothing is saved until the user saves the form.
 */
export function DraftCard({ draft, onNavigate }: { draft: AiDraftDto; onNavigate: () => void }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const open = () => {
    onNavigate();
    requestNew(draft.kind, () => router.push(DRAFT_PAGES[draft.kind]), draft);
  };
  return (
    <Card size="small" className="ai-draft" role="group" aria-label={`Drafted ${AI_DRAFT_LABELS[draft.kind].toLowerCase()}`} styles={{ body: { padding: `${token.paddingXS}px ${token.paddingSM}px` } }}>
      <Flex vertical gap={token.marginXXS}>
        <Typography.Text strong>{AI_DRAFT_LABELS[draft.kind]}, not saved</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          {draft.title}
        </Typography.Text>
        {draft.flags.length > 0 && (
          <Typography.Text type="warning" style={{ fontSize: token.fontSizeSM }}>
            {draft.flags.length === 1 ? '1 thing to check' : `${draft.flags.length} things to check`} when you open it
          </Typography.Text>
        )}
        <Flex>
          <Button type="primary" size="small" icon={<EditOutlined />} onClick={open}>
            Open form
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

const same = (current: unknown, drafted: unknown) => {
  const plain = (v: unknown) => (dayjs.isDayjs(v) ? v.format('YYYY-MM-DD') : v === null || v === '' ? undefined : v);
  return String(plain(current)) === String(plain(drafted));
};

/** The note on a field the draft says to check, while it still holds the drafted value. */
function noteFor(draft: AiDraftDto | null | undefined, path: string, current: unknown): string | null {
  const flag = draft?.flags.find((f) => f.field === path);
  if (!flag || !draft) return null;
  return same(current, draftValueAt(draft.values, path)) ? flag.note : null;
}

/** A labelled field's warning and help for a drafted value to check. */
export function aiFlagItem(draft: AiDraftDto | null | undefined, path: string, current: unknown): Partial<FormItemProps> {
  const note = noteFor(draft, path, current);
  return note ? { validateStatus: 'warning', help: `Check this: ${note}` } : {};
}

/** An input in a line table (no label or help): amber, with the note as its title. */
export function aiFlagInput(draft: AiDraftDto | null | undefined, path: string, current: unknown): { status?: 'warning'; title?: string } {
  const note = noteFor(draft, path, current);
  return note ? { status: 'warning', title: note } : {};
}

/** A drafted YYYY-MM-DD as the date pickers' value. */
export const draftDate = (v: unknown) => (typeof v === 'string' && v ? dayjs(v) : undefined);
