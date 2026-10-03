/**
 * アプリ全体の入口となるルートレイアウト。
 * LanguageProviderとAppProviderで言語・モック状態を共有し、Stackでタブ・Habit DNA・友達画面を管理する。
 * 各画面の独自ヘッダーを使うため標準ヘッダーは非表示にし、ステータスバーの文字色を指定する。
 */
import { LanguageProvider } from '@/i18n/language';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/state/app-state';
export default function RootLayout() {
  return (
    <LanguageProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="habit-dna" />
          <Stack.Screen name="friends" />
        </Stack>
      </AppProvider>
    </LanguageProvider>
  );
}
