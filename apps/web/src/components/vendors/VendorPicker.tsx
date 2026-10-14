'use client';

import React, { useMemo } from 'react';
import { AutoComplete } from 'antd';
import type { VendorDto, VendorKind } from '@erp/shared';
import { useVendors } from '@/lib/queries';

/**
 * Vendor name with suggestions from the vendor master (vendors of `kind` first). A name that is not in the master can
 * still be typed; the server links a typed name that matches a vendor. `onPick` gets the vendor chosen from the list.
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
  const { data } = useVendors();
  const options = useMemo(() => {
    const all = [...(data ?? [])].sort((a, b) => Number(!!kind && b.kinds.includes(kind)) - Number(!!kind && a.kinds.includes(kind)) || a.name.localeCompare(b.name));
    return all.map((v) => ({
      value: v.name,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{v.name}</span>
          {v.gstin && <span className="text-muted mono" style={{ fontSize: 12 }}>{v.gstin}</span>}
        </div>
      ),
    }));
  }, [data, kind]);
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? 'Pick from the vendor master or type a name'}
      showSearch={{ filterOption: (input, option) => String(option?.value ?? '').toLowerCase().includes(input.trim().toLowerCase()) }}
      onSelect={(name: string) => {
        const v = data?.find((x) => x.name === name);
        if (v) onPick?.(v);
      }}
      allowClear
    />
  );
}
