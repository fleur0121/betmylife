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
import { BrandAsset } from '@/components/brand-asset';
export default function HabitDNA() {
  const { t } = useLanguage();
  return (
    <Screen title="Habit DNA" back>
      <PageHeading
        title="Your habit insights"
        subtitle="Track your success rate and find your strengths."
      />
      <Card style={{ backgroundColor: c.lavenderLight }}>
        <View style={styles.insightHero}>
          <View style={s.flex}>
            <Text style={s.sectionTitle}>You’re a work in progress. In the best way.</Text>
            <Text style={[s.muted, { marginTop: 5 }]}>A snapshot of your everyday challenges.</Text>
          </View>
          <BrandAsset name="mascotCurious" style={styles.heroMascot} />
        </View>
        <View style={s.row}>
          <StatCard value="12" label="Challenges completed" />
          <StatCard value="80%" label="Best category · Fitness" />
        </View>
      </Card>
      <SectionHeader title="Where you shine" detail="SUCCESS RATE" />
      <Card>
        {categoryStats.map((item) => (
          <View key={item.name} style={{ gap: 12 }}>
            <View style={s.between}>
              <View style={styles.categoryName}>
                <BrandAsset name={item.asset} style={styles.categoryIcon} />
                <Text style={s.bold}>{t(item.name)}</Text>
              </View>
              <Text style={[s.bold, { color: c.primary }]}>{item.value}%</Text>
            </View>
            <ProgressBar
              value={item.value}
              color={item.name === 'Fitness' ? c.green : c.primary}
            />
          </View>
        ))}
      </Card>
      <SectionHeader title="A little self-discovery" />
      {insights.map((insight) => (
        <Card key={insight.title}>
          <View style={s.row}>
            <BrandAsset name={insight.asset} style={styles.insightArt} />
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
const styles = {
  insightHero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  heroMascot: { width: 91, height: 82 },
  categoryName: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  categoryIcon: { width: 48, height: 46 },
  insightArt: { width: 48, height: 48 },
};
