/**
 * 各画面で再利用する基本UIと共通スタイルをまとめたファイル。
 * Screenはセーフエリアとスクロール、CardやAvatarは表示、ButtonやSegmentsは操作を担当する。
 * 見出し・ピル・統計・進捗バーもここで定義し、designのトークンで色や余白の一貫性を保つ。
 * 業務データの更新は行わず、表示内容やイベントハンドラーを呼び出し元から受け取る。
 */
import { ScreenHeader } from './screen-header';
import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Text } from '@/components/localized-text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as c, radius, space, type } from '@/constants/design';
import { BrandAsset, type BrandAssetName } from '@/components/brand-asset';
export function Screen({
  children,
  title = 'Predict My Life',
  back = false,
}: PropsWithChildren<{ title?: string; back?: boolean }>) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.screen}>
      <ScreenHeader title={title} back={back} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.heading}>
      <View style={s.flex}>
        {eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Avatar({
  emoji,
  color = c.lavender,
  size = 46,
  framed = false,
  frameColor = c.primary,
}: {
  emoji: string;
  color?: string;
  size?: number;
  framed?: boolean;
  frameColor?: string;
}) {
  const avatarMoods: BrandAssetName[] = [
    'mascotCheerful',
    'mascotSupportive',
    'mascotCurious',
    'mascotCelebrating',
    'mascotReading',
    'mascotActive',
    'mascotFocused',
    'mascotCheering',
  ];
  const moodIndex = [...emoji].reduce((sum, character) => sum + character.codePointAt(0)!, 0) % avatarMoods.length;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: framed ? 3 : 0,
        borderColor: frameColor,
      }}
    >
      <BrandAsset name={avatarMoods[moodIndex]} style={{ width: size * 1.15, height: size * 1.15 }} />
    </View>
  );
}
export function Pill({
  children,
  tone = 'purple',
}: PropsWithChildren<{ tone?: 'purple' | 'green' | 'pink' | 'neutral' }>) {
  const colors = {
    purple: [c.lavender, c.primaryDark],
    green: [c.mint, c.green],
    pink: [c.pink, c.red],
    neutral: [c.background, c.muted],
  };
  return (
    <View style={[s.pill, { backgroundColor: colors[tone][0] }]}>
      <Text style={[s.caption, { color: colors[tone][1], fontWeight: '600' }]}>
        {children}
      </Text>
    </View>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
        pressed && s.pressed,
      ]}
    >
      <View style={s.buttonContent}>
        {loading && <ActivityIndicator size="small" color={secondary ? c.primary : c.card} />}
        <Text style={[s.buttonText, secondary && { color: c.primaryDark }]}>{label}</Text>
      </View>
    </Pressable>
  );
}
export function SectionHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={s.between}>
      <Text style={s.sectionTitle}>{title}</Text>
      {detail && <Text style={s.caption}>{detail}</Text>}
    </View>
  );
}
export function StatCard({
  value,
  label,
  emoji,
}: {
  value: string;
  label: string;
  emoji?: string;
}) {
  return (
    <View style={s.stat}>
      {emoji && <Text style={s.body}>{emoji}</Text>}
      <Text style={s.statValue}>{value}</Text>
      <Text style={[s.caption, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}
export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.segments}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option }}
          onPress={() => onChange(option)}
          style={({ pressed }) => [
            s.segment,
            value === option && s.segmentActive,
            pressed && s.pressed,
          ]}
        >
          <Text
            style={[
              s.segmentText,
              value === option && { color: c.primaryDark },
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function ProgressBar({
  value,
  color = c.primary,
}: {
  value: number;
  color?: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={s.track}
    >
      <View style={[s.fill, { width: `${value}%`, backgroundColor: color }]} />
    </View>
  );
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  title: {
    color: c.text,
    fontSize: type.heading,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: c.primary,
    letterSpacing: 2,
    marginBottom: space.sm,
  },
  subtitle: {
    color: c.muted,
    fontSize: type.body,
    lineHeight: 21,
    marginTop: 6,
  },
  card: {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: c.border,
    gap: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  body: { fontSize: type.body, lineHeight: 21, color: c.text },
  muted: { fontSize: type.body, lineHeight: 21, color: c.muted },
  caption: { fontSize: type.caption, lineHeight: 17, color: c.muted },
  bold: { fontWeight: '700', color: c.text },
  sectionTitle: { fontSize: type.subtitle, fontWeight: '800', color: c.text },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.md,
  },
  secondary: { backgroundColor: c.lavender },
  buttonText: {
    color: c.card,
    fontWeight: '700',
    fontSize: type.body,
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  stat: { flex: 1, alignItems: 'center', paddingVertical: space.md, gap: 6 },
  statValue: { color: c.text, fontSize: type.heading, fontWeight: '800' },
  segments: {
    flexDirection: 'row',
    backgroundColor: '#EDEAF3',
    padding: 4,
    borderRadius: radius.sm,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 3,
    borderRadius: 9,
  },
  segmentActive: { backgroundColor: c.card },
  segmentText: {
    fontSize: 12,
    color: c.muted,
    fontWeight: '700',
    textAlign: 'center',
  },
  track: {
    height: 7,
    backgroundColor: c.lavender,
    borderRadius: 8,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 8 },
});
