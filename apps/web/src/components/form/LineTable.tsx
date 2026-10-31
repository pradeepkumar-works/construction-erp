'use client';

import React, { useRef } from 'react';
import { Button, Form, Table, Typography, theme } from 'antd';
import type { FormListFieldData, FormListOperation, TableColumnType } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import { inSentence } from '@/lib/format';

export interface LineColumn {
  key: string;
  title: React.ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  /** The cell's input, as a `<Form.Item name={[field.name, '…']} noStyle>` */
  render: (field: FormListFieldData, index: number, ops: FormListOperation) => React.ReactNode;
}

const FOCUSABLE = 'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), [role=combobox]:not([aria-disabled=true]), button:not([disabled])';

/**
 * Lines of a form (manpower, machinery, order and bill lines) as an editable table (UI roadmap item 60). Enter moves
 * to the same column on the next line, and on the last line adds one; Tab moves across. The rows carry
 * `data-line-label`, which the form's error summary names ("Manpower, line 2").
 */
export function LineTable({
  name,
  label,
  columns,
  newLine,
  addText = 'Add line',
  min = 0,
  footer,
  locked,
}: {
  name: string | (string | number)[];
  /** What a line is, for the error summary and the remove button ("Manpower") */
  label: string;
  columns: LineColumn[];
  /** The values a new line starts with */
  newLine?: () => Record<string, unknown>;
  addText?: string;
  /** Lines that cannot be removed below this count */
  min?: number;
  footer?: (fields: FormListFieldData[]) => React.ReactNode;
  /** Lines come from elsewhere (e.g. the order): no adding or removing */
  locked?: boolean;
}) {
  const { token } = theme.useToken();
  const wrap = useRef<HTMLDivElement>(null);
  const addRef = useRef<FormListOperation['add'] | null>(null);

  const focusCell = (row: number, cell: number) => {
    const tr = wrap.current?.querySelector<HTMLTableRowElement>(`tr[data-line="${row}"]`);
    const td = tr?.cells[cell] ?? tr?.cells[1];
    td?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.getAttribute('aria-expanded') === 'true') return;
    const tr = target.closest<HTMLTableRowElement>('tr[data-line]');
    const td = target.closest<HTMLTableCellElement>('td');
    if (!tr || !td) return;
    e.preventDefault();
    const row = Number(tr.getAttribute('data-line'));
    const rows = wrap.current?.querySelectorAll('tr[data-line]').length ?? 0;
    if (row < rows - 1) return focusCell(row + 1, td.cellIndex);
    if (locked || !addRef.current) return;
    addRef.current(newLine?.());
    window.setTimeout(() => focusCell(row + 1, 1), 0);
  };

  return (
    <Form.List name={name}>
      {(fields, ops) => {
        addRef.current = ops.add;
        const cols: TableColumnType<FormListFieldData>[] = [
          { key: '#', title: '#', width: 40, render: (_, __, i) => <Typography.Text type="secondary">{i + 1}</Typography.Text> },
          ...columns.map((c) => ({ key: c.key, title: c.title, width: c.width, align: c.align, render: (_: unknown, f: FormListFieldData, i: number) => c.render(f, i, ops) })),
          ...(locked
            ? []
            : [
                {
                  key: 'remove',
                  width: 44,
                  render: (_: unknown, f: FormListFieldData, i: number) => (
                    <Button type="text" size="small" aria-label={`Remove ${inSentence(label)} line ${i + 1}`} icon={<DeleteOutlined />} disabled={fields.length <= min} onClick={() => ops.remove(f.name)} />
                  ),
                },
              ]),
        ];
        // Columns without a width get room for a field; wider than the panel, the table scrolls sideways.
        const minWidth = 40 + (locked ? 0 : 44) + columns.reduce((n, c) => n + (typeof c.width === 'number' ? c.width : 200), 0);
        return (
          <div ref={wrap} role="presentation" onKeyDown={onKeyDown}>
            <Table<FormListFieldData>
              size="small"
              rowKey="key"
              pagination={false}
              dataSource={fields}
              columns={cols}
              scroll={{ x: minWidth }}
              locale={{ emptyText: `No ${inSentence(label)} lines yet` }}
              onRow={(_, i) => ({ 'data-line': i, 'data-line-label': `${label}, line ${(i ?? 0) + 1}` }) as React.HTMLAttributes<HTMLElement>}
              summary={footer ? () => footer(fields) : undefined}
            />
            {!locked && (
              <Button type="dashed" size="small" block icon={<PlusOutlined />} style={{ marginTop: token.marginXS }} onClick={() => {
                ops.add(newLine?.());
                window.setTimeout(() => focusCell(fields.length, 1), 0);
              }}>
                {addText}
              </Button>
            )}
          </div>
        );
      }}
    </Form.List>
  );
}
