'use client';

import React from 'react';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import type { LeaveRequestDto, LeaveStatus, StaffAttendanceStatus } from '@erp/shared';
import { LEAVE_STATUS_LABELS, STAFF_ATTENDANCE_LABELS } from '@erp/shared';
import { formatDate } from '@/lib/format';

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'default' };
export const ATTENDANCE_COLORS: Record<StaffAttendanceStatus, string> = { PRESENT: 'green', HALF_DAY: 'gold', ABSENT: 'red' };

export const LeaveStatusTag = ({ status }: { status: LeaveStatus }) => <Tag color={LEAVE_STATUS_COLORS[status]}>{LEAVE_STATUS_LABELS[status]}</Tag>;
export const AttendanceTag = ({ status }: { status: StaffAttendanceStatus }) => <Tag color={ATTENDANCE_COLORS[status]}>{STAFF_ATTENDANCE_LABELS[status]}</Tag>;

/** "21 Oct 2026" or "21 Oct to 23 Oct 2026", with "(half day)". */
export function leaveSpan(l: Pick<LeaveRequestDto, 'fromDate' | 'toDate' | 'halfDay'>) {
  if (l.fromDate === l.toDate) return `${formatDate(l.fromDate)}${l.halfDay ? ' (half day)' : ''}`;
  const sameYear = l.fromDate.slice(0, 4) === l.toDate.slice(0, 4);
  return `${dayjs(l.fromDate).format(sameYear ? 'DD MMM' : 'DD MMM YYYY')} to ${formatDate(l.toDate)}`;
}

export const days = (n: string | number) => `${n} day${Number(n) === 1 ? '' : 's'}`;

/** Clock time of an ISO timestamp, in the browser's zone. */
export const clock = (iso: string | null) => (iso ? dayjs(iso).format('HH:mm') : '-');
