'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Checkbox, Flex, Input, Segmented, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { EDITION_STATE_LABELS, IS_DISCIPLINES, IS_DISCIPLINE_LABELS, canManageQaPlan, figure, isStandardLabel, type IsDiscipline, type IsStandardDto } from '@erp/shared';
import { useIsStandards } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTag } from '@/components/common/AppTag';
import { PlusOutlined } from '@/components/common/icons';
import { Figures } from '@/components/figures';
import { IsStandardForm } from './IsStandardForm';

type DisciplineFilter = IsDiscipline | 'ALL';

/** Where the company's edition stands: never checked, check due, or checked on a day. */
export function EditionTag({ s }: { s: Pick<IsStandardDto, 'edition' | 'checkedOn'> }) {
  return (
    <AppTag kind="edition" status={s.edition}>
      {s.edition === 'CURRENT' && s.checkedOn ? `Checked ${formatDate(s.checkedOn)}` : EDITION_STATE_LABELS[s.edition]}
    </AppTag>
  );
}

/** The company's standard, its own or a copy it changed, or one it no longer tracks. */
export function OriginTags({ s }: { s: Pick<IsStandardDto, 'standard' | 'changed' | 'active'> }) {
  return (
    <>
      {!s.standard ? <AppTag variant="kind">Company's own</AppTag> : s.changed ? <AppTag variant="kind">Changed from catalogue</AppTag> : null}
      {!s.active ? <AppTag meaning="closed">Not tracked</AppTag> : null}
    </>
  );
}

/** The library of Indian Standards: what the company works to, by discipline, and whether each edition was checked lately. */
export function IsStandardsPage() {
  const { user } = useAuth();
  const manage = !!user && canManageQaPlan(user.roleKey);
  const { data, isLoading, error, refetch } = useIsStandards();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<IsStandardDto | 'new' | null>(null);
  const discipline = (IS_DISCIPLINES as readonly string[]).includes(params.get('discipline') ?? '') ? (params.get('discipline') as IsDiscipline) : 'ALL';
  const dueOnly = params.get('edition') === 'due';
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data ?? []).filter(
      (s) =>
        (all || s.active) &&
        (discipline === 'ALL' || s.discipline === discipline) &&
        (!dueOnly || s.edition !== 'CURRENT') &&
        (!k || `${s.number} ${s.year} ${s.title} ${s.subject} ${s.clauses.map((c) => `${c.ref ?? ''} ${c.title}`).join(' ')}`.toLowerCase().includes(k)),
    );
  }, [data, q, all, discipline, dueOnly]);

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const tracked = data.filter((s) => s.active);
  const figures = [figure('standardsTracked', tracked.length), figure('editionsToCheck', tracked.filter((s) => s.edition !== 'CURRENT').length)];

  return (
    <div className="page-container">
      <PageHeader
        title="IS standards"
        help="The Indian Standards the company works to, each clause with the test, certificate or inspection that proves it."
        extra={
          manage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New standard
            </Button>
          ) : undefined
        }
      />
      <div style={{ marginBottom: tk.space[4] }}>
        <Figures label="Library figures" figures={figures} />
      </div>
      <Card>
        <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
          <Input.Search allowClear placeholder="Find a standard or clause" aria-label="Find a standard or clause" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <Segmented<DisciplineFilter>
            aria-label="Discipline"
            value={discipline}
            onChange={(v) => setParam('discipline', v === 'ALL' ? null : v)}
            options={[{ value: 'ALL', label: 'All' }, ...IS_DISCIPLINES.map((d) => ({ value: d, label: IS_DISCIPLINE_LABELS[d] }))]}
          />
          <Checkbox checked={dueOnly} onChange={(e) => setParam('edition', e.target.checked ? 'due' : null)}>
            Editions to check
          </Checkbox>
          <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)}>
            Show those not tracked
          </Checkbox>
        </Flex>
        <Table<IsStandardDto>
          rowKey="code"
          size="middle"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 860 }}
          locale={{ emptyText: q || dueOnly || discipline !== 'ALL' ? 'No standard matches. Clear the search or filters.' : 'No standard tracked yet.' }}
          columns={[
            {
              title: 'Standard',
              key: 'standard',
              render: (_, s) => (
                <Flex vertical gap={2}>
                  <Flex gap={tk.space[2]} align="center" wrap>
                    <Link href={`/is-standards/${s.code}`} translate="no" style={{ fontWeight: tk.type.strong.fontWeight }}>
                      {isStandardLabel(s)}
                    </Link>
                    <OriginTags s={s} />
                  </Flex>
                  <Typography.Text type="secondary">{s.title}</Typography.Text>
                </Flex>
              ),
            },
            { title: 'Discipline', key: 'discipline', width: 130, render: (_, s) => <AppTag variant="kind">{IS_DISCIPLINE_LABELS[s.discipline]}</AppTag> },
            { title: 'Subject', dataIndex: 'subject', width: 160 },
            { title: 'Clauses', key: 'clauses', width: 90, align: 'right', render: (_, s) => <span translate="no">{s.clauses.length}</span> },
            { title: 'Edition', key: 'edition', width: 190, render: (_, s) => <EditionTag s={s} /> },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: tk.space[4], marginBottom: 0 }}>
          Clauses are the company's own summaries, not BIS's text. Check them against the copies bought from BIS, and mark each edition checked.
          {manage ? null : ' Ask QA/QC or your project manager to change the library.'}
        </Typography.Paragraph>
      </Card>
      <IsStandardForm editing={editing} onClose={() => setEditing(null)} codes={data.map((s) => s.code)} />
    </div>
  );
}
