'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import type { LeaveRequestDto, LeaveStatus, OvertimeStatus, StaffAttendanceDto, StaffAttendanceStatus } from '@erp/shared';
import { LEAVE_STATUS_LABELS, OVERTIME_STATUS_LABELS, STAFF_ATTENDANCE_LABELS } from '@erp/shared';
import { formatDate } from '@/lib/format';

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'default' };
export const ATTENDANCE_COLORS: Record<StaffAttendanceStatus, string> = { PRESENT: 'green', HALF_DAY: 'gold', ABSENT: 'red' };

export const LeaveStatusTag = ({ status }: { status: LeaveStatus }) => <AppTag color={LEAVE_STATUS_COLORS[status]}>{LEAVE_STATUS_LABELS[status]}</AppTag>;
export const AttendanceTag = ({ status }: { status: StaffAttendanceStatus }) => <AppTag color={ATTENDANCE_COLORS[status]}>{STAFF_ATTENDANCE_LABELS[status]}</AppTag>;

/** "21 Oct 2026" or "21 Oct to 23 Oct 2026", with "(half day)". */
export function leaveSpan(l: Pick<LeaveRequestDto, 'fromDate' | 'toDate' | 'halfDay'>) {
  if (l.fromDate === l.toDate) return `${formatDate(l.fromDate)}${l.halfDay ? ' (half day)' : ''}`;
  const sameYear = l.fromDate.slice(0, 4) === l.toDate.slice(0, 4);
  return `${dayjs(l.fromDate).format(sameYear ? 'DD MMM' : 'DD MMM YYYY')} to ${formatDate(l.toDate)}`;
}

export const days = (n: string | number) => `${n} day${Number(n) === 1 ? '' : 's'}`;

/** Clock time of an ISO timestamp, in the browser's zone. */
export const clock = (iso: string | null) => (iso ? dayjs(iso).format('HH:mm') : '-');

/** Metres as "120 m" or "1.4 km". */
export const metres = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** Where a check-in was (v5 item 97): at the site, outside it, or a position with no site location to measure from. */
export function CheckInPlaceTag({ place }: { place: StaffAttendanceDto['checkInPlace'] }) {
  if (!place) return null;
  if (place.inside === null) return <AppTag>Location recorded</AppTag>;
  return place.inside ? (
    <AppTag tone="success">At the site{place.distanceM !== null ? ` (${metres(place.distanceM)})` : ''}</AppTag>
  ) : (
    <AppTag tone="pending">Outside the site{place.distanceM !== null ? `, ${metres(place.distanceM)} away` : ''}</AppTag>
  );
}

export const OVERTIME_COLORS: Record<OvertimeStatus, string> = { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red' };
export const OvertimeTag = ({ status }: { status: OvertimeStatus }) => <AppTag color={OVERTIME_COLORS[status]}>{OVERTIME_STATUS_LABELS[status]}</AppTag>;

/**
 * The browser's position for a check-in, or null when it is refused, unavailable or slow (the server decides whether
 * a check-in without one is allowed).
 */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracyM: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), accuracyM: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    ),
  );
}
