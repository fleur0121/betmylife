/** Habit DNA summaries calculated from the signed-in user's saved challenges. */
import { BrandAsset, type BrandAssetName } from "@/components/brand-asset";
import { Text } from "@/components/localized-text";
import {
  Card,
  PageHeading,
  ProgressBar,
  Screen,
  SectionHeader,
  StatCard,
  s,
} from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useLanguage } from "@/i18n/language";
import { getChallenges, type SavedChallenge } from "@/services/challenge-service";
import { useAppState } from "@/state/app-state";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

const categories = [
  { name: "Study", asset: "iconStudy" },
  { name: "Fitness", asset: "iconFitness" },
  { name: "Lifestyle", asset: "iconLifestyle" },
] as const;

export default function HabitDNA() {
  const { t } = useLanguage();
  const { state } = useAppState();
  const [challenges, setChallenges] = useState<SavedChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (!state.authUserId) return;
    let active = true;
    getChallenges(state.authUserId)
      .then((items) => {
        if (!active) return;
        setChallenges(items);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load your challenge history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [state.authUserId]));

  const completed = useMemo(
    () => challenges.filter((challenge) => challenge.result === "success" || challenge.result === "failed"),
    [challenges],
  );
  const successes = completed.filter((challenge) => challenge.result === "success").length;
  const inProgress = challenges.length - completed.length;
  const categoryStats = categories.map((category) => {
    const results = completed.filter((challenge) => challenge.category === category.name);
    const wins = results.filter((challenge) => challenge.result === "success").length;
    return {
      ...category,
      count: results.length,
      value: results.length ? Math.round((wins / results.length) * 100) : 0,
    };
  });
  const bestCategory = categoryStats
    .filter((category) => category.count > 0)
    .sort((left, right) => right.value - left.value || right.count - left.count)[0];

  const insights: { asset: BrandAssetName; title: string; text: string }[] = bestCategory
    ? [
        {
          asset: bestCategory.asset,
          title: `${bestCategory.name} is your strongest category`,
          text: `${bestCategory.value}% success rate across ${bestCategory.count} completed challenge${bestCategory.count === 1 ? "" : "s"}.`,
        },
        {
          asset: "stickerBrighterDays",
          title: `${successes} challenges completed successfully`,
          text: `${completed.length - successes} completed ${completed.length - successes === 1 ? "with a miss" : "with misses"}. Every result adds to your history.`,
        },
        {
          asset: "iconAiInsight",
          title: inProgress ? `${inProgress} challenges in progress` : "No challenges in progress",
          text: inProgress ? "Come back after you finish them to update your success pattern." : "Create a new challenge when you are ready to set another goal.",
        },
      ]
    : [];

  return (
    <Screen title="Habit DNA" back>
      <PageHeading
        title="Your habit insights"
        subtitle="A summary of your saved challenge history."
      />
      {loading ? (
        <Card style={{ backgroundColor: c.lavenderLight }}>
          <Text style={s.sectionTitle}>Loading your challenge history…</Text>
        </Card>
      ) : error ? (
        <Card style={{ backgroundColor: c.pink }}>
          <Text accessibilityRole="alert" style={s.sectionTitle}>Could not load Habit DNA</Text>
          <Text style={s.muted}>{error}</Text>
        </Card>
      ) : (
        <>
          <Card style={{ backgroundColor: c.lavenderLight }}>
            <View style={styles.insightHero}>
              <View style={s.flex}>
                <Text style={s.sectionTitle}>
                  {completed.length ? "Your progress, based on your real challenges." : "Your story starts with your first completed challenge."}
                </Text>
                <Text style={[s.muted, { marginTop: 5 }]}>
                  {challenges.length ? "Only challenges saved to your account are included." : "Create a challenge and its results will appear here."}
                </Text>
              </View>
              <BrandAsset name="mascotCurious" style={styles.heroMascot} />
            </View>
            <View style={s.row}>
              <StatCard value={String(completed.length)} label="Challenges completed" />
              <StatCard value={bestCategory ? `${bestCategory.value}%` : "—"} label={bestCategory ? `Best rate · ${bestCategory.name}` : "Best success rate"} />
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
                  <Text style={[s.bold, { color: c.primary }]}>
                    {item.count ? `${item.value}%` : "—"}
                  </Text>
                </View>
                <ProgressBar value={item.value} color={item.name === "Fitness" ? c.green : c.primary} />
                {!item.count && <Text style={s.caption}>No completed challenges in this category yet.</Text>}
              </View>
            ))}
          </Card>
          <SectionHeader title="A little self-discovery" />
          {insights.length ? insights.map((insight) => (
            <Card key={insight.title}>
              <View style={s.row}>
                <BrandAsset name={insight.asset} style={styles.insightArt} />
                <Text style={[s.sectionTitle, s.flex]}>{insight.title}</Text>
              </View>
              <Text style={s.muted}>{insight.text}</Text>
            </Card>
          )) : (
            <Card style={{ alignItems: "center", backgroundColor: c.lavenderLight }}>
              <BrandAsset name="stateNoChallenges" style={styles.emptyArt} label="No completed challenges" />
              <Text style={s.sectionTitle}>No patterns to show yet</Text>
              <Text style={[s.muted, { textAlign: "center" }]}>Complete a challenge to see real category rates and progress insights.</Text>
            </Card>
          )}
          <Text style={[s.caption, { textAlign: "center" }]}>
            Based on {challenges.length} saved challenge{challenges.length === 1 ? "" : "s"}.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = {
  insightHero: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  heroMascot: { width: 91, height: 82 },
  categoryName: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  categoryIcon: { width: 48, height: 46 },
  insightArt: { width: 48, height: 48 },
  emptyArt: { width: 140, height: 105 },
};
