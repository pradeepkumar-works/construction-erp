'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Button, Col, Empty, Row, Segmented, Skeleton, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { EditOutlined, PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import type { PpeIssueDto, PpeKind, PpeWorkerDto } from '@erp/shared';
import { PPE_ISSUE_STATUS_LABELS, PPE_KIND_LABELS, canEditSafetyRecord } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDeletePpe, usePpeIssues, usePpeRegister } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { downloadWorkbook, exportFileName, workbookSheet } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { Section } from '@/components/common/Section';
import { ClosePpeModal, IssuePpeModal, RequiredKitModal } from './PpeForms';

type Show = 'all' | 'missing' | 'present' | 'due';
const RED = themeColor('colorErrorText');
const big = (color?: string) => ({ content: { fontSize: themeFontSize('fontSizeXL'), color } });
const STATUS_COLOR: Record<PpeIssueDto['status'], string> = { ISSUED: 'blue', RETURNED: 'default', REPLACED: 'default', LOST: 'error' };

interface CloseTarget {
  id: string;
  kind: PpeKind;
  workerName: string;
  issuedOn: string;
}

/**
 * PPE register: each worker at a project against the kit it requires, who is on site today without it, what is due
 * for replacement, kit still out with workers who left, totals by contractor and every issue. A tab of Safety.
 */
