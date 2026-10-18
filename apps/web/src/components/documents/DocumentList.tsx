'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { DocumentDiscipline, DocumentDto, DocumentKind, DocumentSortField, RevisionStatus } from '@erp/shared';
import { DOCUMENT_DISCIPLINES, DOCUMENT_DISCIPLINE_LABELS, DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, LIST_SORT_FIELDS, REVISION_STATUSES, REVISION_STATUS_LABELS, canManageDocuments } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useDocuments } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { FileLinks, RevisionStatusTag } from './docUi';
import { DocumentFormModal } from './DocumentFormModal';

const KEYS = ['kind', 'discipline', 'status'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The register: each drawing or document with its current revision and file. */
export function DocumentList({ projectId: fixedProject, onOpen }: { projectId?: string; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const frame = useListFrame<DocumentSortField, DocumentDto>({
    list: 'documents',
    url: false,
    keys: KEYS,
    sortBy: 'docNo',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.documents,
    fixedProject,
    statusLabels: REVISION_STATUS_LABELS,
    chipLabels: {
      kind: (v) => `Type: ${DOCUMENT_KIND_LABELS[v as DocumentKind] ?? v}`,
      discipline: (v) => `Discipline: ${DOCUMENT_DISCIPLINE_LABELS[v as DocumentDiscipline] ?? v}`,
    },
    columns: (sortOrderFor): ListColumn<DocumentDto>[] => {
      const sort = (key: DocumentSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Number', dataIndex: 'docNo', width: 150, className: 'mono', ...sort('docNo') },
        {
          title: 'Title',
          dataIndex: 'title',
          locked: true,
          width: 300,
          ...sort('title'),
          render: (v: string, r) => (
            <div>
              <RecordLink onOpen={() => onOpen(r.id)}>{v}</RecordLink>
              <Sub>
                {DOCUMENT_KIND_LABELS[r.kind]} · {DOCUMENT_DISCIPLINE_LABELS[r.discipline]}
              </Sub>
            </div>
          ),
        },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: DocumentDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<DocumentDto>]),
        { title: 'Rev', label: 'Revision', key: 'rev', width: 70, render: (_, r) => r.current?.revision ?? <Sub>-</Sub> },
        { title: 'Issued', width: 110, ...sort('issuedOn'), render: (_, r) => (r.current ? formatDate(r.current.issuedOn) : '-') },
        { title: 'Status', width: 180, ...sort('status'), render: (_, r) => (r.current ? <RevisionStatusTag status={r.current.status} /> : <Sub>No revision</Sub>) },
        { title: 'File', key: 'file', width: 120, render: (_, r) => (r.current ? <FileLinks files={r.current.attachments} compact /> : null) },
        { title: 'Updated', width: 110, defaultHidden: true, ...sort('updatedAt'), render: (_, r) => formatDate(r.updatedAt) },
      ];
    },
  });
  const { page } = frame;
  const kind = page.filters.kind as DocumentKind | undefined;
  const discipline = page.filters.discipline as DocumentDiscipline | undefined;
  const status = page.filters.status as RevisionStatus | undefined;
  const { data, isLoading, isFetching, error, refetch } = useDocuments({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, kind, discipline, status });

  const newButton = user && canManageDocuments(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Add document
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search number or title"
        searchLabel="Search documents"
        extra={newButton}
      >
        <Select<DocumentKind> allowClear placeholder="All types" aria-label="Type" value={kind} onChange={(v) => page.setFilter('kind', v)} style={{ width: 150 }} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))} />
        <Select<DocumentDiscipline> allowClear placeholder="All disciplines" aria-label="Discipline" value={discipline} onChange={(v) => page.setFilter('discipline', v)} style={{ width: 170 }} options={DOCUMENT_DISCIPLINES.map((k) => ({ value: k, label: DOCUMENT_DISCIPLINE_LABELS[k] }))} />
        <Select<RevisionStatus> allowClear placeholder="Any status" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 190 }} options={REVISION_STATUSES.map((s) => ({ value: s, label: REVISION_STATUS_LABELS[s] }))} />
      </ListToolbar>
      <DataTable<DocumentDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<DocumentDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1050 : 1250}
        emptyText={<EmptyArt art="entries" title={kind || discipline || status || page.params.q ? 'No document matches these filters' : 'No drawings or documents yet'} />}
        emptyAction={newButton}
      />
      <DocumentFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={fixedProject} onSaved={(d) => onOpen(d.id)} />
    </>
  );
}
