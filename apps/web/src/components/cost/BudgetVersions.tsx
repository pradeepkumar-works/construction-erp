'use client';

import React, { useState } from 'react';
import { Button, Flex, Form, Input, Tooltip, Typography } from 'antd';
import { tk } from '@/ds';
import { BUDGET_STATUS_LABELS, COST_HEAD_LABELS, type BudgetAmountChangeDto, type BudgetVersionDto, type ProjectBudgetDto } from '@erp/shared';
import { useBudgetVersionSteps } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { Section } from '@/components/common/Section';
import { AppTag } from '@/components/common/AppTag';
import { Money } from '@/components/common/Money';
import { FormShell } from '@/components/form/FormShell';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';

/** "+₹23,12,400" or "−₹4,000"; nothing for no change. */
function Change({ c }: { c: BudgetAmountChangeDto }) {
  if (c.change === null || toNumber(c.change) === 0) return null;
  const n = toNumber(c.change);
  return (
    <span className="mono" translate="no" style={{ whiteSpace: 'nowrap' }}>
      {n > 0 ? '+' : '−'}
      {formatINR(Math.abs(n))}
    </span>
  );
}

const reasonOf = (v: BudgetVersionDto) => (v.versionNo === 1 ? 'First budget' : [v.reasonName, v.variationNo].filter(Boolean).join(', '));

