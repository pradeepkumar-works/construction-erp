import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, maxFontScale, spacing, typography } from '../theme';
import { useT } from '../i18n/LanguageContext';
import { BottomSheet, SheetActions, type SheetAction } from './BottomSheet';
import { IconButton } from './Touchable';

/**
 * The head of a record outside the approval flow (a delay or risk, a permit, an incident, a snag, an NCR, a letter):
 * number and project, the record's own title, its status pills, and a More button whose sheet holds the links
 * elsewhere ("Open project", "Safety at this project"). Only the deciding buttons stay on the page.
 */
export function RecordHead({ caption, title, pills, more }: { caption: string; title: string; pills?: React.ReactNode; more: SheetAction[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.head}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.caption}>
            {caption}
          </Text>
          <Text maxFontSizeMultiplier={maxFontScale} style={typography.h2} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {more.length ? <IconButton icon="ellipsis-horizontal" filled={colors.primarySoft} onPress={() => setOpen(true)} accessibilityLabel={t('More actions')} /> : null}
      </View>
      {pills ? <View style={styles.pills}>{pills}</View> : null}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={t('More')} subtitle={title}>
        <SheetActions actions={more} onClose={() => setOpen(false)} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
