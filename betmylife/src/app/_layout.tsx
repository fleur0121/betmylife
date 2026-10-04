/**
 * アプリ全体の入口となるルートレイアウト。
 * LanguageProviderとAppProviderで言語・モック状態を共有し、Stackでタブ・Habit DNA・友達画面を管理する。
 * 各画面の独自ヘッダーを使うため標準ヘッダーは非表示にし、ステータスバーの文字色を指定する。
 */
import { LanguageProvider } from '@/i18n/language';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useAppState } from '@/state/app-state';
import { AchievementToast } from '@/components/achievement-toast';
import type { ReactNode } from 'react';
export default function RootLayout() {
  return (
    <LanguageProvider>
      <AppProvider>
        <AuthGate>
          <StatusBar style="dark" />
          <Stack initialRouteName="auth" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="auth" />
            <Stack.Screen name="profile-setup" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="habit-dna" />
            <Stack.Screen name="friends" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="badges" />
          </Stack>
          <AchievementToast />
        </AuthGate>
      </AppProvider>
    </LanguageProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { state } = AppContextValue();
  const segments = useSegments();
  const isAuthRoute = segments[0] === "auth";

  if (!state.authUserId && !isAuthRoute) return <Redirect href="/auth" />;
  return <>{children}</>;
}

function AppContextValue() {
  // Kept in a small wrapper so the route guard remains local to the root layout.
  // The actual context hook is imported lazily below to avoid changing providers.
  return useAppState();
}
