/**
 * 画面上部に固定する共通ヘッダー。
 * 画面名・戻る操作・友達追加・小さなJP／ENスイッチを同じ位置に揃える。
 * ホームでは自分のアバターからプロフィールへ移動できる。
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './localized-text';
import { LanguageSwitch } from './language-switch';
import { palette as c } from '@/constants/design';
import { useLanguage } from '@/i18n/language';
import { BrandAsset } from './brand-asset';
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
      {home ? (
        <View style={styles.wordmark}>
          <Text translate={false} style={styles.wordmarkTop}>Predict</Text>
          <Text translate={false} style={styles.wordmarkBottom}>My Life<Text translate={false} style={styles.wordmarkSparkle}> ✦</Text></Text>
        </View>
      ) : (
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      )}
      {home && (
        <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => Alert.alert(t('All caught up'), t('Your circle is waiting for its next prediction.'))}
          style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.55 }]}
        >
          <SymbolView
            name={{
              ios: 'bell',
              android: 'notifications_none',
              web: 'notifications_none',
            }}
            size={22}
            tintColor={c.text}
          />
          <View style={styles.notificationDot} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Open your profile')}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.55 }]}
        >
          <BrandAsset name="mascotCheerful" style={styles.avatarMascot} />
        </Pressable>
        </>
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
    minHeight: 68,
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
  wordmark: { flex: 1, minWidth: 0, justifyContent: 'center' },
  wordmarkTop: { color: c.text, fontSize: 17, lineHeight: 18, fontWeight: '900', letterSpacing: -0.6 },
  wordmarkBottom: { color: c.primary, fontSize: 17, lineHeight: 19, fontWeight: '900', letterSpacing: -0.5 },
  wordmarkSparkle: { color: c.purple, fontSize: 13 },
  iconButton: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', top: 8, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: c.coral, borderWidth: 1, borderColor: c.card },
  avatar: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: c.lavender,
  },
  avatarMascot: { width: 43, height: 43, marginTop: 2 },
  icon: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
