'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Flex, Progress, Row, Typography, theme } from 'antd';
import type { HeadcountRowDto, HrPersonRowDto } from '@erp/shared';
import { useHrDashboard } from '@/lib/queries';
import { formatDate } from '@/lib/format';

const employeeHref = (id: string) => `/staff?tab=staff&employee=${id}`;

/** Head count split one way: a bar per row, longest first. */
function Split({ title, rows, total }: { title: string; rows: HeadcountRowDto[]; total: number }) {
  const { token } = theme.useToken();
  return (
    <Card size="small" title={title} style={{ height: '100%' }}>
      {rows.length === 0 ? (
        <Typography.Text type="secondary">No staff</Typography.Text>
      ) : (
        <Flex vertical gap={token.marginXS}>
          {rows.slice(0, 8).map((r) => (
            <div key={r.key}>
              <Flex justify="space-between" gap={token.marginSM}>
                <Typography.Text ellipsis>{r.label}</Typography.Text>
                <span translate="no">{r.count}</span>
              </Flex>
              <Progress percent={total ? Math.round((r.count / total) * 100) : 0} showInfo={false} size="small" aria-label={`${r.label}: ${r.count} of ${total}`} />
            </div>
          ))}
        </Flex>
      )}
    </Card>
  );
}

/** People in a list, each row opening their record. */
function People({ title, rows, empty, note }: { title: string; rows: HrPersonRowDto[]; empty: string; note: (r: HrPersonRowDto) => string }) {
  const { token } = theme.useToken();
  const row: React.CSSProperties = { minHeight: 44, padding: `${token.paddingXXS}px 0`, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` };
  return (
    <Card size="small" title={title} style={{ height: '100%' }}>
      {rows.length === 0 ? (
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          {empty}
        </Typography.Paragraph>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.slice(0, 8).map((r) => (
            <li key={`${r.employeeId}-${r.date}`}>
              <Link href={employeeHref(r.employeeId)} className="text-link">
                <Flex align="center" justify="space-between" gap={token.marginSM} style={row}>
                  <span>
                    <span translate="no">{r.fullName}</span>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                      {r.designation}
                      {r.projectName ? `, ${r.projectName}` : ''}
                    </Typography.Text>
                  </span>
                  <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM, whiteSpace: 'nowrap' }}>
                    {note(r)}
                  </Typography.Text>
                </Flex>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 && (
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          and {rows.length - 8} more
        </Typography.Text>
      )}
    </Card>
  );
}

/**
 * The HR dashboard on the People home: head count by site, department and kind of employment; who joined and
 * left this month; probation ending; birthdays and work anniversaries; and whose details payroll still needs.
 */
export function HrDashboard() {
  const { token } = theme.useToken();
  const { data } = useHrDashboard();
  if (!data) return null;
  const short = (d: string) => formatDate(d).slice(0, 6);
  const row: React.CSSProperties = { minHeight: 44, padding: `${token.paddingXXS}px 0`, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` };
  return (
    <section aria-label="HR dashboard">
      <Typography.Title level={2} style={{ fontSize: token.fontSizeHeading4, margin: `0 0 ${token.marginSM}px` }}>
        Staff: {data.active} on the rolls
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={8}>
          <Split title="By site" rows={data.bySite} total={data.active} />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Split title="By department" rows={data.byDepartment} total={data.active} />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Split title="By employment" rows={data.byType} total={data.active} />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <People
            title="Joined and left this month"
            rows={[...data.joinedThisMonth, ...data.leftThisMonth]}
            empty="Nobody joined or left this month."
            note={(r) => `${data.leftThisMonth.includes(r) ? 'left' : 'joined'} ${short(r.date)}`}
          />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <People
            title="Probation ending"
            rows={data.probationDue}
            empty="No probation ends in the next 30 days."
            note={(r) => (r.date < data.date ? `ended ${short(r.date)}, not confirmed` : `ends ${short(r.date)}`)}
          />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <People
            title="Birthdays and work anniversaries"
            rows={[...data.birthdays, ...data.anniversaries].sort((a, b) => a.date.localeCompare(b.date))}
            empty="None till the end of next month."
            note={(r) => (r.years ? `${r.years} year${r.years === 1 ? '' : 's'} on ${short(r.date)}` : `birthday ${short(r.date)}`)}
          />
        </Col>
        {data.missingDetails.length > 0 && (
          <Col xs={24}>
            <Card size="small" title="Details payroll still needs">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, columns: '18rem' }}>
                {data.missingDetails.map((m) => (
                  <li key={m.employeeId} style={{ breakInside: 'avoid' }}>
                    <Link href={employeeHref(m.employeeId)} className="text-link">
                      <Flex align="center" justify="space-between" gap={token.marginSM} style={row}>
                        <span translate="no">{m.fullName}</span>
                        <Typography.Text type="danger" style={{ fontSize: token.fontSizeSM }}>
                          No {m.missing.join(', ')}
                        </Typography.Text>
                      </Flex>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        )}
      </Row>
    </section>
  );
}
