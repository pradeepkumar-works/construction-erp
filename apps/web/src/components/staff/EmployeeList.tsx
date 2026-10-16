'use client';

import React from 'react';
import { Button, Checkbox, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { EmployeeDto, EmployeeSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canManageStaff } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useEmployees } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';

const KEYS = ['inactive'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The staff master: HR sees everyone, site in-charges the staff posted at their projects. */
export function EmployeeList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const frame = useListFrame<EmployeeSortField, EmployeeDto>({
    list: 'employees',
    url: false,
    keys: KEYS,
    sortBy: 'employeeCode',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.employees,
    chipLabels: { inactive: () => 'Including people who left' },
    columns: (sortOrderFor): ListColumn<EmployeeDto>[] => {
      const sort = (key: EmployeeSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Code', dataIndex: 'employeeCode', width: 110, className: 'mono', ...sort('employeeCode') },
        {
          title: 'Name',
          ...sort('fullName'),
          locked: true,
          width: 240,
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => onOpen(r.id)} strong>
                {r.fullName}
              </RecordLink>
              {!r.isActive && <Tag style={{ marginLeft: 6 }}>Left</Tag>}
              <Sub>{r.designation}</Sub>
            </div>
          ),
        },
        { title: 'Designation', dataIndex: 'designation', width: 180, defaultHidden: true, ...sort('designation') },
        { key: 'department', title: 'Department', dataIndex: 'department', width: 160, render: (v: string | null) => v ?? '-' },
        { title: 'Posted at', dataIndex: 'projectName', width: 260, ellipsis: true, ...sort('project'), render: (v: string | null) => v ?? 'Head office' },
        { key: 'userEmail', title: 'Login', dataIndex: 'userEmail', width: 200, ellipsis: true, render: (v: string | null) => v ?? <Sub>None</Sub> },
        { key: 'joinedOn', title: 'Joined', dataIndex: 'joinedOn', width: 120, render: (v: string | null) => formatDate(v) },
      ];
    },
  });
  const { page } = frame;
  const includeInactive = page.filters.inactive === '1';
  const { data, isLoading, isFetching, error, refetch } = useEmployees({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, includeInactive: includeInactive || undefined });

  const newButton = user && canManageStaff(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
      Add staff
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search name, code, designation"
        extra={newButton}
      >
        <Checkbox checked={includeInactive} onChange={(e) => page.setFilter('inactive', e.target.checked ? '1' : undefined)}>
          Include people who left
        </Checkbox>
      </ListToolbar>
      <DataTable<EmployeeDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<EmployeeDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1150}
        emptyText={<EmptyArt art="entries" title={includeInactive || page.params.q ? 'No one matches these filters' : 'No staff yet'} />}
        emptyAction={newButton}
      />
    </>
  );
}
