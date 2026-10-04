/**
 * タイムライン形式のチャレンジ投稿。アバター・投稿本文・AI確率・予想操作の順に読める構成。
 * YES／NOは1タップで選択し、選択済み表示と人数を共有状態から更新する。
 * 倍率はポイント用。背景色だけでなくチェックマークでも選択状態を伝える。
 */
import { palette as c } from "@/constants/design";
import { useLanguage } from "@/i18n/language";
import type { Challenge } from "@/mock/data";
import { friendDirectory } from "@/mock/friends";
import { useAppState } from "@/state/app-state";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import { BrandAsset } from "./brand-asset";
import { Text } from "./localized-text";
import { PredictionPanel } from "./prediction-panel";
import { Avatar, Pill, ProgressBar, s } from "./ui-kit";
export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const { state, dispatch } = useAppState();
  const { t } = useLanguage();
  const ownChallenge = challenge.ownerId === state.authUserId;
  const selected = state.predictions[challenge.id];
  const author = friendDirectory.find(
    (friend) => friend.name === challenge.user,
  );
  function removePost() {
    if (Platform.OS === "web") {
      if (globalThis.confirm(t("Delete this challenge?"))) {
        dispatch({ type: "delete", id: challenge.id });
      }
      return;
    }
    Alert.alert(t("Delete post"), t("Delete this challenge?"), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Delete"),
        style: "destructive",
        onPress: () => dispatch({ type: "delete", id: challenge.id }),
      },
    ]);
  }
  return (
    <View style={styles.post}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${challenge.user}'s profile`}
        onPress={() => (challenge.ownerId ?? author?.id) && router.push(`/user/${challenge.ownerId ?? author?.id}`)}
        disabled={!challenge.ownerId && !author}
        style={({ pressed }) => [styles.author, pressed && s.pressed]}
      >
        <Avatar emoji={challenge.avatar} color={challenge.color} size={42} />
        <View style={styles.authorIdentity}>
          <View style={styles.nameRow}>
            <Text translate={false} style={s.bold}>
              {challenge.user}
            </Text>
            <Text
              translate={false}
              numberOfLines={1}
              style={[s.caption, { flexShrink: 1 }]}
            >
              @{challenge.ownerUsername ?? author?.id ?? challenge.user.toLowerCase()}
            </Text>
          </View>
          <Text style={s.caption}>◷ {challenge.deadline}</Text>
        </View>
        <View style={styles.authorTags}>
          <View
            style={[
              styles.categoryTag,
              {
                backgroundColor:
                  challenge.category === "Fitness"
                    ? c.mint
                    : challenge.category === "Study"
                      ? c.sky
                      : c.lavender,
              },
            ]}
          >
            <BrandAsset
              name={
                challenge.category === "Fitness"
                  ? "iconFitness"
                  : challenge.category === "Study"
                    ? "iconStudy"
                    : "iconLifestyle"
              }
              style={styles.categoryIcon}
            />
            <Text style={styles.categoryName}>{challenge.category}</Text>
          </View>
          {challenge.proofPlan && (
            <Pill tone="neutral">
              {challenge.proofPlan.requirements[0]?.method === "photo"
                ? "Photo proof"
                : challenge.proofPlan.requirements[0]?.method === "timer"
                  ? "Timer proof"
                  : challenge.proofPlan.requirements[0]?.method ===
                      "self_report"
                    ? "Self report"
                    : "✦ Proof Plan"}
            </Pill>
          )}
        </View>
      </Pressable>
      <Text translate={false} style={styles.title}>
        {challenge.title}
      </Text>
      <View style={styles.forecast}>
        <View style={s.between}>
          <Text style={styles.aiLabel}>✦ AI PREDICTION</Text>
          <Text style={styles.percent}>{challenge.probability}%</Text>
        </View>
        <ProgressBar value={challenge.probability} />
        <View style={s.between}>
          <Text style={s.caption}>
            {ownChallenge ? "Your confidence" : "Their confidence"} {challenge.confidence}%
          </Text>
          <Text style={s.caption}>Mock estimate</Text>
        </View>
      </View>
      {!ownChallenge && (
        <View style={styles.voteLabel}>
          <Text style={styles.question}>Will they make it?</Text>
          <Text style={s.caption}>Stake points</Text>
        </View>
      )}
      <PredictionPanel challenge={challenge} />
      <View style={styles.footer}>
        <Text style={s.caption}>
          👥 {challenge.friends + (selected ? 1 : 0)} friend predictions
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[s.caption, { color: selected ? c.primary : c.muted }]}
        >
          {selected
            ? `You’re locked on ${selected.toUpperCase()}`
            : ownChallenge
              ? "Your challenge is waiting for predictions"
              : "Choose a side to stake points"}
        </Text>
        {challenge.ownerId === state.authUserId && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Delete post")}
            onPress={removePost}
            style={({ pressed }) => [styles.delete, pressed && s.pressed]}
          >
            <SymbolView
              name={{ ios: "trash", android: "delete", web: "delete" }}
              size={18}
              tintColor={c.red}
            />
            <Text style={styles.deleteText}>{t("Delete")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  post: {
    padding: 16,
    gap: 12,
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  author: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  authorIdentity: { flex: 1, minWidth: 150, paddingTop: 2 },
  authorTags: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 5,
    maxWidth: "48%",
  },
  categoryTag: {
    minHeight: 32,
    paddingHorizontal: 6,
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
    borderRadius: 18,
  },
  categoryIcon: { width: 25, height: 25 },
  categoryName: { fontSize: 9, fontWeight: "800", color: c.text },
  nameRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexWrap: "wrap",
  },
  title: { fontSize: 19, lineHeight: 27, fontWeight: "600", color: c.text },
  forecast: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: c.lavenderLight,
    gap: 8,
  },
  aiLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: c.primaryDark,
  },
  percent: { fontSize: 23, fontWeight: "800", color: c.primaryDark },
  voteLabel: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    minHeight: 42,
  },
  question: {
    fontSize: 14,
    fontWeight: "800",
    color: c.text,
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  delete: {
    minWidth: 40,
    minHeight: 40,
    paddingHorizontal: 6,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  deleteText: { color: c.red, fontSize: 12, fontWeight: "700" },
});
