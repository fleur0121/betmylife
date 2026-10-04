/**
 * タイムラインやプロフィール用の下線付きタブ。
 * データの絞り込みは親画面に任せ、選択状態と44pt以上のタップ領域を提供する。
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './localized-text';
import { palette as c } from '@/constants/design';
export function FeedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.tabs}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityState={{ selected: option === value }}
          onPress={() => onChange(option)}
          style={({ pressed }) => [
            styles.tab,
            pressed && { backgroundColor: c.lavenderLight },
          ]}
        >
          <Text style={[styles.label, option === value && styles.selected]}>
            {option}
          </Text>
          <View
            style={[
              styles.line,
              option === value && { backgroundColor: c.primary },
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    paddingTop: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: { fontSize: 14, fontWeight: '600', color: c.muted },
  selected: { color: c.text, fontWeight: '800' },
  line: {
    height: 3,
    width: 38,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
});
