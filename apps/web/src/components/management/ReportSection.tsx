'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Table, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import type { ReportRowDto, ReportSectionDto } from '@erp/shared';
import { cellText, isNegative, isNumeric } from './report-format';

/**
 * One section of a management report as a table: numbers right-aligned in tabular figures, a loss in the danger colour, the
 * first column a link where the row opens something, and the section's total as the last row. Hovering a compact figure
 * shows it in rupees.
 */
export function ReportSection({ section }: { section: ReportSectionDto }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const first = section.columns[0]?.key;
  // A wide section reads its money in lakhs and crores on the screen, so every column fits; print and Excel keep rupees.
  const compact = section.columns.length > 7;
  const columns: TableColumnsType<ReportRowDto> = section.columns.map((c) => ({
    key: c.key,
    dataIndex: c.key,
    title: c.label,
    align: isNumeric(c.kind) ? ('right' as const) : undefined,
    className: isNumeric(c.kind) ? 'mono' : undefined,
    // The project column wraps, so a long name never pushes the figures off the side.
    width: c.key === first && c.kind === 'text' ? 240 : undefined,
    onHeaderCell: () => ({ style: { whiteSpace: 'nowrap' } }),
    render: (_: unknown, row: ReportRowDto) => {
      const v = row[c.key];
      const text = cellText(c.kind, v, compact);
      const style = isNegative(c.kind, v) ? { color: token.colorErrorText } : undefined;
      const href = c.key === first ? row._href : null;
      if (href)
        return (
          <Link href={href} translate="no">
            {text}
          </Link>
        );
      return (
        <span
          translate={isNumeric(c.kind) || c.key === first ? 'no' : undefined}
          title={compact && c.kind === 'money' && v !== null && v !== undefined ? cellText(c.kind, v) : undefined}
          style={{
            ...style,
            whiteSpace: isNumeric(c.kind) ? 'nowrap' : undefined,
          }}
        >
          {text}
        </span>
      );
    },
  }));
  const total = section.total;
  return (
    <Card
      size="small"
      title={section.title}
      styles={{
        body: { paddingTop: section.note ? token.paddingXS : undefined },
      }}
    >
      {section.note ? (
        <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, marginBottom: token.marginXS }}>
          {section.note}
        </Typography.Paragraph>
      ) : null}
      <Table<ReportRowDto>
        size="small"
        rowKey={(r) => String(r._href ?? '') + JSON.stringify(r)}
        dataSource={section.rows}
        columns={columns}
        // A row that opens something takes the click anywhere on it, as the lists do; its link stays for the keyboard.
        rowClassName={(r) => (r._href ? 'row-click' : '')}
        onRow={(r) => (r._href ? { onClick: (e) => !(e.target as HTMLElement).closest('a') && router.push(r._href!) } : {})}
        pagination={section.rows.length > 25 ? { pageSize: 25, showSizeChanger: false, hideOnSinglePage: true } : false}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: section.empty ?? 'Nothing to show for this period.',
        }}
        summary={
          total
            ? () => (
                <Table.Summary fixed="bottom">
                  <Table.Summary.Row>
                    {section.columns.map((c, i) => {
                      const v = total[c.key];
                      return (
                        <Table.Summary.Cell
                          key={c.key}
                          index={i}
                          align={isNumeric(c.kind) ? 'right' : undefined}
                          className={isNumeric(c.kind) ? 'mono' : undefined}
                        >
                          <Typography.Text
                            strong
                            translate="no"
                            style={{
                              whiteSpace: 'nowrap',
                              color: isNegative(c.kind, v) ? token.colorErrorText : undefined,
                            }}
                          >
                            {i === 0 && (v === null || v === undefined) ? 'Total' : v === null || v === undefined ? '' : cellText(c.kind, v, compact)}
                          </Typography.Text>
                        </Table.Summary.Cell>
                      );
                    })}
                  </Table.Summary.Row>
                </Table.Summary>
              )
            : undefined
        }
      />
    </Card>
  );
}
