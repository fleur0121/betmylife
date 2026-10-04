/**
 * 5つのメイン画面に共通するタブレイアウト。
 * ナビゲーションの実装はcomponents側に置き、このファイルではExpo Routerのルートとして公開する。
 */
import { Redirect } from "expo-router";
import AppTabs from "@/components/app-tabs";
import { useAppState } from "@/state/app-state";

export default function ProtectedTabs() {
  const { state } = useAppState();
  if (!state.authUserId) return <Redirect href="/auth" />;
  return <AppTabs />;
}
