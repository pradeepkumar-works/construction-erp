import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, maxFontScale, radius, spacing, touch } from '../theme';
import { Touchable } from '../components/Touchable';
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
          <Touchable
            key={l.code}
            onPress={() => setLanguage(l.code)}
            style={[styles.option, active && styles.active]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={l.label}
            accessibilityLanguage={l.code}
            hitSlop={2}
          >
            <Text style={[styles.text, active && styles.activeText]} maxFontSizeMultiplier={maxFontScale}>
              {name}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.pill, padding: 2, alignSelf: 'flex-start' },
  option: { minHeight: touch.min - 4, paddingHorizontal: spacing.md, justifyContent: 'center', borderRadius: radius.pill },
  active: { backgroundColor: colors.primary },
  text: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.text },
  activeText: { color: colors.textOnPrimary },
});
