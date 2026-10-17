import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, maxFontScale, radius, spacing, touch, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

interface Props<V extends string> {
  label?: string;
  value: V | null;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  emptyText?: string;
}

/** Modal picker with large rows; searchable for long option lists. */
export function Select<V extends string>({ label, value, options, onChange, placeholder, error, required, disabled, searchable, emptyText }: Props<V>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s) || o.hint?.toLowerCase().includes(s));
  }, [options, q]);
  const showSearch = searchable ?? options.length > 8;

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.field, !!error && styles.fieldError, disabled && styles.disabled]}
        accessibilityRole="button"
      >
        <View style={styles.flex}>
          <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
            {selected ? selected.label : (placeholder ?? t('Select…'))}
          </Text>
          {selected?.hint ? (
            <Text style={styles.hint} numberOfLines={1} maxFontSizeMultiplier={maxFontScale}>
              {selected.hint}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={typography.h2}>{label ?? t('Select')}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} style={styles.close}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          {showSearch ? (
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder={t('Search')} placeholderTextColor={colors.textMuted} style={styles.searchInput} autoFocus={false} />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={<Text style={styles.empty}>{emptyText ?? t('No options')}</Text>}
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQ('');
                  }}
                  style={[styles.row, active && styles.rowActive]}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>{item.label}</Text>
                    {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  flex: { flex: 1 },
  label: { ...typography.label, marginBottom: spacing.xs },
  req: { color: colors.danger },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: touch.height,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fieldError: { borderColor: colors.danger },
  disabled: { opacity: 0.6 },
  value: { fontSize: 16, color: colors.text },
  placeholder: { color: colors.textMuted },
  hint: { ...typography.caption, marginTop: 2 },
  error: { color: colors.danger, marginTop: spacing.xs, fontSize: 13 },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  close: { padding: spacing.xs },
  search: { flexDirection: 'row', alignItems: 'center', margin: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md, minHeight: touch.heightSm },
  searchInput: { flex: 1, marginLeft: spacing.sm, fontSize: 16, color: colors.text, paddingVertical: spacing.sm },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, minHeight: touch.height + 8 },
  rowActive: { backgroundColor: colors.primarySoft },
  rowLabel: { fontSize: 16, color: colors.text },
  rowLabelActive: { fontWeight: '700', color: colors.primaryDark },
  empty: { ...typography.caption, textAlign: 'center', padding: spacing.xl },
});
