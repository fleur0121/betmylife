/**
 * Predict My Lifeの共通デザイントークン。
 * 色、余白、角丸、文字サイズをまとめ、複数画面の見た目を一か所で調整できるようにする。
 * 既存スターターのthemeとは分けて、新しいUIの基本スタイルに利用する。
 */
export const palette = {
  primary: '#7652CD',
  primaryDark: '#5533A0',
  lavender: '#EEE7FC',
  lavenderLight: '#F6F2FF',
  background: '#F8F7FB',
  card: '#FFFFFF',
  text: '#28233C',
  muted: '#777186',
  border: '#EAE6F1',
  green: '#267B5A',
  mint: '#E8F5ED',
  pink: '#FCECEF',
  red: '#AF526A',
  gold: '#A77620',
  cream: '#FFF3D8',
  peach: '#FFE8DA',
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
