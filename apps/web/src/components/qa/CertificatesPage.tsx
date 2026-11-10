'use client';

import React, { useState } from 'react';
import { TitleHelp } from '@/components/common/Help';
import { Button, Card, Flex, Select, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CertificateMissingDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useCertificateCategories, useCertificatesMissing, useMasterList } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { AppTag } from '@/components/common/AppTag';
import { EmptyArt } from '@/components/common/EmptyArt';
import { RecordLink } from '@/components/record/RecordLink';
import { StockEntryDrawer } from '@/components/stock/StockEntryDrawer';

/** Which item categories need the maker's test certificate; QA/QC and the project manager change it. */
function CategoryChooser() {
  const notify = useNotify();
  const qc = useQueryClient();
  const { data } = useCertificateCategories();
  const list = useMasterList('item-category');
  // What was picked here; until something is, the saved categories.
  const [picked, setPicked] = useState<string[] | null>(null);
  const save = useMutation({
    mutationFn: async (categories: string[]) => (await api.put('/qa/certificate-categories', { categories })).data,
    onSuccess: () => {
      setPicked(null);
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved('Categories saved');
    },
    meta: FAIL_NOTICE,
  });
  if (!data) return null;
  const chosen = picked ?? data.categories;
  const names = new Map((list.data?.entries ?? []).map((e) => [e.code, e.name]));
  const changed = chosen.slice().sort().join('|') !== data.categories.slice().sort().join('|');
  return (
    <Card title={<TitleHelp help={<>A GRN with an item in one of these categories waits on this page until the manufacturer&apos;s test certificate (MTC) number is entered on its QA/QC check.</>}>Material that needs a certificate</TitleHelp>} style={{ marginBottom: tk.space[4] }}>
      {data.canEdit ? (
        <Flex gap={tk.space[3]} wrap align="center">
          <Select
            mode="multiple"
            aria-label="Item categories that need a certificate"
            value={chosen}
            onChange={setPicked}
            style={{ flex: '1 1 320px', minWidth: 0 }}
            loading={list.isLoading}
            showSearch={{ optionFilterProp: 'label' }}
            options={(list.data?.entries ?? []).filter((e) => e.isActive || chosen.includes(e.code)).map((e) => ({ value: e.code, label: e.name }))}
          />
          <Button type="primary" disabled={!changed} loading={save.isPending} onClick={() => save.mutate(chosen)}>
            Save
          </Button>
        </Flex>
      ) : (
        <Flex gap={tk.space[2]} wrap>
          {data.categories.length ? data.categories.map((c) => <AppTag variant="kind" key={c}>{names.get(c) ?? c}</AppTag>) : <Typography.Text type="secondary">None chosen</Typography.Text>}
        </Flex>
      )}
    </Card>
  );
}

/** Test certificates: receipts of steel, cement, pipes… that came without the maker's test certificate. */
export function CertificatesPage() {
  const [projectId, setProjectId] = useProjectScope();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useCertificatesMissing(projectId);

  if (isLoading && !data) return <PageSkeleton shape="list" />;

  return (
    <div className="page-container">
      <PageHeader
        title="Test certificates"
        help="GRNs of material that needs the manufacturer's test certificate (MTC) and came without one, newest first."
        crumbs={[{ title: 'Quality', href: '/modules/quality' }, { title: 'Test certificates' }]}
      />
      <CategoryChooser />
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      <Card title="Waiting for a certificate">
        <Flex gap={tk.space[3]} wrap style={{ marginBottom: tk.space[4] }}>
          <ProjectSelect allowClear placeholder="All projects" aria-label="Project" value={projectId} onChange={setProjectId} style={{ width: 220 }} />
        </Flex>
        <Table<CertificateMissingDto>
          rowKey="id"
          size="middle"
          dataSource={data ?? []}
          scroll={{ x: 860 }}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          rowClassName={() => 'row-click'}
          onRow={(r) => ({ onClick: () => setOpenId(r.id) })}
          locale={{ emptyText: <EmptyArt art="entries" title="Every receipt that needs a certificate has one" /> }}
          columns={[
            { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
            {
              title: 'GRN',
              key: 'entry',
              render: (_, r) => (
                <Flex vertical gap={2}>
                  <RecordLink onOpen={() => setOpenId(r.id)}>
                    <span translate="no">{r.entryNo}</span>
                  </RecordLink>
                  <Typography.Text type="secondary">{r.projectName}</Typography.Text>
                </Flex>
              ),
            },
            { title: 'Supplier', dataIndex: 'supplier', width: 200, render: (v: string | null) => <span translate="no">{v ?? '-'}</span> },
            { title: 'Items', key: 'items', render: (_, r) => r.items.join(', ') },
            {
              title: 'QA/QC',
              dataIndex: 'checked',
              width: 160,
              render: (v: boolean) => (v ? <AppTag meaning="waiting">Accepted without it</AppTag> : <AppTag meaning="closed">Not checked</AppTag>),
            },
          ]}
        />
      </Card>
      <StockEntryDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
