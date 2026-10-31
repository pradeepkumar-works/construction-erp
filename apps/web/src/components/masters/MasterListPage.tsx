'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Flex, Form, Input, Switch, Table, Typography, theme } from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, UploadOutlined } from '@/components/common/icons';
import { masterProblem, type MasterEntryDto, type MasterListDto } from '@erp/shared';
import { useDeleteMasterEntry, useMasterList, useSaveMasterEntry } from '@/lib/queries';
import { useNotify } from '@/lib/notify';
import { downloadXlsx } from '@/lib/exportExcel';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTag } from '@/components/common/AppTag';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { ExcelImportModal } from '@/components/common/ExcelImportModal';
import { FormShell } from '@/components/form/FormShell';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface EntryForm {
  name: string;
  nameHi?: string;
}

/** The entry form: a new entry of the company's own, or a change to one (its name only while no record uses it). */
function EntryDialog({ list, slug, editing, onClose }: { list: MasterListDto; slug: string; editing: MasterEntryDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<EntryForm>();
  const save = useSaveMasterEntry(slug);
  const notify = useNotify();
  const entry = editing && editing !== 'new' ? editing : null;
  const locked = !!entry?.inUse;
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(entry ? { name: entry.name, nameHi: entry.nameHi ?? '' } : { name: '', nameHi: '' });
  }, [editing, entry, form]);
  return (
    <FormShell
      open={!!editing}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={entry ? `Edit ${entry.name}` : `New ${list.singular}`}
      okText="Save"
      onSubmit={async (v) => {
        const problem = masterProblem(v, list.entries, entry ? { code: entry.code, name: entry.name, inUse: entry.inUse ?? 0 } : null);
        if (problem) throw new Error(problem);
        const saved = await save.mutateAsync({ code: entry?.code, name: v.name.trim(), nameHi: v.nameHi?.trim() || null });
        notify.saved(`${saved.name} saved`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, whitespace: true, message: `Enter the ${list.singular}` }]}
          extra={locked ? `${entry!.inUse} record${entry!.inUse === 1 ? '' : 's'} use this name, so it stays. Add a new entry and switch this one off to change it.` : undefined}
        >
          <Input maxLength={80} disabled={locked} />
        </Form.Item>
        <Form.Item name="nameHi" label="Hindi name" extra="Shown on the phone in Hindi. Leave blank to show the English name.">
          <Input maxLength={80} lang="hi" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** A simple master list: the standard entries with the company's changes, then its own; add, rename, switch off. */
export function MasterListPage({ slug }: { slug: string }) {
  const { token } = theme.useToken();
  const { data, isLoading, error, refetch } = useMasterList(slug, true);
  const save = useSaveMasterEntry(slug);
  const remove = useDeleteMasterEntry(slug);
  const notify = useNotify();
  const [editing, setEditing] = useState<MasterEntryDto | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState('');
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data?.entries ?? []).filter((e) => !k || e.name.toLowerCase().includes(k) || (e.nameHi ?? '').includes(q.trim()));
  }, [data, q]);

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const list = data;
  const manage = list.canManage;

  const toggle = async (e: MasterEntryDto) => {
    setBusyCode(e.code);
    try {
      await save.mutateAsync({ code: e.code, isActive: !e.isActive });
      notify.success(`${e.name} ${e.isActive ? 'switched off' : 'switched on'}`);
    } catch (err) {
      notify.failed(err, () => toggle(e));
    } finally {
      setBusyCode(null);
    }
  };

  const exportList = () =>
    downloadXlsx(
      list.label,
      list.label,
      [
        { header: 'Name', value: (e: MasterEntryDto) => e.name, width: 32 },
        { header: 'Hindi name', value: (e) => e.nameHi ?? '', width: 28 },
        { header: 'Standard', value: (e) => (e.standard ? 'Yes' : 'No'), width: 10 },
        { header: 'Switched on', value: (e) => (e.isActive ? 'Yes' : 'No'), width: 12 },
        { header: 'Records', value: (e) => e.inUse ?? 0, width: 10 },
      ],
      list.entries,
    );

  return (
    <div className="page-container">
      <PageHeader
        title={list.label}
        subtitle={list.description}
        crumbs={[{ title: 'Masters', href: '/masters' }, { title: list.label }]}
        extra={
          <>
            <Button icon={<DownloadOutlined />} onClick={() => void exportList()}>
              Export
            </Button>
            {manage && (
              <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>
                Import
              </Button>
            )}
            {manage && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
                New {list.singular}
              </Button>
            )}
          </>
        }
      />
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <Input.Search allowClear placeholder={`Find a ${list.singular}`} aria-label={`Find a ${list.singular}`} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <Typography.Text type="secondary">
            {list.entries.filter((e) => e.isActive).length} of {list.entries.length} switched on. Forms suggest the ones switched on; records keep their words.
          </Typography.Text>
        </Flex>
        <Table<MasterEntryDto>
          rowKey="code"
          size="middle"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 640 }}
          columns={[
            {
              title: 'Name',
              key: 'name',
              render: (_, e) => (
                <Flex gap={token.marginXS} align="center" wrap>
                  <Typography.Text strong translate="no">
                    {e.name}
                  </Typography.Text>
                  {!e.standard && <AppTag tone="info">Own</AppTag>}
                </Flex>
              ),
            },
            { title: 'Hindi name', dataIndex: 'nameHi', render: (v: string | null) => (v ? <span lang="hi">{v}</span> : <Typography.Text type="secondary">-</Typography.Text>) },
            { title: 'Records', dataIndex: 'inUse', width: 100, align: 'right', render: (v: number | null) => <span translate="no">{v ? v : '-'}</span> },
            {
              title: 'Switched on',
              key: 'active',
              width: 120,
              render: (_, e) => <Switch size="small" checked={e.isActive} disabled={!manage} loading={busyCode === e.code} onChange={() => void toggle(e)} aria-label={`${e.name} switched on`} />,
            },
            ...(manage
              ? [
                  {
                    title: <span style={srOnly}>Actions</span>,
                    key: 'actions',
                    width: 96,
                    render: (_: unknown, e: MasterEntryDto) => (
                      <Flex gap={4}>
                        <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)} />
                        {!e.standard && !e.inUse && (
                          <ConfirmDelete what={e.name} onConfirm={() => remove.mutateAsync(e.code)}>
                            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${e.name}`} />
                          </ConfirmDelete>
                        )}
                      </Flex>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {!manage && (
          <Typography.Paragraph type="secondary" style={{ marginTop: token.margin, marginBottom: 0 }}>
            Ask an administrator to add or change {list.label.toLowerCase()}.
          </Typography.Paragraph>
        )}
      </Card>
      <EntryDialog list={list} slug={slug} editing={editing} onClose={() => setEditing(null)} />
      {manage && (
        <ExcelImportModal
          open={importing}
          onClose={() => setImporting(false)}
          title={`Import ${list.label.toLowerCase()}`}
          hint={`One ${list.singular} a row: its name, and its Hindi name if you have one. Names already in the list are left as they are.`}
          noun={list.singular}
          fields={[
            { key: 'name', label: 'Name', required: true, aliases: ['name', list.singular.replace(/\W/g, ''), 'english'] },
            { key: 'nameHi', label: 'Hindi name', required: false, aliases: ['hindiname', 'hindi', 'namehi'] },
          ]}
          template={{ fileName: `${list.label} template`, rows: [['Name', 'Hindi name'], ...list.entries.slice(0, 2).map((e) => [e.name, e.nameHi ?? ''])] }}
          check={(r) => (list.entries.some((e) => e.name.toLowerCase() === (r.name ?? '').trim().toLowerCase()) ? 'Already in the list' : masterProblem({ name: r.name ?? '', nameHi: r.nameHi }, list.entries, null))}
          onImport={async (rs) => {
            let n = 0;
            for (const r of rs) {
              await save.mutateAsync({ name: r.name.trim(), nameHi: r.nameHi?.trim() || null });
              n++;
            }
            notify.saved(`${n} ${n === 1 ? list.singular : list.label.toLowerCase()} added`);
          }}
        />
      )}
    </div>
  );
}
