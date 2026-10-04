import { StyleSheet, View } from "react-native";
import { Text } from "@/components/localized-text";
import { BrandAsset } from "@/components/brand-asset";
import type { Challenge } from "@/mock/data";
import { useAppState } from "@/state/app-state";
import { palette as c } from "@/constants/design";
import { PredictionPanel } from "@/components/prediction-panel";

export function FeaturedChallengeCard({ challenge }: { challenge: Challenge }) {
  const { state } = useAppState();
  const selected = state.predictions[challenge.id];
  return (
    <View style={styles.card}>
      <View style={styles.topLine}>
        <View style={styles.challengeTag}>
          <Text style={styles.challengeTagText}>TODAY’S CHALLENGE</Text>
        </View>
        <View style={styles.deadline}>
          <Text translate={false} style={styles.deadlineText}>◷  {challenge.deadline.replace("Today · ", "")}</Text>
        </View>
      </View>
      <View style={styles.authorLine}>
        <View style={styles.authorAvatar}>
          <BrandAsset name="mascotCheerful" style={styles.authorMascot} />
        </View>
        <Text translate={false} style={styles.authorName}>{challenge.user}</Text>
        <View style={styles.categoryPill}>
          <BrandAsset name="iconStudy" style={styles.categoryIcon} />
        </View>
        <Text style={styles.categoryName}>Study</Text>
      </View>
      <Text style={styles.title}>{challenge.title}</Text>
      <Text translate={false} style={styles.confidence}>{challenge.user} is feeling <Text style={styles.confidenceValue}>{challenge.confidence}%</Text> confident</Text>

      <View style={styles.aiSticker}>
        <Text style={styles.aiNumber}>{challenge.probability}%</Text>
        <Text style={styles.aiCaption}>AI CHANCE</Text>
      </View>
      <BrandAsset name="mascotReading" style={styles.readingMascot} label="Predict My Life mascot reading" />

      <View style={styles.predictionMeta}>
        <BrandAsset name="iconPrediction" style={styles.predictionIcon} />
        <Text style={styles.predictionCount}>{challenge.friends + (selected ? 1 : 0)} friend predictions</Text>
        <Text style={styles.oddsLabel}>PICK A SIDE · LOCK YOUR ODDS</Text>
      </View>
      <PredictionPanel challenge={challenge} variant="featured" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 318, padding: 17, borderRadius: 26, backgroundColor: c.primary, overflow: "hidden" },
  topLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  challengeTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: c.yellow },
  challengeTagText: { color: c.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  deadline: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)" },
  deadlineText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  authorLine: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14 },
  authorAvatar: { width: 27, height: 27, borderRadius: 16, backgroundColor: "#FFFFFF", overflow: "hidden" },
  authorMascot: { width: 30, height: 30, marginTop: -2 },
  authorName: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  categoryPill: { marginLeft: 5, width: 34, height: 30, borderRadius: 14, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  categoryIcon: { width: 30, height: 29 },
  categoryName: { color: "#DFE8FF", fontSize: 10, fontWeight: "700" },
  title: { maxWidth: "72%", marginTop: 8, color: "#FFFFFF", fontSize: 27, lineHeight: 30, letterSpacing: -0.7, fontWeight: "900" },
  confidence: { marginTop: 5, color: "#DCE7FF", fontSize: 10, fontWeight: "600" },
  confidenceValue: { color: c.yellow, fontWeight: "900" },
  aiSticker: { position: "absolute", top: 93, right: 17, zIndex: 2, width: 73, height: 73, alignItems: "center", justifyContent: "center", borderRadius: 38, backgroundColor: c.yellow, borderWidth: 3, borderColor: "#FFFFFF", transform: [{ rotate: "7deg" }] },
  aiNumber: { color: c.text, fontSize: 22, fontWeight: "900" },
  aiCaption: { color: c.text, fontSize: 8, fontWeight: "900", letterSpacing: 0.4 },
  readingMascot: { position: "absolute", width: 126, height: 132, right: 7, top: 116 },
  predictionMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 83 },
  predictionIcon: { width: 26, height: 26 },
  predictionCount: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  oddsLabel: { marginLeft: "auto", color: "#DCE7FF", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
});
