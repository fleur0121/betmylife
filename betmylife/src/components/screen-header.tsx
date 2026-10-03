/**
 * 画面上部に固定する共通ヘッダー。
 * 画面名・戻る操作・友達追加・小さなJP／ENスイッチを同じ位置に揃える。
 * ホームでは自分のアバターからプロフィールへ移動できる。
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './localized-text';
import { LanguageSwitch } from './language-switch';
import { palette as c } from '@/constants/design';
import { useLanguage } from '@/i18n/language';
export function ScreenHeader({
  title,
  home = false,
  back = false,
}: {
  title: string;
  home?: boolean;
  back?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <View style={styles.header}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/profile')
          }
          style={({ pressed }) => [styles.icon, pressed && { opacity: 0.55 }]}
        >
          <SymbolView
            name={{
              ios: 'arrow.left',
              android: 'arrow_back',
              web: 'arrow_back',
            }}
            size={22}
            tintColor={c.text}
          />
        </Pressable>
      )}
      {home && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Open your profile')}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.55 }]}
        >
          <Text style={{ fontSize: 24 }}>🌷</Text>
        </Pressable>
      )}
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {home && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Add friends')}
          onPress={() => router.push('/friends')}
          style={({ pressed }) => [styles.icon, pressed && { opacity: 0.55 }]}
        >
          <SymbolView
            name={{
              ios: 'person.badge.plus',
              android: 'person_add',
              web: 'person_add',
            }}
            size={24}
            tintColor={c.primary}
          />
        </Pressable>
      )}
      <LanguageSwitch compact />
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    minHeight: 64,
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontWeight: '800',
    fontSize: 20,
    color: c.text,
  },
  avatar: {
    width: 40,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: c.lavenderLight,
  },
  icon: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
