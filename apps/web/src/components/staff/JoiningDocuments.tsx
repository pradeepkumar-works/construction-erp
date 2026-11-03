'use client';

import React, { useState } from 'react';
import { App, Button, Dropdown, Flex, Form, Input, Table, Typography, Upload } from 'antd';
import type { DocumentCheckDecision, EmployeeDocumentDto, EmployeeDocumentKind } from '@erp/shared';
import { EMPLOYEE_DOCUMENT_STATE_LABELS } from '@erp/shared';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { Section } from '@/components/common/Section';
import { CheckOutlined, MoreOutlined, UploadOutlined } from '@/components/common/icons';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { FormShell } from '@/components/form/FormShell';
import { errorMessage, fileUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { uploadFile, useEmployeeChecklist, useEmployeeChecklistAction } from '@/lib/queries';

type Asking = { kind: EmployeeDocumentKind; label: string; decision: Exclude<DocumentCheckDecision, 'VERIFIED'> } | null;

/** Why a paper goes back or is not needed: one line, asked in a short form. */
function ReasonForm({ asking, onClose, onSubmit }: { asking: Asking; onClose: () => void; onSubmit: (note: string) => Promise<unknown> }) {
  const [form] = Form.useForm<{ note: string }>();
  const back = asking?.decision === 'REJECTED';
  return (
    <FormShell<{ note: string }>
      open={!!asking}
      onClose={onClose}
      form={form}
      layout="modal"
      width={480}
      projectDefault={false}
      title={asking ? (back ? `Send back ${asking.label}` : `${asking.label} not needed`) : ''}
      okText={back ? 'Send back' : 'Set aside'}
      onSubmit={(v) => onSubmit(v.note.trim())}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="note"
          label={back ? 'What is wrong with it' : 'Why it is not needed'}
          extra={back ? 'They see this and send a fresh copy.' : 'For example: a fresher, first job.'}
          rules={[{ required: true, whitespace: true, message: back ? 'Say what is wrong, so they can send a fresh copy' : 'Say why it is not needed for this person' }]}
        >
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/**
 * The joining documents: each paper with its file and HR's check. HR and the person file a copy; only HR verifies,
 * sends back or sets one aside. The offer and appointment letters wait until every required paper is done.
 */
export function JoiningDocuments({ employeeId, admin, mayFile }: { employeeId: string; admin: boolean; mayFile: boolean }) {
  const { message } = App.useApp();
  const { data, isLoading } = useEmployeeChecklist(employeeId);
  const act = useEmployeeChecklistAction(employeeId);
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState<EmployeeDocumentKind | null>(null);
  const [askRemove, removeDialog] = useConfirmDelete();

  const run = async (kind: EmployeeDocumentKind, p: Promise<unknown>, done: string) => {
    setBusy(kind);
    try {
      await p;
      message.success(done);
    } catch (err) {
      message.error(errorMessage(err, 'Could not save that. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const file = (line: EmployeeDocumentDto, f: File) =>
    run(
      line.kind,
      uploadFile(f).then((a) => act.mutateAsync({ kind: line.kind, file: a.id })),
      `${line.label} filed. HR checks it against the original.`,
    );

  const summary = data ? (
    data.letterProblem ? (
      <p style={{ margin: 0, color: tk.color.tone.pending.fg }}>
        The offer and appointment letters wait for {data.outstanding.length === 1 ? data.outstanding[0] : `${data.outstanding.length} papers`} to be verified or set aside.
      </p>
    ) : (
      <p style={{ margin: 0, color: tk.color.text.muted }}>Every required paper is verified. The offer and appointment letters can go out.</p>
    )
  ) : null;

  return (
    <Flex vertical gap={tk.space[4]}>
      <Section title="Joining documents" loading={isLoading}>
        <Flex vertical gap={tk.space[3]}>
          {summary}
          <Table<EmployeeDocumentDto>
            rowKey="kind"
            size="small"
            pagination={false}
            dataSource={data?.lines ?? []}
            scroll={{ x: 640 }}
            columns={[
              {
                title: 'Document',
                key: 'doc',
                render: (_, l) => (
                  <Flex vertical gap={2}>
                    <span>
                      {l.label}
                      {!l.required && <Typography.Text type="secondary"> (if they have one)</Typography.Text>}
                    </span>
                    <span style={{ fontSize: tk.type.caption.fontSize, color: tk.color.text.muted }}>{l.note ?? l.hint}</span>
                  </Flex>
                ),
              },
              {
                title: 'State',
                key: 'state',
                width: 170,
                render: (_, l) => (
                  <Flex vertical gap={2} align="start">
                    <AppTag kind="employeeDocument" status={l.state}>
                      {EMPLOYEE_DOCUMENT_STATE_LABELS[l.state]}
                    </AppTag>
                    {l.checkedByName && (
                      <span style={{ fontSize: tk.type.caption.fontSize, color: tk.color.text.muted }}>
                        {l.checkedByName}, {formatDate(l.checkedAt?.slice(0, 10))}
                      </span>
                    )}
                  </Flex>
                ),
              },
              {
                title: 'File',
                key: 'file',
                width: 150,
                ellipsis: true,
                render: (_, l) =>
                  l.file ? (
                    <a href={fileUrl(l.file.url)} target="_blank" rel="noreferrer" translate="no">
                      {l.file.fileName}
                    </a>
                  ) : (
                    <Typography.Text type="secondary">None</Typography.Text>
                  ),
              },
              {
                title: <span className="visually-hidden">Actions</span>,
                key: 'actions',
                width: 200,
                render: (_, l) => {
                  const canVerify = admin && (l.state === 'UPLOADED' || l.state === 'REJECTED');
                  const more = [
                    ...(admin && (l.state === 'UPLOADED' || l.state === 'VERIFIED') ? [{ key: 'back', label: 'Send back' }] : []),
                    ...(admin && l.state !== 'VERIFIED' && l.state !== 'WAIVED' ? [{ key: 'waive', label: 'Not needed' }] : []),
                    ...(admin && l.state !== 'MISSING' ? [{ key: 'remove', label: 'Remove', danger: true }] : []),
                  ];
                  return (
                    <Flex gap={tk.space[2]} justify="end" wrap>
                      {canVerify && (
                        <Button
                          size="small"
                          icon={<CheckOutlined />}
                          loading={busy === l.kind}
                          onClick={() => run(l.kind, act.mutateAsync({ kind: l.kind, decision: 'VERIFIED' }), `${l.label} verified`)}
                        >
                          Verify
                        </Button>
                      )}
                      {mayFile && l.state !== 'VERIFIED' && (
                        <Upload
                          showUploadList={false}
                          accept="image/*,application/pdf"
                          customRequest={({ file: f }) => void file(l, f as File)}
                        >
                          <Button size="small" icon={<UploadOutlined />} loading={!canVerify && busy === l.kind} aria-label={`Upload ${l.label}`}>
                            {l.file ? 'Replace' : 'Upload'}
                          </Button>
                        </Upload>
                      )}
                      {more.length > 0 && (
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: more,
                            onClick: ({ key }) => {
                              if (key === 'back') setAsking({ kind: l.kind, label: l.label, decision: 'REJECTED' });
                              if (key === 'waive') setAsking({ kind: l.kind, label: l.label, decision: 'WAIVED' });
                              if (key === 'remove')
                                askRemove({
                                  what: l.label,
                                  verb: 'Remove',
                                  description: 'It goes back to not received. Their file leaves the record.',
                                  onConfirm: () => act.mutateAsync({ kind: l.kind, remove: true }),
                                  notice: `${l.label} removed`,
                                });
                            },
                          }}
                        >
                          <Button size="small" icon={<MoreOutlined />} aria-label={`More for ${l.label}`} />
                        </Dropdown>
                      )}
                    </Flex>
                  );
                },
              },
            ]}
          />
        </Flex>
      </Section>
      <ReasonForm
        asking={asking}
        onClose={() => setAsking(null)}
        onSubmit={async (note) => {
          if (!asking) return;
          await act.mutateAsync({ kind: asking.kind, decision: asking.decision, note });
          message.success(asking.decision === 'REJECTED' ? `${asking.label} sent back` : `${asking.label} set aside`);
        }}
      />
      {removeDialog}
    </Flex>
  );
}
