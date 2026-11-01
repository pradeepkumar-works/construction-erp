'use client';

import React from 'react';
import { AutoComplete, Button, Flex, Typography } from 'antd';
import type { AutoCompleteProps } from 'antd';
import type { ItemDto } from '@erp/shared';
import { itemKey, masterItemFor, similarItems } from '@erp/shared';
import { useStockItems } from '@/lib/queries';
import { useDebounced } from '@/lib/debounce';
import { themeColor, themeFontSize } from '@/lib/theme';

/** The word of a name the item master is searched by: its longest word of letters ("cement" of "OPC 53 cement"). */
const mainWord = (name: string) => {
  const words = itemKey(name).split(' ');
  return words.filter((w) => /^[a-z]{3,}$/.test(w)).sort((a, b) => b.length - a.length)[0] ?? words[0] ?? '';
};

/** Every word typed is in the item's name or one of its old names. */
const matches = (typed: string, item: ItemDto) => {
  const words = itemKey(typed).split(' ').filter(Boolean);
  const names = [itemKey(item.name), ...(item.aliases ?? [])];
  return names.some((n) => words.every((w) => n.includes(w)));
};

export interface ItemPickerProps extends Omit<AutoCompleteProps, 'options' | 'showSearch' | 'onSelect' | 'value' | 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  /** The line's unit: the same name in another unit is another item */
  unit?: string;
  /** A master item was picked: the line takes its unit (and its rate, where the form wants it) */
  onPick?: (item: ItemDto) => void;
}

/**
 * The item of a request or order line: picks from the item master with its unit, so
 * the same cement is not three items to stock, rates and leakage. A name that is not in the master is still taken (it
 * is added when first received), but first the field offers the items it may mean.
 */
export function ItemPicker({ value, onChange, unit, onPick, ...rest }: ItemPickerProps) {
  const typed = (value ?? '').trim();
  const word = useDebounced(mainWord(typed), 250);
  const { data } = useStockItems({ q: word || undefined, pageSize: 50 });
  const items = data?.items ?? [];
  const pick = (item: ItemDto) => {
    onChange?.(item.name);
    onPick?.(item);
  };

  const options = items
    .filter((i) => !typed || matches(typed, i))
    .slice(0, 12)
    .map((i) => ({
      key: i.id,
      value: i.name,
      item: i,
      label: (
        <Flex justify="space-between" gap={8}>
          <span translate="no">{i.name}</span>
          <Typography.Text type="secondary">{i.unit}</Typography.Text>
        </Flex>
      ),
    }));

  // Known by this name (in any unit) needs no question; a new name gets the items it may mean.
  const known = !!typed && (!!masterItemFor(typed, unit ?? '', items) || items.some((i) => itemKey(i.name) === itemKey(typed) || i.aliases?.includes(itemKey(typed))));
  const similar = typed && !known && word === mainWord(typed) ? similarItems(typed, unit, items, 3) : [];

  return (
    <div>
      <AutoComplete value={value} onChange={onChange} options={options} onSelect={(_, o) => pick((o as { item: ItemDto }).item)} popupMatchSelectWidth={320} {...rest} />
      {similar.length > 0 && (
        <Typography.Text style={{ display: 'block', fontSize: themeFontSize('fontSizeSM'), color: themeColor('colorWarningText') }}>
          Not in the item master. Did you mean{' '}
          {similar.map((i, n) => (
            <React.Fragment key={i.id}>
              {n > 0 && (n === similar.length - 1 ? ' or ' : ', ')}
              <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 'inherit' }} onClick={() => pick(i)}>
                <span translate="no">{i.name}</span>&nbsp;({i.unit})
              </Button>
            </React.Fragment>
          ))}
          ?
        </Typography.Text>
      )}
    </div>
  );
}
