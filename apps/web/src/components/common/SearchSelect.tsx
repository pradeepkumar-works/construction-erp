'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Select, Spin, Typography } from 'antd';
import type { SelectProps } from 'antd';
import type { ClientDto, EquipmentDto, ItemDto, RoleKey, SorItemDto, UserSummary, VendorDto, VendorKind } from '@erp/shared';
import { usePickerPage, usePickerRecord, type PickerSource } from '@/lib/queries';
import { useDebounced } from '@/lib/debounce';

export interface PickerOption {
  value: string;
  label: React.ReactNode;
}

export type SearchSelectProps<T> = Omit<SelectProps<string>, 'options' | 'showSearch' | 'filterOption' | 'onSearch' | 'loading' | 'mode'> & {
  /** The master to search; its list endpoint's `q` does the matching, so a picker never loads the whole master. */
  source: PickerSource;
  /** Fixed filters for the list endpoint (`isActive`, `roleKeys`, `kind`…). */
  params?: object;
  toOption: (row: T) => PickerOption;
  /** Rows to leave out (people already on the project). */
  exclude?: (row: T) => boolean;
  /** Order of the rows on a page (a vendor's own kind first). */
  sortRows?: (a: T, b: T) => number;
  /** The current value's option when the caller knows it (a record being edited names its vendor), for masters without `GET /:id`. */
  selected?: PickerOption | null;
  /** The whole row picked, for forms that fill other fields from it (a vendor's PAN sets the TDS). */
  onPick?: (row: T) => void;
  /** Fixed options listed before the rows found ("+ New item"). */
  extra?: PickerOption[];
};

/**
 * A select over a master that searches as you type (item 83): it shows the first page when it opens, asks the list
 * endpoint with `q` a moment after each pause in typing, and keeps showing the chosen value's name when that is not on
 * the page shown. It replaces dropdowns that loaded up to 500 rows up front.
 */
export function SearchSelect<T extends { id: string }>({ source, params, toOption, exclude, sortRows, selected, onPick, extra, value, onChange, onOpenChange, placeholder, ...props }: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  // The last option picked keeps its name after the search that found it is gone.
  const [picked, setPicked] = useState<PickerOption | null>(null);
  const page = usePickerPage<T>(source, q, params, open || !!q);
  const pageOptions = useMemo(() => {
    const list = (page.data?.items ?? []).filter((r) => !exclude?.(r));
    return (sortRows ? [...list].sort(sortRows) : list).map(toOption);
  }, [page.data, exclude, sortRows, toOption]);
  // While the words typed are still on their way (the pause, then the request), the rows of the last search are not
  // offered: Enter must never take a row that does not match what is in the box.
  const searching = search.trim() !== '';
  const settled = search.trim() === q.trim() && !page.isPlaceholderData;
  const options = settled ? pageOptions : [];
  const fixed = (extra ?? []).filter((o) => !searching || String(o.label).toLowerCase().includes(search.trim().toLowerCase()));
  const fromPage = value ? [...(extra ?? []), ...pageOptions].find((o) => o.value === value) : undefined;
  const fromProps = value ? [picked, selected].find((o) => o?.value === value) : undefined;
  const one = usePickerRecord<T>(source, value ?? undefined, !!value && !fromPage && !fromProps);
  const current = fromPage ?? fromProps ?? (one.data && one.data.id === value ? toOption(one.data) : undefined);
  // The chosen value stays in the list (first) so the box shows its name, not its id; not while a search is under way.
  const keepCurrent = current && !options.some((o) => o.value === current.value) && !fixed.some((o) => o.value === current.value) && !(searching && !settled);
  const shown = [...fixed, ...(keepCurrent ? [current] : []), ...options];
  const fetching = open && (page.isFetching || !settled);

  return (
    <Select<string>
      {...props}
      value={value}
      onChange={(v, option) => {
        const o = shown.find((x) => x.value === v);
        setPicked(o ?? null);
        onChange?.(v, option);
        const row = page.data?.items.find((r) => r.id === v);
        if (row) onPick?.(row);
      }}
      placeholder={placeholder ?? 'Type to search'}
      options={shown}
      loading={fetching}
      showSearch={{ filterOption: false, onSearch: setSearch, searchValue: search }}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
        onOpenChange?.(o);
      }}
      notFoundContent={
        fetching ? (
          <Spin size="small" />
        ) : (
          <Typography.Text type="secondary">{q ? `Nothing matches “${q}”` : 'Nothing to choose yet'}</Typography.Text>
        )
      }
    />
  );
}

type Picker<T> = Omit<SearchSelectProps<T>, 'source' | 'toOption'>;

const userOption = (u: UserSummary): PickerOption => ({ value: u.id, label: `${u.fullName} (${u.roleName})` });
const vendorOption = (v: VendorDto): PickerOption => ({ value: v.id, label: v.name });
const clientOption = (c: ClientDto): PickerOption => ({ value: c.id, label: c.department ? `${c.name} · ${c.department}` : c.name });
const equipmentOption = (e: EquipmentDto): PickerOption => ({ value: e.id, label: `${e.code} · ${e.name}` });
const itemOption = (i: ItemDto): PickerOption => ({ value: i.id, label: `${i.name} (${i.unit})` });

