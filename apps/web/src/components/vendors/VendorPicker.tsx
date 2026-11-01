'use client';

import React, { useMemo, useState } from 'react';
import { AutoComplete } from 'antd';
import type { VendorDto, VendorKind } from '@erp/shared';
import { usePickerPage } from '@/lib/queries';
import { useDebounced } from '@/lib/debounce';
import { themeFontSize } from '@/lib/theme';

/**
 * Vendor name with suggestions from the vendor master (vendors of `kind` first), searched as you type rather
 * than loading the whole master. A name that is not in the master can still be typed; the server links a typed name that
 * matches a vendor. `onPick` gets the vendor chosen from the list.
 */
export function VendorPicker({
  value,
  onChange,
  kind,
  placeholder,
  onPick,
  id,
}: {
  value?: string;
  onChange?: (v: string) => void;
  kind?: VendorKind;
  placeholder?: string;
  onPick?: (v: VendorDto) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  // The words typed are the field's value; the master is asked a moment after each pause.
  const q = useDebounced(open ? (value ?? '') : '', 250);
  const { data } = usePickerPage<VendorDto>('vendors', q, undefined, open);
  const rows = useMemo(() => [...(data?.items ?? [])].sort((a, b) => Number(!!kind && b.kinds.includes(kind)) - Number(!!kind && a.kinds.includes(kind))), [data, kind]);
  const options = rows.map((v) => ({
    value: v.name,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{v.name}</span>
        {v.gstin && <span className="text-muted mono" translate="no" style={{ fontSize: themeFontSize('fontSizeSM') }}>{v.gstin}</span>}
      </div>
    ),
  }));
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? 'Choose from the vendor master or type a name'}
      // The master already matched the words typed.
      showSearch={{ filterOption: false }}
      onOpenChange={setOpen}
      onFocus={() => setOpen(true)}
      onSelect={(name: string) => {
        const v = rows.find((x) => x.name === name);
        if (v) onPick?.(v);
      }}
      allowClear
    />
  );
}
