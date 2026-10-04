/**
 * iOS・Android・Webで共有するボトムタブナビゲーション。
 * Expo RouterのTabs／TabList／TabTrigger／TabSlotで5画面を切り替える。
 * プラットフォーム別のアイコン、選択中の色、端末下部のセーフエリアをここで統一する。
 */
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/localized-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette as c } from '@/constants/design';
const tabs = [
  {
    name: 'home',
    href: '/',
    label: 'Home',
    icon: { ios: 'house', android: 'home', web: 'home' },
  },
  {
    name: 'create',
    href: '/create',
    label: 'Create',
    icon: { ios: 'plus.app', android: 'add_box', web: 'add_box' },
  },
  {
    name: 'leaderboard',
    href: '/leaderboard',
    label: 'Leaderboard',
    icon: { ios: 'trophy', android: 'trophy', web: 'trophy' },
  },
  {
    name: 'shop',
    href: '/shop',
    label: 'Shop',
    icon: { ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' },
  },
  {
    name: 'profile',
    href: '/profile',
    label: 'Profile',
    icon: {
      ios: 'person.crop.circle',
      android: 'account_circle',
      web: 'account_circle',
    },
  },
] as const;
function TabButton({
  isFocused,
  children,
  icon,
  compose = false,
  ...props
}: TabTriggerSlotProps & { icon: SymbolViewProps['name']; compose?: boolean }) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
    >
      <View
        style={
          compose
            ? styles.composeIcon
            : isFocused
              ? styles.selectedIcon
              : styles.icon
        }
      >
        <SymbolView
          name={icon}
          size={24}
          tintColor={compose ? c.card : isFocused ? c.primary : c.muted}
        />
      </View>
      <Text style={[styles.label, isFocused && { color: c.primary }]}>
        {children}
      </Text>
    </Pressable>
  );
}
export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: c.background }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
      >
        {tabs.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton icon={tab.icon} compose={tab.name === 'create'}>
              {tab.label}
            </TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}
const styles = StyleSheet.create({
  icon: {
    width: 46,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIcon: {
    width: 46,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.lavenderLight,
    borderRadius: 18,
  },
  composeIcon: {
    width: 46,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
    borderRadius: 18,
  },
  bar: {
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
  },
  tab: {
    flex: 1,
    maxWidth: 124,
    minHeight: 48,
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, fontWeight: '600', color: c.muted },
});
