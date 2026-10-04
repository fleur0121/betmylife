/**
 * 各画面の上部に置くJP／ENデバッグスイッチ。
 * 言語のみを更新し、画面移動やフォームのリセットは行わない。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '@/i18n/language';
import { palette as c } from '@/constants/design';
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLanguage();
  return (
    <View style={styles.row}>
      {!compact && <Text style={styles.label}>{t('Debug language')}</Text>}
      <View style={styles.options}>
        {(['ja', 'en'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={
              value === 'ja' ? '日本語に切り替え' : 'Switch to English'
            }
            accessibilityState={{ selected: locale === value }}
            onPress={() => setLocale(value)}
            style={({ pressed }) => [
              styles.button,
              locale === value && styles.active,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[
                styles.label,
                locale === value && { color: c.primaryDark, fontWeight: '800' },
              ]}
            >
              {value === 'ja' ? 'JP' : 'EN'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  label: { fontSize: 12, color: c.muted },
  options: {
    flexDirection: 'row',
    backgroundColor: c.lavender,
    borderRadius: 12,
    padding: 0,
  },
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  active: { backgroundColor: c.card },
});
