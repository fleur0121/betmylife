/**
 * Webでサーバー描画と初回クライアント描画のテーマを一致させるフック。
 * ハイドレーション前はlightを返し、その後はReact Nativeが取得した端末のテーマを返す。
 * useSyncExternalStoreでサーバー／クライアントの段階を判別し、Effect内の即時setStateを避ける。
 */
import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Keep the server and first hydration render consistent before reading the device theme. */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const colorScheme = useRNColorScheme();
  return hasHydrated ? colorScheme : 'light';
}
