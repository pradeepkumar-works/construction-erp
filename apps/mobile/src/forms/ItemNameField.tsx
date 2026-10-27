import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ItemDto, Paginated } from '@erp/shared';
import { MAX_PAGE_SIZE, itemKey, masterItemFor, similarItems } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { Input, Touchable } from '../components';
import { useT } from '../i18n/LanguageContext';
import type { FieldProps } from './keyboard';
import { colors, fontSize, maxFontScale, spacing, typography } from '../theme';

/**
 * The item master on the phone, kept for offline use: the same list the web's ItemPicker searches. One fetch serves
 * every line of the form.
 */
export function useItemMaster() {
  const res = useFetch<Paginated<ItemDto>>((a) => a.get('/stock/items', { pageSize: MAX_PAGE_SIZE }), [], { refetchOnFocus: false, cacheKey: 'item-master:v1' });
  return res.data?.items ?? [];
}

/** Every word typed is in the item's name or one of its old names. */
const matches = (typed: string, item: ItemDto) => {
  const words = itemKey(typed).split(' ').filter(Boolean);
  const names = [itemKey(item.name), ...(item.aliases ?? [])];
  return names.some((n) => words.every((w) => n.includes(w)));
};

interface Props {
  value: string;
  onChange: (name: string) => void;
  /** A master item was picked: the line takes its name and unit */
  onPick: (item: ItemDto) => void;
  unit: string | null;
  items: ItemDto[];
  accessibilityLabel: string;
  placeholder?: string;
  inputProps?: FieldProps;
}

/**
 * The item of a request line (finding 3 of the October review), as on the web: while typing, the master's items that
 * match are offered with their unit, so the same cement is not three items to stock, rates and leakage. A name the
 * master does not know is still taken (it is added when first received), but first the field offers what it may mean.
 */
export function ItemNameField({ value, onChange, onPick, unit, items, accessibilityLabel, placeholder, inputProps }: Props) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  // Blur waits a moment, so a tap on an offer lands before the list closes.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);
  const typed = value.trim();
  const known = !!typed && (!!masterItemFor(typed, unit ?? '', items) || items.some((i) => itemKey(i.name) === itemKey(typed) || i.aliases?.includes(itemKey(typed))));
  const offers = focused && typed.length >= 2 && !known ? items.filter((i) => matches(typed, i)).slice(0, 5) : [];
  const similar = !focused && typed && !known && items.length ? similarItems(typed, unit, items, 3) : [];

  const row = (i: ItemDto) => (
    <Touchable
      key={i.id}
      accessibilityRole="button"
      accessibilityLabel={t('Use {item}, {unit}', { item: i.name, unit: i.unit })}
      onPress={() => {
        onPick(i);
        setFocused(false);
      }}
      style={styles.offer}
    >
      <Text maxFontSizeMultiplier={maxFontScale} style={styles.offerName} numberOfLines={2}>
        {i.name}
      </Text>
      <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
        {i.unit}
      </Text>
    </Touchable>
  );

  return (
    <View style={styles.wrap}>
      <Input
        {...inputProps}
        value={value}
        onChangeText={onChange}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 200);
        }}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        containerStyle={styles.input}
      />
      {offers.length ? <View style={styles.list}>{offers.map(row)}</View> : null}
      {similar.length ? (
        <View style={styles.list}>
          <Text maxFontSizeMultiplier={maxFontScale} style={styles.warn}>
            {t('Not in the item master. Did you mean:')}
          </Text>
          {similar.map(row)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  input: { marginBottom: 0 },
  list: { marginTop: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  offer: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  offerName: { flex: 1, fontSize: fontSize.body, color: colors.text, marginRight: spacing.md },
  warn: { ...typography.caption, color: colors.accent, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
