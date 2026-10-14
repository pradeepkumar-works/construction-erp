'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { DocumentDiscipline, DocumentDto, DocumentKind, DocumentSortField, RevisionStatus } from '@erp/shared';
import { DOCUMENT_DISCIPLINES, DOCUMENT_DISCIPLINE_LABELS, DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, REVISION_STATUSES, REVISION_STATUS_LABELS, canManageDocuments } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDocuments } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { FileLinks, RevisionStatusTag } from './docUi';
import { DocumentFormModal } from './DocumentFormModal';

/** The register: each drawing or document with its current revision and file. */
export function DocumentList({ projectId: fixedProject, onOpen }: { projectId?: string; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const list = useListState<DocumentSortField>({ sortBy: 'docNo', sortOrder: 'asc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [kind, setKind] = useState<DocumentKind | undefined>();
  const [discipline, setDiscipline] = useState<DocumentDiscipline | undefined>();
  const [status, setStatus] = useState<RevisionStatus | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useDocuments({ ...list.params, projectId, kind, discipline, status });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: DocumentSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<DocumentDto>['columns'] = [
    { title: 'Number', dataIndex: 'docNo', width: 150, className: 'mono', ...sort('docNo') },
    {
      title: 'Title',
      dataIndex: 'title',
      width: 300,
      ...sort('title'),
      render: (v: string, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {DOCUMENT_KIND_LABELS[r.kind]} · {DOCUMENT_DISCIPLINE_LABELS[r.discipline]}
          </div>
        </div>
      ),
    },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: DocumentDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    { title: 'Rev', key: 'rev', width: 70, render: (_, r) => r.current?.revision ?? <span className="text-muted">-</span> },
    { title: 'Issued', width: 110, ...sort('issuedOn'), render: (_, r) => (r.current ? formatDate(r.current.issuedOn) : '-') },
    { title: 'Status', width: 180, ...sort('status'), render: (_, r) => (r.current ? <RevisionStatusTag status={r.current.status} /> : <span className="text-muted">No revision</span>) },
    { title: 'File', key: 'file', width: 120, render: (_, r) => (r.current ? <FileLinks files={r.current.attachments} compact /> : null) },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 80,
      render: (_, r) => (
        <Button size="small" onClick={() => onOpen(r.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search number or title"
        extra={
          user && canManageDocuments(user.roleKey) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Add document
            </Button>
          ) : null
        }
      >
        <Select allowClear placeholder="All types" value={kind} onChange={reset(setKind)} style={{ width: 150 }} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))} />
        <Select allowClear placeholder="All disciplines" value={discipline} onChange={reset(setDiscipline)} style={{ width: 170 }} options={DOCUMENT_DISCIPLINES.map((k) => ({ value: k, label: DOCUMENT_DISCIPLINE_LABELS[k] }))} />
        <Select allowClear placeholder="Any status" value={status} onChange={reset(setStatus)} style={{ width: 190 }} options={REVISION_STATUSES.map((s) => ({ value: s, label: REVISION_STATUS_LABELS[s] }))} />
      </ListToolbar>
      <Table<DocumentDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<DocumentDto>(data?.total)}
        scroll={{ x: fixedProject ? 1100 : 1320 }}
        locale={{ emptyText: 'No drawings or documents yet' }}
      />
      <DocumentFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={fixedProject} onSaved={(d) => onOpen(d.id)} />
    </>
  );
}
