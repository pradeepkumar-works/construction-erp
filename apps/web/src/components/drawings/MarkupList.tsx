'use client';

import { revLabel } from '@/components/documents/docUi';
import React, { useEffect } from 'react';
import { App, Button, Empty, Flex, Form, Input, Segmented, Space, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CheckOutlined, DeleteOutlined, QuestionCircleOutlined, UndoOutlined } from '@/components/common/icons';
import Link from 'next/link';
import type { DrawingMarkupDto, MarkupKind } from '@erp/shared';
import { MARKUP_KIND_LABELS, MARKUP_NOTE_MAX, canEditMarkup } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { FormShell } from '@/components/form/FormShell';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { MARKUP_INK } from './MarkupLayer';

export type ListScope = 'sheet' | 'all';

/**
 * The marks beside the drawing (item 109): this sheet's own and the open ones carried from earlier revisions, or every
 * mark on the drawing. Picking one shows it on the sheet; its maker and document control resolve or delete it, and
 * anyone can raise an RFI from it.
 */
export function MarkupList({
  marks,
  carriedIds,
  scope,
  onScope,
  selectedId,
  onPick,
  onResolve,
  onReopen,
  onDelete,
  onRaiseRfi,
}: {
  marks: DrawingMarkupDto[];
  carriedIds: Set<string>;
  scope: ListScope;
  onScope: (s: ListScope) => void;
  selectedId: string | null;
  onPick: (m: DrawingMarkupDto) => void;
  onResolve: (m: DrawingMarkupDto) => void;
  onReopen: (m: DrawingMarkupDto) => void;
  onDelete: (m: DrawingMarkupDto) => Promise<unknown>;
  onRaiseRfi: (m: DrawingMarkupDto) => void;
}) {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const open = marks.filter((m) => m.status === 'OPEN').length;
  return (
    <Flex vertical gap={token.marginSM}>
      <Flex justify="space-between" align="center" wrap gap={token.marginXS}>
        <Typography.Title level={2} style={{ fontSize: themeFontSize('fontSizeLG'), margin: 0 }}>
          Marks{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400 }} translate="no">
            {open} open
          </Typography.Text>
        </Typography.Title>
        <Segmented
          size="small"
          value={scope}
          onChange={(v) => onScope(v as ListScope)}
          options={[
            { value: 'sheet', label: 'This sheet' },
            { value: 'all', label: 'Whole drawing' },
          ]}
          aria-label="Which marks to list"
        />
      </Flex>
      {!marks.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={scope === 'sheet' ? 'No marks on this sheet yet. Pick a tool above and draw on the drawing.' : 'No marks on this drawing yet.'} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: token.marginXS }} aria-label="Marks">
          {marks.map((m) => {
            const mine = m.createdById === user?.id;
            const edit = !!user && canEditMarkup(user.roleKey, mine);
            const selected = m.id === selectedId;
            return (
              <li
                key={m.id}
                style={{
                  border: `1px solid ${selected ? token.colorPrimary : token.colorBorderSecondary}`,
                  borderRadius: token.borderRadiusLG,
                  padding: token.paddingSM,
                  background: selected ? token.colorPrimaryBg : token.colorBgContainer,
                }}
              >
                <button
                  type="button"
                  onClick={() => onPick(m)}
                  aria-current={selected || undefined}
                  style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', minHeight: 44, boxSizing: 'border-box' }}
                >
                  <Space size={6} wrap>
                    <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: MARKUP_INK[m.color] }} />
                    <Typography.Text strong translate="no">
                      M{m.markupNo}
                    </Typography.Text>
                    <Typography.Text type="secondary">{MARKUP_KIND_LABELS[m.kind]}</Typography.Text>
                    {m.status === 'RESOLVED' ? <AppTag tone="success">Resolved</AppTag> : null}
                    {carriedIds.has(m.id) || scope === 'all' ? (
                      <AppTag translate="no" style={{ margin: 0 }}>
                        {revLabel(m.revision)}
                        {m.page > 1 ? `, p ${m.page}` : ''}
                      </AppTag>
                    ) : null}
                  </Space>
                  {m.note ? <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.note}</div> : null}
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 2 }}>
                    {m.createdByName} · {formatDate(m.createdAt)}
                    {m.status === 'RESOLVED' && m.resolvedByName ? ` · resolved by ${m.resolvedByName}${m.resolvedNote ? `: ${m.resolvedNote}` : ''}` : ''}
                  </div>
                </button>
                <Space size={4} wrap style={{ marginTop: 6 }}>
                  {m.rfiId ? (
                    <Link href={`/documents?tab=rfis&rfi=${m.rfiId}`} translate="no">
                      {m.rfiNo}
                    </Link>
                  ) : m.status === 'OPEN' ? (
                    <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => onRaiseRfi(m)}>
                      Raise RFI
                    </Button>
                  ) : null}
                  {edit && m.status === 'OPEN' ? (
                    <Button size="small" icon={<CheckOutlined />} onClick={() => onResolve(m)}>
                      Resolve
                    </Button>
                  ) : null}
                  {edit && m.status === 'RESOLVED' ? (
                    <Button size="small" icon={<UndoOutlined />} onClick={() => onReopen(m)}>
                      Reopen
                    </Button>
                  ) : null}
                  {edit ? (
                    <ConfirmDelete what={`mark M${m.markupNo}`} onConfirm={() => onDelete(m)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete mark M${m.markupNo}`} />
                    </ConfirmDelete>
                  ) : null}
                </Space>
              </li>
            );
          })}
        </ul>
      )}
    </Flex>
  );
}

/** The comment on a new mark: needed on a comment pin and as the words of a text mark, optional on the others. */
export function MarkupNoteForm({ kind, open, onClose, onSubmit }: { kind: MarkupKind | null; open: boolean; onClose: () => void; onSubmit: (note: string | null) => Promise<unknown> }) {
  const [form] = Form.useForm<{ note?: string }>();
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const required = kind === 'PIN' || kind === 'TEXT';
  const title = kind === 'PIN' ? 'Comment on the drawing' : kind === 'TEXT' ? 'Text on the drawing' : `${kind ? MARKUP_KIND_LABELS[kind] : 'Mark'}: comment`;
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={480} title={title} okText="Save mark" onSubmit={(v) => onSubmit(v.note?.trim() || null)}>
      <Form form={form} layout="vertical">
        <Form.Item
          name="note"
          label={kind === 'TEXT' ? 'Text' : required ? 'Comment' : 'Comment (optional)'}
          rules={required ? [{ required: true, whitespace: true, message: kind === 'TEXT' ? 'Write the text to put on the drawing' : 'Write the comment, e.g. what to check or change' }] : []}
        >
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog that just opened, as the dialog pattern asks */}
          <Input.TextArea rows={3} maxLength={MARKUP_NOTE_MAX} showCount autoFocus placeholder={kind === 'TEXT' ? 'e.g. Sleeve 100 mm dia' : 'e.g. Level differs from the structural drawing'} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Resolving a mark, with what was done about it. */
export function ResolveMarkupForm({ mark, onClose, onSubmit }: { mark: DrawingMarkupDto | null; onClose: () => void; onSubmit: (note: string | null) => Promise<unknown> }) {
  const [form] = Form.useForm<{ note?: string }>();
  const { message } = App.useApp();
  useEffect(() => {
    if (mark) form.resetFields();
  }, [mark, form]);
  return (
    <FormShell
      open={!!mark}
      onClose={onClose}
      form={form}
      layout="modal"
      width={480}
      title={mark ? `Resolve M${mark.markupNo}` : 'Resolve'}
      okText="Resolve"
      onSubmit={async (v) => {
        await onSubmit(v.note?.trim() || null);
        message.success(`M${mark?.markupNo} resolved`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="What was done (optional)" extra="A resolved mark is no longer carried onto later revisions.">
          <Input.TextArea rows={3} maxLength={MARKUP_NOTE_MAX} placeholder="e.g. Corrected on Rev R2, or checked at site" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
