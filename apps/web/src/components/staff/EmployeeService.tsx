'use client';

import React, { useState } from 'react';
import { App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import type { EmployeeDto, EmployeeEventDto, EmployeeLetterDto } from '@erp/shared';
import { EMPLOYEE_EVENT_LABELS, EMPLOYEE_EVENT_LETTERS, canManageStaff, isExitEvent } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployeeEvents, useRemoveEmployeeEvent } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { EmployeeEventModal } from './EmployeeEventModal';
import { printHrLetter } from './hrLetterPrint';

/** What changed, in a few words: posting, designation, pay or the notice date. */
export function eventChange(ev: EmployeeEventDto): string {
  const parts: string[] = [];
  if (ev.type === 'TRANSFERRED') parts.push(`${ev.fromProjectName ?? 'Head office'} to ${ev.toProjectName ?? 'head office'}`);
  if (ev.toDesignation && ev.toDesignation !== ev.fromDesignation) parts.push(ev.fromDesignation ? `${ev.fromDesignation} to ${ev.toDesignation}` : ev.toDesignation);
  if (ev.toDepartment && ev.toDepartment !== ev.fromDepartment && ev.fromDepartment) parts.push(`${ev.fromDepartment} to ${ev.toDepartment}`);
  if (ev.toCtc && ev.toCtc !== ev.fromCtc) parts.push(ev.fromCtc ? `${formatINR(ev.fromCtc)} to ${formatINR(ev.toCtc)} a year` : `${formatINR(ev.toCtc)} a year`);
  if (ev.noticeGivenOn) parts.push(`notice given ${formatDate(ev.noticeGivenOn)}`);
  if (!parts.length && ev.note) parts.push(ev.note);
  return parts.join('; ');
}

/** Print an event's letter (or, for an exit, the experience certificate). */
export function usePrintLetter() {
  const { message } = App.useApp();
  return (ev: EmployeeEventDto, experience = false) =>
    printHrLetter(async () => (await api.get<EmployeeLetterDto>(`/staff/events/${ev.id}/letter`)).data, experience)
      .then((ok) => {
        if (!ok) message.warning('Your browser blocked the letter window. Allow pop-ups for this site and try again.');
      })
      .catch((err) => message.error(errorMessage(err, 'Could not prepare the letter. Try again.')));
}

/**
 * A person's service from joining to exit (v6 item 99), each step with its letter. HR records the next step here, and can
 * take back the latest one if it was recorded by mistake.
 */
export function EmployeeService({ employee }: { employee: EmployeeDto }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const admin = !!user && canManageStaff(user.roleKey);
  const { data, isLoading } = useEmployeeEvents({ employeeId: employee.id, pageSize: 100 });
  const remove = useRemoveEmployeeEvent();
  const print = usePrintLetter();
  const [recording, setRecording] = useState(false);
  const events = data?.items ?? [];
  const latest = events[0];

  return (
    <>
      <Space style={{ marginBottom: 8, width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Text type="secondary">
          {employee.confirmedOn ? `Confirmed ${formatDate(employee.confirmedOn)}` : employee.probationEndsOn ? `On probation until ${formatDate(employee.probationEndsOn)}` : 'Joining to exit, newest first'}
        </Typography.Text>
        {admin && employee.isActive && (
          <Button icon={<PlusOutlined />} onClick={() => setRecording(true)}>
            Record
          </Button>
        )}
      </Space>
      <Table<EmployeeEventDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={events}
        scroll={{ x: 640 }}
        locale={{ emptyText: 'Nothing recorded yet' }}
        columns={[
          { title: 'From', dataIndex: 'effectiveDate', width: 110, render: (v: string) => formatDate(v) },
          {
            title: 'What',
            dataIndex: 'type',
            width: 120,
            render: (v: EmployeeEventDto['type']) => <Tag color={isExitEvent(v) ? 'default' : v === 'WARNING' ? 'warning' : 'processing'}>{EMPLOYEE_EVENT_LABELS[v]}</Tag>,
          },
          { title: 'Change', key: 'change', render: (_, r) => eventChange(r) || <Typography.Text type="secondary">-</Typography.Text> },
          { title: 'Letter', dataIndex: 'letterNo', width: 120, render: (v: string) => <span translate="no">{v}</span> },
          {
            title: 'Actions',
            key: 'act',
            width: 150,
            render: (_, r) => (
              <Space size={4} wrap>
                <Button size="small" icon={<PrinterOutlined />} onClick={() => print(r)} aria-label={`Print ${EMPLOYEE_EVENT_LETTERS[r.type].toLowerCase()} ${r.letterNo}`}>
                  Letter
                </Button>
                {isExitEvent(r.type) && r.type !== 'TERMINATED' && (
                  <Button size="small" onClick={() => print(r, true)}>
                    Experience
                  </Button>
                )}
                {admin && r.id === latest?.id && r.type !== 'JOINED' && (
                  <Popconfirm
                    title={`Take back the ${EMPLOYEE_EVENT_LABELS[r.type].toLowerCase()}?`}
                    description="The staff record goes back to how it was before."
                    okText="Take back"
                    onConfirm={() =>
                      remove
                        .mutateAsync(r.id)
                        .then(() => message.success(`${EMPLOYEE_EVENT_LABELS[r.type]} taken back`))
                        .catch((err) => message.error(errorMessage(err, 'Could not take it back. Try again.')))
                    }
                  >
                    <Button size="small" danger loading={remove.isPending}>
                      Take back
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      {admin && <EmployeeEventModal open={recording} onClose={() => setRecording(false)} employee={employee} />}
    </>
  );
}
