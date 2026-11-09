'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Descriptions, Flex, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tk } from '@/ds';
import {
  BIS_STANDARDS_SEARCH_URL,
  IS_CLAUSE_CHECK_LABELS,
  IS_DISCIPLINE_LABELS,
  canManageQaPlan,
  canRecordTest,
  isStandardLabel,
  specRange,
  type IsClauseDef,
  type IsStandardDto,
  type TestTypeDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useIsStandard, useIsStandards, useTestTypes } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { LinkButton } from '@/components/common/LinkButton';
import { AppTag } from '@/components/common/AppTag';
import { CheckOutlined, DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined, UndoOutlined } from '@/components/common/icons';
import { MoreActions } from '@/components/record/MoreActions';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { TestFormModal, type TestPrefill } from '@/components/quality/TestFormModal';
import { IsStandardForm } from './IsStandardForm';
import { EditionTag, OriginTags } from './IsStandardsPage';

const limitsOf = (t: TestTypeDto | undefined) => (t ? specRange(t.specMin === null ? null : String(t.specMin), t.specMax === null ? null : String(t.specMax), t.unit) : null);

/** One clause: what it asks, how it is proved, how often and what is allowed, with the step that proves it. */
function Clause({ s, c, types, mayTest, onTest }: { s: IsStandardDto; c: IsClauseDef; types: TestTypeDto[]; mayTest: boolean; onTest: (p: TestPrefill) => void }) {
  const check = c.check;
  const type = check.by === 'TEST' ? types.find((t) => t.code === check.testTypeCode) : undefined;
  const name = `${isStandardLabel(s)}${c.ref ? ` cl. ${c.ref}` : ''}`;
  const action =
    c.check.by === 'TEST' ? (
      mayTest && type ? (
        <Button size="small" icon={<PlusOutlined />} onClick={() => onTest({ testTypeCode: type.code, note: `For ${name}: ${c.title}` })}>
          Record test
        </Button>
      ) : null
    ) : c.check.by === 'CERTIFICATE' ? (
      <LinkButton size="small" href="/test-certificates">
        Test certificates
      </LinkButton>
    ) : (
      <LinkButton size="small" href="/inspections?tab=inspections">
        Inspections
      </LinkButton>
    );
  return (
    <Section
      title={
        <span>
          {c.ref ? (
            <span translate="no" style={{ color: tk.color.text.muted, marginRight: tk.space[2] }}>
              {c.ref}
            </span>
          ) : null}
          {c.title}
        </span>
      }
      extra={action}
    >
      <Typography.Paragraph style={{ marginBottom: tk.space[3] }}>{c.requirement}</Typography.Paragraph>
      <Descriptions
        size="small"
        column={{ xs: 1, md: 3 }}
        items={[
          {
            key: 'by',
            label: 'Proved by',
            children: type ? (
              <span>
                {type.name}
                {type.method ? <span translate="no">{` (${type.method})`}</span> : null}
              </span>
            ) : c.check.by === 'TEST' ? (
              'A test no longer in use'
            ) : (
              IS_CLAUSE_CHECK_LABELS[c.check.by]
            ),
          },
          { key: 'sampling', label: 'How often', children: c.sampling ?? 'As the quality plan sets' },
          { key: 'tolerance', label: 'Allowed', children: <span translate="no">{c.tolerance ?? limitsOf(type) ?? '-'}</span> },
        ]}
      />
    </Section>
  );
}

