'use client';

import React, { useState } from 'react';
import { Button, Checkbox, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { EmployeeDto, EmployeeSortField } from '@erp/shared';
import { canManageStaff } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { useEmployees } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';

/** The staff master: HR sees everyone, site in-charges the staff posted at their projects. */
export function EmployeeList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const list = useListState<EmployeeSortField>({ sortBy: 'employeeCode', sortOrder: 'asc' });
  const [projectId, setProjectId] = useProjectScope();
  const [includeInactive, setIncludeInactive] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useEmployees({ ...list.params, projectId, includeInactive: includeInactive || undefined });
  const sort = (key: EmployeeSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['ascend', 'descend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<EmployeeDto>['columns'] = [
    { title: 'Code', dataIndex: 'employeeCode', width: 110, className: 'mono', ...sort('employeeCode') },
    {
      title: 'Name',
      dataIndex: 'fullName',
      width: 220,
      ...sort('fullName'),
      render: (v: string, r) => (
        <>
          <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link>
          {!r.isActive && <Tag style={{ marginLeft: 6 }}>Left</Tag>}
        </>
      ),
    },
    { title: 'Designation', dataIndex: 'designation', width: 180, ...sort('designation') },
    { title: 'Department', dataIndex: 'department', width: 160, render: (v: string | null) => v ?? '-' },
    { title: 'Posted at', dataIndex: 'projectName', width: 260, ellipsis: true, ...sort('project'), render: (v: string | null) => v ?? 'Head office' },
    { title: 'Login', dataIndex: 'userEmail', width: 200, ellipsis: true, render: (v: string | null) => v ?? <Typography.Text type="secondary">None</Typography.Text> },
    { title: 'Joined', dataIndex: 'joinedOn', width: 120, render: (v: string | null) => formatDate(v) },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={(v) => {
          setProjectId(v);
          list.resetPage();
        }}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search name, code, designation"
        extra={
          user && canManageStaff(user.roleKey) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
              Add staff
            </Button>
          ) : null
        }
      >
        <Checkbox
          checked={includeInactive}
          onChange={(e) => {
            setIncludeInactive(e.target.checked);
            list.resetPage();
          }}
        >
          Include people who left
        </Checkbox>
      </ListToolbar>
      <Table<EmployeeDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<EmployeeDto>(data?.total)}
        scroll={{ x: 1250 }}
        locale={{ emptyText: 'No staff yet' }}
      />
    </>
  );
}
