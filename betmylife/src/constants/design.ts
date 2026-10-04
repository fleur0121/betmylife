/**
 * Predict My Lifeの共通デザイントークン。
 * 色、余白、角丸、文字サイズをまとめ、複数画面の見た目を一か所で調整できるようにする。
 * 既存スターターのthemeとは分けて、新しいUIの基本スタイルに利用する。
 */
export const palette = {
  primary: '#3B82F6',
  primaryDark: '#2453A8',
  purple: '#8B5CF6',
  lavender: '#EEE7FF',
  lavenderLight: '#F6F2FF',
  background: '#FBF9F6',
  card: '#FFFDFC',
  text: '#171A27',
  muted: '#777985',
  border: '#ECE8E2',
  green: '#138760',
  mint: '#DDF8EC',
  pink: '#FFE8E9',
  red: '#FF6B6B',
  gold: '#A77620',
  cream: '#FFF3CE',
  peach: '#FFE6DE',
  coral: '#FF6B6B',
  yellow: '#FFD166',
  sky: '#DCEBFF',
} as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 12, md: 18, lg: 24, pill: 999 };
export const type = {
  caption: 12,
  body: 14,
  subtitle: 16,
  heading: 22,
  title: 30,
  display: 40,
};
