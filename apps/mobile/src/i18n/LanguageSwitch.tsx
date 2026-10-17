import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, maxFontScale, radius, spacing, touch } from '../theme';
import { LANGUAGES, useLanguage } from './LanguageContext';

/**
 * English / हिन्दी before signing in (UX item 80), on the intro and the sign-in screen, so a Hindi reader never has to
 * find Profile in English first. Each language is written in its own script.
 */
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  const options = LANGUAGES.filter((l) => l.available);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((l) => {
        const active = l.code === language;
        const name = l.code === 'hi' ? 'हिन्दी' : 'English';
        return (
          <Pressable
            key={l.code}
            onPress={() => setLanguage(l.code)}
            style={[styles.option, active && styles.active]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={l.label}
            accessibilityLanguage={l.code}
            hitSlop={4}
          >
            <Text style={[styles.text, active && styles.activeText]} maxFontSizeMultiplier={maxFontScale}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.pill, padding: 2, alignSelf: 'flex-start' },
  option: { minHeight: touch.heightSm - 4, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.pill },
  active: { backgroundColor: colors.primary },
  text: { fontSize: 14, fontWeight: '600', color: colors.text },
  activeText: { color: colors.textOnPrimary },
});