/** Who prepared a version and who decided it, in a line. */
const whoLine = (v: BudgetVersionDto) =>
  [
    `Prepared by ${v.preparedByName}${v.submittedAt ? `, sent on ${formatDate(v.submittedAt)}` : ''}`,
    v.decidedByName && v.decidedAt ? `${v.status === 'RETURNED' ? 'returned' : 'approved'} by ${v.decidedByName} on ${formatDate(v.decidedAt)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

/** The version every figure on the tab is read from, in a line. */
export function inForceLine(b: ProjectBudgetDto): string {
  const v = b.inForce;
  if (v) return `Version ${v.versionNo} in force, approved${v.decidedByName ? ` by ${v.decidedByName}` : ''} on ${formatDate(v.approvedAt)}`;
  if (b.open) return 'No budget is approved yet, so cost against budget waits for it';
  return 'No budget yet';
}

/**
 * The version being prepared or decided: its state, why it is revised and what it changes, with the steps the caller
 * may take (edit, send, approve, return, delete).
 */
export function OpenVersionSection({ budget, onEdit }: { budget: ProjectBudgetDto; onEdit: () => void }) {
  const v = budget.open;
  const steps = useBudgetVersionSteps(budget.projectId);
  const notify = useNotify();
  const [returning, setReturning] = useState(false);
  const [noteForm] = Form.useForm<{ note: string }>();
  const [askDelete, deleteDialog] = useConfirmDelete();
  if (!v) return null;
  const headsChanged = v.change.heads.filter((h) => h.change !== null && toNumber(h.change) !== 0);

  return (
    <Section
      style={{ marginBottom: tk.space[4] }}
      title={
        <Flex gap={tk.space[2]} align="center" wrap>
          <span>Version {v.versionNo}</span>
          <AppTag kind="budget" status={v.status}>
            {BUDGET_STATUS_LABELS[v.status]}
          </AppTag>
        </Flex>
      }
    >
      <Typography.Paragraph style={{ marginBottom: tk.space[1] }}>
        {reasonOf(v)}
        {v.total ? (
          <>
            {' · '}
            <Money value={v.total} /> at completion <Change c={v.change.total} />
          </>
        ) : null}
      </Typography.Paragraph>
      {headsChanged.length ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: tk.space[1] }}>
          {headsChanged.map((h, i) => (
            <React.Fragment key={h.head}>
              {i ? ' · ' : ''}
              {COST_HEAD_LABELS[h.head]} <Change c={h} />
            </React.Fragment>
          ))}
        </Typography.Paragraph>
      ) : null}
      {v.reasonNote ? <Typography.Paragraph type="secondary" style={{ marginBottom: tk.space[1] }}>{v.reasonNote}</Typography.Paragraph> : null}
      {v.status === 'RETURNED' && v.decisionNote ? (
        <Typography.Paragraph style={{ marginBottom: tk.space[1], color: tk.color.tone.danger.fg }}>
          Returned by {v.decidedByName}: {v.decisionNote}
        </Typography.Paragraph>
      ) : null}
      <Typography.Paragraph type="secondary" style={{ fontSize: tk.type.caption.fontSize, marginBottom: tk.space[3] }}>
        {whoLine(v)}. The figures below stay on the version in force until this one is approved.
      </Typography.Paragraph>
      <Flex gap={tk.space[2]} wrap>
        {v.can.decide && (
          <>
            <Button type="primary" loading={steps.decide.isPending && steps.decide.variables?.decision === 'APPROVE'} onClick={() => steps.decide.mutateAsync({ versionId: v.id, decision: 'APPROVE' }).then(() => notify.done(`Version ${v.versionNo} approved and in force`), () => undefined)}>
              Approve
            </Button>
            <Button onClick={() => setReturning(true)}>Return</Button>
          </>
        )}
        {v.can.submit && (
          <Tooltip title={v.problem ?? undefined}>
            <Button type={v.can.decide ? 'default' : 'primary'} disabled={!!v.problem} loading={steps.submit.isPending} onClick={() => steps.submit.mutateAsync(v.id).then(() => notify.done(`Version ${v.versionNo} sent to management for approval`), () => undefined)}>
              Send for approval
            </Button>
          </Tooltip>
        )}
        {v.can.edit && <Button onClick={onEdit}>Edit</Button>}
        {v.can.delete && (
          <Button
            danger
            type="text"
            onClick={() => askDelete({ what: `version ${v.versionNo} of the budget`, description: 'The version in force stays as it is.', onConfirm: () => steps.remove.mutateAsync(v.id) })}
          >
            Delete
          </Button>
        )}
      </Flex>
      {deleteDialog}
      <FormShell
        open={returning}
        onClose={() => setReturning(false)}
        form={noteForm}
        layout="modal"
        title={`Return version ${v.versionNo}`}
        okText="Return"
        onSubmit={({ note }) => steps.decide.mutateAsync({ versionId: v.id, decision: 'RETURN', note }).then(() => notify.done(`Version ${v.versionNo} returned to ${v.preparedByName}`))}
      >
        <Form form={noteForm} layout="vertical">
          <Form.Item name="note" label="What to change" rules={[{ required: true, whitespace: true, message: 'Say what to change, so the version can be fixed and sent again' }]}>
            <Input.TextArea rows={3} maxLength={2000} placeholder="Steel is at last month's rate; use the October quotes" />
          </Form.Item>
        </Form>
      </FormShell>
    </Section>
  );
}

/** Every version of the budget, newest first: its state, reason, total and what it changed. */
export function BudgetHistorySection({ versions }: { versions: BudgetVersionDto[] }) {
  if (!versions.length) return null;
  return (
    <Section style={{ marginTop: tk.space[4] }} title="History">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {versions.map((v) => (
          <li key={v.id} style={{ padding: `${tk.space[2]} 0`, borderBottom: tk.line('base') }}>
            <Flex gap={tk.space[2]} align="baseline" wrap justify="space-between">
              <Flex gap={tk.space[2]} align="baseline" wrap>
                <Typography.Text strong>Version {v.versionNo}</Typography.Text>
                <AppTag kind="budget" status={v.status}>
                  {BUDGET_STATUS_LABELS[v.status]}
                </AppTag>
                <Typography.Text>{reasonOf(v)}</Typography.Text>
              </Flex>
              <span>
                <Money value={v.total} /> {v.versionNo > 1 ? <Change c={v.change.total} /> : null}
              </span>
            </Flex>
            {v.reasonNote ? <Typography.Paragraph type="secondary" style={{ margin: `${tk.space[1]} 0 0` }}>{v.reasonNote}</Typography.Paragraph> : null}
            <Typography.Paragraph type="secondary" style={{ fontSize: tk.type.caption.fontSize, margin: `${tk.space[1]} 0 0` }}>
              {whoLine(v)}
            </Typography.Paragraph>
          </li>
        ))}
      </ul>
    </Section>
  );
}