export function PpePanel({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const [scoped, setScoped] = useProjectScope();
  const projectId = fixedProject ?? scoped;
  const { data: reg, isLoading, error, refetch } = usePpeRegister(projectId);
  const [show, setShow] = useState<Show>('all');
  const [issueOpen, setIssueOpen] = useState(false);
  const [preset, setPreset] = useState<{ workerIds: string[]; kinds: PpeKind[] } | undefined>();
  const [requiredOpen, setRequiredOpen] = useState(false);
  const [closing, setClosing] = useState<CloseTarget | null>(null);
  const [page, setPage] = useState(1);
  const history = usePpeIssues({ projectId, page, pageSize: 20 }, !!projectId);
  const remove = useDeletePpe();

  const rows = useMemo(() => {
    const all = reg?.workers ?? [];
    if (show === 'missing') return all.filter((w) => w.missing.length);
    if (show === 'present') return all.filter((w) => w.presentToday && w.missing.length);
    if (show === 'due') return all.filter((w) => w.holding.some((h) => h.due));
    return all;
  }, [reg, show]);

  const openIssue = (p?: { workerIds: string[]; kinds: PpeKind[] }) => {
    setPreset(p);
    setIssueOpen(true);
  };

  const picker = fixedProject ? null : <ProjectSelect value={scoped} onChange={(v) => setScoped(v)} placeholder="Choose a project" style={{ minWidth: 260 }} />;
  if (!projectId)
    return (
      <div style={{ padding: 16 }}>
        {picker}
        <Empty style={{ marginTop: 24 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description="Choose a project to see who has which PPE" />
      </div>
    );

  const exportExcel = () => {
    if (!reg) return;
    const kitCols = reg.required.map((k) => ({
      header: PPE_KIND_LABELS[k],
      value: (w: PpeWorkerDto) => {
        const h = w.holding.find((x) => x.kind === k);
        return h ? `${h.issuedOn}${h.due ? ' (due)' : ''}` : 'Missing';
      },
      width: 18,
    }));
    void downloadWorkbook(exportFileName(`ppe-register-${reg.projectCode}`), [
      workbookSheet<PpeWorkerDto>(
        'Register',
        [
          { header: 'Worker no.', value: (w) => w.workerNo },
          { header: 'Name', value: (w) => w.name, width: 24 },
          { header: 'Trade', value: (w) => w.trade },
          { header: 'Contractor', value: (w) => w.contractor, width: 28 },
          { header: 'On site today', value: (w) => (w.presentToday === null ? '' : w.presentToday ? 'Yes' : 'No') },
          ...kitCols,
          { header: 'Missing', value: (w) => w.missing.map((k) => PPE_KIND_LABELS[k]).join(', '), width: 30 },
        ],
        reg.workers,
      ),
      workbookSheet<PpeIssueDto>(
        'Issues',
        [
          { header: 'Issued on', value: (r) => r.issuedOn },
          { header: 'Worker', value: (r) => `${r.workerName} (${r.workerNo})`, width: 28 },
          { header: 'Contractor', value: (r) => r.contractor, width: 28 },
          { header: 'Item', value: (r) => PPE_KIND_LABELS[r.kind], width: 18 },
          { header: 'Size', value: (r) => r.size },
          { header: 'Replace by', value: (r) => r.replaceBy },
          { header: 'Status', value: (r) => PPE_ISSUE_STATUS_LABELS[r.status], width: 16 },
          { header: 'Closed on', value: (r) => r.closedOn },
          { header: 'Recover from contractor', value: (r) => (r.recoverable ? 'Yes' : '') },
          { header: 'Note', value: (r) => [r.note, r.closeNote].filter(Boolean).join(' · '), width: 30 },
          { header: 'Issued by', value: (r) => r.issuedByName, width: 20 },
        ],
        history.data?.items ?? [],
      ),
    ]);
  };

  const kitCell = (w: PpeWorkerDto, k: PpeKind) => {
    const h = w.holding.find((x) => x.kind === k);
    if (!h)
      return (
        <Tag color="error" style={{ margin: 0 }}>
          Missing
        </Tag>
      );
    return (
      <span className="mono" translate="no">
        {formatDate(h.issuedOn)}
        {h.due ? (
          <Tooltip title={`Due for replacement since ${formatDate(h.replaceBy)}`}>
            <Tag color="warning" style={{ marginLeft: 6 }}>
              Due
            </Tag>
          </Tooltip>
        ) : null}
      </span>
    );
  };

  const workerColumns: TableProps<PpeWorkerDto>['columns'] = [
    {
      title: 'Worker',
      dataIndex: 'name',
      fixed: 'left',
      width: 200,
      render: (v: string, w) => (
        <div>
          {v}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            <span translate="no">{w.workerNo}</span> · {w.trade}
          </div>
        </div>
      ),
    },
    { title: 'Contractor', dataIndex: 'contractor', width: 200, ellipsis: true },
    {
      title: 'Today',
      dataIndex: 'presentToday',
      width: 100,
      render: (v: boolean | null) => (v === null ? <span className="text-muted">-</span> : v ? 'On site' : <span className="text-muted">Absent</span>),
    },
    ...(reg?.required ?? []).map((k) => ({ title: PPE_KIND_LABELS[k], key: k, width: 170, render: (_: unknown, w: PpeWorkerDto) => kitCell(w, k) })),
    {
      title: 'Other kit',
      key: 'other',
      width: 200,
      render: (_: unknown, w: PpeWorkerDto) => {
        const extra = w.holding.filter((h) => !reg?.required.includes(h.kind));
        return extra.length ? (
          <Space size={4} wrap>
            {extra.map((h) => (
              <Tag key={h.kind} color={h.due ? 'warning' : undefined} style={{ margin: 0 }}>
                {PPE_KIND_LABELS[h.kind]}
                {h.due ? ' · due' : ''}
              </Tag>
            ))}
          </Space>
        ) : (
          <span className="text-muted">-</span>
        );
      },
    },
    ...(reg?.canIssue
      ? [
          {
            title: '',
            key: 'actions',
            width: 90,
            render: (_: unknown, w: PpeWorkerDto) => {
              const kinds = [...w.missing, ...w.holding.filter((h) => h.due).map((h) => h.kind)];
              return (
                <Button size="small" onClick={() => openIssue({ workerIds: [w.workerId], kinds: kinds.length ? kinds : (reg?.required ?? []) })} aria-label={`Issue PPE to ${w.name}`}>
                  Issue
                </Button>
              );
            },
          },
        ]
      : []),
  ];

  const historyColumns: TableProps<PpeIssueDto>['columns'] = [
    { title: 'Issued on', dataIndex: 'issuedOn', width: 120, render: (v: string) => formatDate(v) },
    {
      title: 'Worker',
      dataIndex: 'workerName',
      width: 200,
      render: (v: string, r) => (
        <div>
          {v}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.contractor}
          </div>
        </div>
      ),
    },
    { title: 'Item', dataIndex: 'kind', width: 160, render: (k: PpeKind, r) => `${PPE_KIND_LABELS[k]}${r.size ? ` · ${r.size}` : ''}` },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 200,
      render: (s: PpeIssueDto['status'], r) => (
        <Space size={4} wrap>
          <Tag color={STATUS_COLOR[s]} style={{ margin: 0 }}>
            {PPE_ISSUE_STATUS_LABELS[s]}
            {r.closedOn ? ` ${formatDate(r.closedOn)}` : ''}
          </Tag>
          {r.dueForReplacement ? (
            <Tag color="warning" style={{ margin: 0 }}>
              Due
            </Tag>
          ) : null}
          {r.recoverable ? (
            <Tag color="error" style={{ margin: 0 }}>
              Recover
            </Tag>
          ) : null}
        </Space>
      ),
    },
    { title: 'Note', key: 'note', ellipsis: true, render: (_: unknown, r) => [r.note, r.closeNote].filter(Boolean).join(' · ') || <span className="text-muted">-</span> },
    { title: 'Issued by', dataIndex: 'issuedByName', width: 150 },
    {
      title: '',
      key: 'actions',
      width: 170,
      render: (_: unknown, r) => (
        <Space size={4}>
          {reg?.canIssue && r.status === 'ISSUED' ? (
            <Button size="small" onClick={() => setClosing({ id: r.id, kind: r.kind, workerName: r.workerName, issuedOn: r.issuedOn })}>
              Return or lost
            </Button>
          ) : null}
          {user && canEditSafetyRecord(user, r.issuedById) ? (
            <ConfirmDelete what={`the ${PPE_KIND_LABELS[r.kind].toLowerCase()} issued to ${r.workerName} on ${formatDate(r.issuedOn)}`} onConfirm={() => remove.mutateAsync(r.id)}>
              <Button size="small" danger>
                Delete
              </Button>
            </ConfirmDelete>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {picker}
        <Space wrap style={{ marginLeft: 'auto' }}>
          <Button onClick={exportExcel} disabled={!reg}>
            Export
          </Button>
          {reg?.canIssue ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openIssue()}>
              Issue PPE
            </Button>
          ) : null}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {reg && (
        <>
          {reg.counts.presentMissing ? (
            <Alert
              type="error"
              showIcon
              icon={<SafetyOutlined />}
              style={{ marginBottom: 12 }}
              title={`${reg.counts.presentMissing} ${reg.counts.presentMissing === 1 ? 'worker is' : 'workers are'} on site today without the required kit`}
              action={
                reg.canIssue ? (
                  <Button size="small" onClick={() => openIssue({ workerIds: reg.workers.filter((w) => w.presentToday && w.missing.length).map((w) => w.workerId), kinds: [...new Set(reg.workers.filter((w) => w.presentToday).flatMap((w) => w.missing))] })}>
                    Issue to them
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={8} lg={4}>
              <Statistic title="Workers" value={reg.counts.workers} styles={big()} />
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Statistic title="With all the required kit" value={reg.counts.fullyKitted} styles={big()} />
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Statistic title="On site today without it" value={reg.rollCallToday ? reg.counts.presentMissing : '-'} styles={big(reg.counts.presentMissing ? RED : undefined)} />
              {!reg.rollCallToday ? (
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  No roll call yet today
                </div>
              ) : null}
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Statistic title="Items due for replacement" value={reg.counts.dueForReplacement} styles={big()} />
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Statistic title="Lost this financial year" value={reg.counts.lostThisYear} styles={big()} />
            </Col>
          </Row>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
            <Typography.Text type="secondary">Required kit:</Typography.Text>
            {reg.required.length ? (
              reg.required.map((k) => (
                <Tag key={k} style={{ margin: 0 }}>
                  {PPE_KIND_LABELS[k]}
                </Tag>
              ))
            ) : (
              <Typography.Text type="secondary">none set</Typography.Text>
            )}
            {reg.canSetRequired ? (
              <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setRequiredOpen(true)}>
                Change
              </Button>
            ) : null}
          </div>

          <Section style={{ marginTop: 16 }} title="Workers">
            <Segmented<Show>
              value={show}
              onChange={setShow}
              style={{ marginBottom: 12 }}
              options={[
                { value: 'all', label: `All (${reg.counts.workers})` },
                { value: 'missing', label: `Missing kit (${reg.counts.missingAny})` },
                { value: 'present', label: `On site without kit (${reg.counts.presentMissing})` },
                { value: 'due', label: 'Due for replacement' },
              ]}
            />
            <Table<PpeWorkerDto>
              rowKey="workerId"
              size="small"
              dataSource={rows}
              columns={workerColumns}
              pagination={rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
              scroll={{ x: 760 + reg.required.length * 170 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={reg.counts.workers ? 'Nobody in this view' : 'No named workers at this project yet: add them under Workers'} /> }}
            />
          </Section>

          {reg.leftWithKit.length ? (
            <Section style={{ marginTop: 16 }} title="Kit still out with workers who left">
              <Table
                rowKey="issueId"
                size="small"
                pagination={false}
                dataSource={reg.leftWithKit}
                scroll={{ x: 640 }}
                columns={[
                  { title: 'Worker', dataIndex: 'workerName', render: (v: string, r) => `${v} (${r.workerNo})` },
                  { title: 'Contractor', dataIndex: 'contractor', width: 200 },
                  { title: 'Item', dataIndex: 'kind', width: 160, render: (k: PpeKind) => PPE_KIND_LABELS[k] },
                  { title: 'Issued on', dataIndex: 'issuedOn', width: 120, render: (v: string) => formatDate(v) },
                  ...(reg.canIssue
                    ? [
                        {
                          title: '',
                          key: 'a',
                          width: 140,
                          render: (_: unknown, r: (typeof reg.leftWithKit)[number]) => (
                            <Button size="small" onClick={() => setClosing({ id: r.issueId, kind: r.kind, workerName: r.workerName, issuedOn: r.issuedOn })}>
                              Return or lost
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Section>
          ) : null}

          {reg.byContractor.length > 0 ? (
            <Section style={{ marginTop: 16 }} title="By contractor">
              <Table
                rowKey="contractor"
                size="small"
                pagination={false}
                dataSource={reg.byContractor}
                scroll={{ x: 560 }}
                columns={[
                  { title: 'Contractor', dataIndex: 'contractor' },
                  { title: 'Workers', dataIndex: 'workers', width: 110, align: 'right' },
                  { title: 'Missing kit', dataIndex: 'missingAny', width: 120, align: 'right', render: (v: number) => (v ? <span style={{ color: RED }}>{v}</span> : 0) },
                  { title: 'Items to recover', dataIndex: 'recoverable', width: 140, align: 'right' },
                ]}
              />
              <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                Items to recover are those lost or kept, to be deducted from the contractor&apos;s bill.
              </Typography.Paragraph>
            </Section>
          ) : null}

          <Section style={{ marginTop: 16 }} title="Issues" extra={<Typography.Text type="secondary">{history.data?.total ?? 0}</Typography.Text>}>
            {history.error ? <QueryError error={history.error} onRetry={() => history.refetch()} /> : null}
            <Table<PpeIssueDto>
              rowKey="id"
              size="small"
              loading={history.isFetching}
              dataSource={history.data?.items ?? []}
              columns={historyColumns}
              scroll={{ x: 1100 }}
              pagination={{ current: page, pageSize: 20, total: history.data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No PPE issued at this project yet" /> }}
            />
          </Section>

          <IssuePpeModal open={issueOpen} onClose={() => setIssueOpen(false)} register={reg} preset={preset} />
          <RequiredKitModal open={requiredOpen} onClose={() => setRequiredOpen(false)} register={reg} />
        </>
      )}
      <ClosePpeModal open={!!closing} onClose={() => setClosing(null)} item={closing} />
    </div>
  );
}