/** One Indian Standard: its clauses in order, each with how it is proved, and its edition's check against BIS. */
export function IsStandardPage({ code }: { code: string }) {
  const { user } = useAuth();
  const manage = !!user && canManageQaPlan(user.roleKey);
  const mayTest = !!user && canRecordTest(user.roleKey);
  const { data, isLoading, error, refetch } = useIsStandard(code);
  const { data: all } = useIsStandards();
  const { data: types } = useTestTypes(true);
  const qc = useQueryClient();
  const notify = useNotify();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [prefill, setPrefill] = useState<TestPrefill | null>(null);
  const checked = useMutation({
    mutationFn: async () => (await api.post<IsStandardDto>(`/is-standards/${encodeURIComponent(code)}/checked`)).data,
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['quality', 'is-standards'] });
      notify.success(`${isStandardLabel(s)} marked checked today`);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/is-standards/${encodeURIComponent(code)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality', 'is-standards'] }),
  });

  if (isLoading) return <PageSkeleton shape="record" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const label = isStandardLabel(data);

  const more = manage
    ? data.changed
      ? [{ key: 'reset', label: 'Put back as shipped', icon: <UndoOutlined />, onSelect: () => askDelete({ what: `your changes to ${label}`, verb: 'Remove', description: 'It goes back to the catalogue, and its edition check with it.', notice: `${label} is back as shipped`, onConfirm: () => remove.mutateAsync() }) }]
      : !data.standard
        ? [{ key: 'delete', label: 'Delete', icon: <DeleteOutlined />, danger: true, onSelect: () => askDelete({ what: label, description: 'Tests keep their test types; only the library entry goes.', onConfirm: () => remove.mutateAsync(), onDone: () => router.push('/is-standards') }) }]
        : []
    : [];

  return (
    <div className="page-container">
      <PageHeader
        title={<span translate="no">{label}</span>}
        docTitle={label}
        subtitle={data.title}
        crumbs={[{ title: 'IS standards', href: '/is-standards' }, { title: data.number }]}
        extra={
          <Flex gap={tk.space[2]} wrap>
            <Button icon={<ExportOutlined />} href={BIS_STANDARDS_SEARCH_URL} target="_blank" rel="noreferrer" aria-label={`Find ${data.number} on BIS (opens in a new tab)`}>
              Find on BIS
            </Button>
            {manage ? (
              <Button icon={<CheckOutlined />} loading={checked.isPending} onClick={() => checked.mutate()}>
                Mark checked
              </Button>
            ) : null}
            {manage ? (
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {more.length ? <MoreActions size="middle" items={more} /> : null}
          </Flex>
        }
      />
      <Card>
        <Flex gap={tk.space[2]} wrap style={{ marginBottom: tk.space[4] }}>
          <AppTag variant="kind">{IS_DISCIPLINE_LABELS[data.discipline]}</AppTag>
          <EditionTag s={data} />
          <OriginTags s={data} />
        </Flex>
        <Descriptions
          size="small"
          column={{ xs: 1, md: 3 }}
          style={{ marginBottom: tk.space[4] }}
          items={[
            { key: 'subject', label: 'Subject', children: data.subject },
            { key: 'reaffirmed', label: 'Reaffirmed', children: data.reaffirmed ? <span translate="no">{data.reaffirmed}</span> : 'Not recorded' },
            {
              key: 'checked',
              label: 'Edition checked',
              children: data.checkedOn ? `${formatDate(data.checkedOn)}${data.checkedByName ? ` by ${data.checkedByName}` : ''}` : `Never. Search BIS for ${data.number} and mark it checked.`,
            },
          ]}
        />
        {data.clauses.length ? (
          <Flex vertical gap={tk.space[4]}>
            {data.clauses.map((c, i) => (
              <Clause key={`${c.ref ?? ''}-${i}`} s={data} c={c} types={types ?? []} mayTest={mayTest} onTest={setPrefill} />
            ))}
          </Flex>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            No clauses yet. {manage ? 'Edit the standard to add the ones site checks.' : 'Ask QA/QC to add the ones site checks.'}
          </Typography.Paragraph>
        )}
      </Card>
      <IsStandardForm editing={editing ? data : null} onClose={() => setEditing(false)} codes={(all ?? []).map((s) => s.code)} />
      <TestFormModal open={!!prefill} onClose={() => setPrefill(null)} prefill={prefill} />
      {deleteDialog}
    </div>
  );
}
