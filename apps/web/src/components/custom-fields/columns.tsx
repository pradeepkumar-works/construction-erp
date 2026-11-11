'use client';

import type { CustomFieldDto, FieldValues } from '@erp/shared';
import type { ListColumn } from '@/components/list/DataTable';
import { NO_VALUE } from '@/lib/format';
import { customValueText } from './values';

/**
 * A list's optional columns for the company's active fields, keyed `cf:<key>`: off until chosen in the column
 * chooser, read from the row the list already has. A number field is a quantity column with its unit.
 */
export function customColumns<T extends { customValues: FieldValues }>(defs: CustomFieldDto[] | undefined): ListColumn<T>[] {
  return (defs ?? [])
    .filter((d) => !d.archived)
    .map((d): ListColumn<T> =>
      d.kind === 'NUMBER'
        ? { key: `cf:${d.key}`, title: d.label, defaultHidden: true, kind: 'qty', width: 140, value: (r) => (typeof r.customValues?.[d.key] === 'number' ? (r.customValues[d.key] as number) : null), unit: () => d.unit }
        : {
            key: `cf:${d.key}`,
            title: d.label,
            defaultHidden: true,
            width: d.kind === 'LONG_TEXT' ? 240 : 160,
            render: (_: unknown, r: T) => {
              const text = customValueText(d, r.customValues?.[d.key]);
              return text ? <span translate="no">{text}</span> : <span className="text-muted">{NO_VALUE}</span>;
            },
          },
    );
}
