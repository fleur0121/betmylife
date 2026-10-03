/**
 * Habit DNA画面。カテゴリ別の達成率と行動に関するヒントを表示する。
 * グラフは共通のProgressBarで描画し、重いチャートライブラリは使わない。
 * 数値とヒントはすべてモックデータ。戻る履歴がない直接アクセス時はProfileへ移動する。
 */
import { useLanguage } from '@/i18n/language';
import { View } from 'react-native';
import { Text } from '@/components/localized-text';
import {
  Card,
  PageHeading,
  ProgressBar,
  Screen,
  SectionHeader,
  StatCard,
  s,
} from '@/components/ui-kit';
import { categoryStats, insights } from '@/mock/data';
import { palette as c } from '@/constants/design';
export default function HabitDNA() {
  const { t } = useLanguage();
  return (
    <Screen title="Habit DNA" back>
      <PageHeading
        title="Your habit insights"
        subtitle="Track your success rate and find your strengths."
      />
      <Card style={{ backgroundColor: c.lavenderLight }}>
        <Text style={s.sectionTitle}>
          You’re a work in progress. In the best way.
        </Text>
        <Text style={s.muted}>
          A snapshot of your habits, built from your everyday challenges.
        </Text>
        <View style={s.row}>
          <StatCard value="12" label="Challenges completed" />
          <StatCard value="80%" label="Best category · Gym" />
        </View>
      </Card>
      <SectionHeader title="Where you shine" detail="SUCCESS RATE" />
      <Card>
        {categoryStats.map((item) => (
          <View key={item.name} style={{ gap: 12 }}>
            <View style={s.between}>
              <Text style={s.bold}>
                {item.emoji} {t(item.name)}
              </Text>
              <Text style={[s.bold, { color: c.primary }]}>{item.value}%</Text>
            </View>
            <ProgressBar
              value={item.value}
              color={item.name === 'Gym' ? c.green : c.primary}
            />
          </View>
        ))}
      </Card>
      <SectionHeader title="A little self-discovery" />
      {insights.map((insight) => (
        <Card key={insight.title}>
          <View style={s.row}>
            <Text style={{ fontSize: 27 }}>{insight.emoji}</Text>
            <Text style={[s.sectionTitle, s.flex]}>{insight.title}</Text>
          </View>
          <Text style={s.muted}>{insight.text}</Text>
        </Card>
      ))}
      <Text style={[s.caption, { textAlign: 'center' }]}>
        Illustrative insights from mock data · Not a real AI analysis
      </Text>
    </Screen>
  );
}