/** A user of the organisation (active ones unless `params` says otherwise), optionally of some roles only. */
export function UserSelect({ roles, params, ...props }: Picker<UserSummary> & { roles?: readonly RoleKey[] }) {
  const roleKeys = roles?.length ? roles.join(',') : undefined;
  const query = useMemo(() => ({ isActive: true, roleKeys, ...params }), [roleKeys, params]);
  return <SearchSelect<UserSummary> source="users" params={query} toOption={userOption} placeholder="Type a name" {...props} />;
}

/**
 * Several users at once (finding 6 of the October review: a team was added one person at a time), searching as you type
 * like `UserSelect`; the chosen ones keep their names when the search that found them is gone.
 */
export function UserMultiSelect({
  value,
  onChange,
  exclude,
  roles,
  placeholder,
  ...props
}: Omit<SelectProps<string[]>, 'options' | 'mode' | 'showSearch' | 'filterOption' | 'onSearch' | 'loading' | 'onChange'> & {
  exclude?: (u: UserSummary) => boolean;
  roles?: readonly RoleKey[];
  onChange?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const roleKeys = roles?.length ? roles.join(',') : undefined;
  const params = useMemo(() => ({ isActive: true, roleKeys }), [roleKeys]);
  const page = usePickerPage<UserSummary>('users', q, params, open || !!q);
  const [names, setNames] = useState<Record<string, React.ReactNode>>({});
  const options = useMemo(() => {
    const rows = (page.data?.items ?? []).filter((u) => !exclude?.(u)).map(userOption);
    const kept = (value ?? []).filter((v) => !rows.some((o) => o.value === v)).map((v) => ({ value: v, label: names[v] ?? v }));
    return [...kept, ...rows];
  }, [page.data, exclude, value, names]);
  return (
    <Select<string[]>
      {...props}
      mode="multiple"
      value={value}
      onChange={(ids) => {
        setNames((m) => ({ ...m, ...Object.fromEntries(options.filter((o) => ids.includes(o.value)).map((o) => [o.value, o.label])) }));
        onChange?.(ids);
      }}
      placeholder={placeholder ?? 'Type names'}
      options={options}
      loading={open && page.isFetching}
      showSearch={{ filterOption: false, onSearch: setSearch, searchValue: search }}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
      }}
      notFoundContent={open && page.isFetching ? <Spin size="small" /> : <Typography.Text type="secondary">{q ? `Nothing matches “${q}”` : 'Nothing to choose yet'}</Typography.Text>}
    />
  );
}

/** A vendor from the master (active ones unless `params` says otherwise): `kinds` keeps only those, `prefer` lists those first. */
export function VendorSelect({ kinds, prefer, params, ...props }: Picker<VendorDto> & { kinds?: readonly VendorKind[]; prefer?: readonly VendorKind[] }) {
  const kindList = kinds?.length ? kinds.join(',') : undefined;
  const query = useMemo(() => ({ kinds: kindList, ...params }), [kindList, params]);
  const preferList = prefer?.join(',') ?? '';
  const sortRows = useCallback(
    (a: VendorDto, b: VendorDto) => {
      const first = preferList.split(',');
      return Number(b.kinds.some((k) => first.includes(k))) - Number(a.kinds.some((k) => first.includes(k)));
    },
    [preferList],
  );
  return <SearchSelect<VendorDto> source="vendors" params={query} sortRows={preferList ? sortRows : undefined} toOption={vendorOption} placeholder="Type a vendor's name" {...props} />;
}

/** A client from the client master. */
export function ClientSelect(props: Picker<ClientDto>) {
  return <SearchSelect<ClientDto> source="clients" toOption={clientOption} placeholder="Type a client's name" {...props} />;
}

/** A machine from the equipment register. */
export function EquipmentSelect(props: Picker<EquipmentDto>) {
  return <SearchSelect<EquipmentDto> source="equipment" toOption={equipmentOption} placeholder="Type a code or name" {...props} />;
}

/** An item from the item master. */
export function ItemSelect(props: Picker<ItemDto>) {
  return <SearchSelect<ItemDto> source="items" toOption={itemOption} placeholder="Type an item" {...props} />;
}

const sorOption = (s: SorItemDto): PickerOption => ({ value: s.id, label: `${s.code} · ${s.description.length > 70 ? `${s.description.slice(0, 70)}…` : s.description} (${s.unit})` });

/** An item of a schedule of rates (v6 item 110), searched by code or words of its description. */
export function SorItemSelect({ bookId, ...props }: Picker<SorItemDto> & { bookId?: string | null }) {
  const query = useMemo(() => ({ bookId: bookId ?? undefined }), [bookId]);
  return <SearchSelect<SorItemDto> source="sorItems" params={query} toOption={sorOption} placeholder="Type a code or words of the item" {...props} />;
}

/** One vendor by id (a form's PAN and GSTIN notes, a filter chip's name), fetched once and cached. */
export function useVendor(id: string | undefined) {
  return usePickerRecord<VendorDto>('vendors', id, !!id).data;
}

/** A vendor's name by id, for a filter chip ("Vendor: …"); undefined while unknown. */
export const useVendorName = (id: string | undefined) => useVendor(id)?.name;

/** One machine by id, for a filter chip ("Machine: …"); undefined while unknown. */
export function useEquipmentItem(id: string | undefined) {
  return usePickerRecord<EquipmentDto>('equipment', id, !!id).data;
}
