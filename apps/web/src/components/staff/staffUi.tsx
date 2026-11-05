'use client';

import React from 'react';
import { Image, Space } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import type { AttendanceCorrectionDto, LeaveRequestDto, LeaveStatus, OvertimeStatus, StaffAttendanceDto, StaffAttendanceStatus } from '@erp/shared';
import { LEAVE_STATUS_LABELS, OVERTIME_STATUS_LABELS, STAFF_ATTENDANCE_LABELS } from '@erp/shared';
import { formatDate, formatDayMonth, formatTime } from '@/lib/format';
import { fileUrl } from '@/lib/api';


export const LeaveStatusTag = ({ status }: { status: LeaveStatus }) => <AppTag kind="leave" status={status}>{LEAVE_STATUS_LABELS[status]}</AppTag>;
export const AttendanceTag = ({ status }: { status: StaffAttendanceStatus }) => <AppTag kind="staffAttendance" status={status}>{STAFF_ATTENDANCE_LABELS[status]}</AppTag>;

/** "21 Oct 2026" or "21 Oct to 23 Oct 2026", with "(half day)". */
export function leaveSpan(l: Pick<LeaveRequestDto, 'fromDate' | 'toDate' | 'halfDay'>) {
  if (l.fromDate === l.toDate) return `${formatDate(l.fromDate)}${l.halfDay ? ' (half day)' : ''}`;
  const sameYear = l.fromDate.slice(0, 4) === l.toDate.slice(0, 4);
  return `${sameYear ? formatDayMonth(l.fromDate) : formatDate(l.fromDate)} to ${formatDate(l.toDate)}`;
}

export const days = (n: string | number) => `${n} day${Number(n) === 1 ? '' : 's'}`;

/** Clock time of an ISO timestamp, in the browser's zone. */
export const clock = (iso: string | null) => formatTime(iso);

/** A day as marked now, for a correction: "Absent", "Present, 09:10 to 18:05", or nothing marked. */
export function correctionNow(c: AttendanceCorrectionDto) {
  if (!c.current) return 'Nothing marked';
  const times = c.current.checkIn || c.current.checkOut ? `, ${clock(c.current.checkIn)} to ${clock(c.current.checkOut)}` : '';
  return `${STAFF_ATTENDANCE_LABELS[c.current.status]}${times}`;
}

/** What a correction asks for, leaving out what stays as it is: "Present, in 09:05, out 18:30, 1.5 h overtime". */
export function correctionAsked(c: AttendanceCorrectionDto) {
  return [
    STAFF_ATTENDANCE_LABELS[c.dayStatus],
    c.checkIn ? `in ${clock(c.checkIn)}` : null,
    c.checkOut ? `out ${clock(c.checkOut)}` : null,
    c.overtimeHours !== null ? (Number(c.overtimeHours) > 0 ? `${c.overtimeHours} h overtime` : 'no overtime') : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Metres as "120 m" or "1.4 km". */
export const metres = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** Where a check-in was: at the site, outside it, or a position with no site location to measure from. */
export function CheckInPlaceTag({ place }: { place: StaffAttendanceDto['checkInPlace'] }) {
  if (!place) return null;
  if (place.inside === null) return <AppTag meaning="done">Location recorded</AppTag>;
  return place.inside ? (
    <AppTag meaning="done">At the site{place.distanceM !== null ? ` (${metres(place.distanceM)})` : ''}</AppTag>
  ) : (
    <AppTag meaning="waiting">Outside the site{place.distanceM !== null ? `, ${metres(place.distanceM)} away` : ''}</AppTag>
  );
}

/** Face attendance: the photos the phone took as the person marked in and out, small, each opening full size. */
export function FacePhotos({ attendance, size = 36 }: { attendance: Pick<StaffAttendanceDto, 'employeeName' | 'checkInPhoto' | 'checkOutPhoto'>; size?: number }) {
  const shots = [
    { photo: attendance.checkInPhoto, alt: `${attendance.employeeName} marking in` },
    { photo: attendance.checkOutPhoto, alt: `${attendance.employeeName} marking out` },
  ].filter((x) => !!x.photo);
  if (!shots.length) return null;
  return (
    <Image.PreviewGroup>
      <Space size={4}>
        {shots.map(({ photo, alt }) => (
          <Image key={photo!.id} src={fileUrl(photo!.url)} alt={alt} width={size} height={size} style={{ objectFit: 'cover', borderRadius: tk.radius.md, border: `1px solid ${tk.color.line.hairline}` }} />
        ))}
      </Space>
    </Image.PreviewGroup>
  );
}

export const OvertimeTag = ({ status }: { status: OvertimeStatus }) => <AppTag kind="overtime" status={status}>{OVERTIME_STATUS_LABELS[status]}</AppTag>;

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
