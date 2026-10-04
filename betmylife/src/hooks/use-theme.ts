/**
 * 端末のカラースキームからスターター用の色テーマを取得するフック。
 * 未指定の場合はlightを選び、ThemedTextやThemedViewに共通の色を渡す。
 */
/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
}
