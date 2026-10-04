import { BADGES, BADGE_BY_ID } from "@/achievements/badges";
import { evaluateAchievements, type BadgeProgress } from "@/achievements/engine";
import { Text } from "@/components/localized-text";
import { PageHeading, Screen, s } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useAppState } from "@/state/app-state";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

export default function BadgesScreen() {
  const { state } = useAppState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const progress = useMemo(() => evaluateAchievements({
    challenges: state.challenges,
    predictions: Object.values(state.stakedPredictions),
    acceptedFriendCount: state.followingIds.length,
    ownedRewardCount: state.owned.length,
    lifetimePointsEarned: state.lifetimePointsEarned,
    transactions: state.transactions,
    unlockedBadgeIds: Object.keys(state.badgeUnlocks),
    currentUserId: state.authUserId,
  }), [state]);
  const selected = selectedId ? BADGE_BY_ID[selectedId] : undefined;
  const selectedProgress = progress.find((badge) => badge.id === selectedId);
  const earnedCount = Object.keys(state.badgeUnlocks).length;

  return (
    <Screen title="Badges" back>
      <PageHeading
        eyebrow="YOUR LITTLE WINS"
        title="Badges & achievements"
        subtitle={`${earnedCount} / ${BADGES.length} badges earned`}
      />
      <View style={styles.grid}>
        {progress.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} onPress={() => setSelectedId(badge.id)} />
        ))}
      </View>
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(selected)}
        onRequestClose={() => setSelectedId(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelectedId(null)}>
          <Pressable style={styles.detailCard} onPress={() => undefined}>
            {selected && (
              <>
                <Image source={selected.image} contentFit="contain" style={styles.detailArt} />
                <Text style={styles.detailName}>{selected.name}</Text>
                <Text style={styles.detailDescription}>{selected.description}</Text>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>HOW TO UNLOCK</Text>
                  <Text style={s.body}>{selected.requirement}</Text>
                </View>
                {!state.badgeUnlocks[selected.id] && selectedProgress && (
                  <ProgressLine badge={selectedProgress} />
                )}
                {state.badgeUnlocks[selected.id] && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>UNLOCKED</Text>
                    <Text style={s.body}>{new Date(state.badgeUnlocks[selected.id]!.unlockedAt).toLocaleDateString()}</Text>
                  </View>
                )}
                <View style={styles.rewardPill}>
                  <Text style={styles.rewardText}>Reward  ·  +{selected.rewardPoints} PT</Text>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function BadgeCard({ badge, onPress }: { badge: BadgeProgress; onPress: () => void }) {
  const artwork = BADGE_BY_ID[badge.id];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${badge.name}${badge.isUnlocked ? ", unlocked" : ", locked"}`}
      onPress={onPress}
      style={({ pressed }) => [styles.badgeCard, !badge.isUnlocked && styles.lockedCard, pressed && s.pressed]}
    >
      <View style={styles.artWrap}>
        <Image source={artwork.image} contentFit="contain" style={[styles.badgeArt, !badge.isUnlocked && styles.lockedArtwork]} />
        {!badge.isUnlocked && <Image source={require("@/assets/brand/icons/status_locked.png")} contentFit="contain" style={styles.lockArt} />}
      </View>
      <Text numberOfLines={2} style={styles.badgeName}>{badge.name}</Text>
      <Text numberOfLines={2} style={styles.progressText}>{formatProgress(badge)}</Text>
      <Text style={styles.points}>{badge.isUnlocked ? "✓ EARNED" : `+${badge.rewardPoints} PT`}</Text>
    </Pressable>
  );
}

function ProgressLine({ badge }: { badge: BadgeProgress }) {
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={styles.detailLabel}>PROGRESS</Text>
        <Text style={styles.progressValue}>{formatProgress(badge)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.round((badge.current / badge.target) * 100))}%` }]} />
      </View>
    </View>
  );
}

function formatProgress(badge: BadgeProgress) {
  if (["comeback", "perfect_week"].includes(badge.id)) return badge.detail ?? badge.requirement;
  if (badge.id === "prediction_master") return `${badge.current} / ${badge.target} correct · ${badge.detail}`;
  if (badge.id === "points_collector") return `${badge.current.toLocaleString()} / ${badge.target.toLocaleString()} pts`;
  if (badge.detail) return `${badge.current} / ${badge.target} · ${badge.detail}`;
  return `${Math.min(badge.current, badge.target)} / ${badge.target}`;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  badgeCard: { width: "48.5%", minHeight: 196, padding: 12, borderRadius: 20, alignItems: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  lockedCard: { backgroundColor: c.background },
  artWrap: { width: 110, height: 104, alignItems: "center", justifyContent: "center" },
  badgeArt: { width: 100, height: 100 },
  lockedArtwork: { opacity: 0.55 },
  lockArt: { position: "absolute", width: 35, height: 35, right: 1, bottom: 2 },
  badgeName: { minHeight: 34, color: c.text, fontSize: 13, fontWeight: "900", textAlign: "center" },
  progressText: { minHeight: 30, color: c.muted, fontSize: 9, lineHeight: 13, textAlign: "center" },
  points: { marginTop: 4, color: c.primaryDark, fontSize: 9, fontWeight: "900" },
  backdrop: { flex: 1, padding: 20, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(23,26,39,0.48)" },
  detailCard: { width: "100%", maxWidth: 360, padding: 22, alignItems: "center", borderRadius: 26, backgroundColor: c.card },
  detailArt: { width: 150, height: 140 },
  detailName: { color: c.text, fontSize: 23, fontWeight: "900", textAlign: "center" },
  detailDescription: { color: c.muted, fontSize: 13, textAlign: "center", marginTop: 4 },
  detailSection: { width: "100%", gap: 5, marginTop: 17 },
  detailLabel: { color: c.primaryDark, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  progressBlock: { width: "100%", marginTop: 17, gap: 7 },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  progressValue: { color: c.muted, fontSize: 10, textAlign: "right", flexShrink: 1 },
  track: { height: 8, borderRadius: 5, overflow: "hidden", backgroundColor: c.lavender },
  fill: { height: "100%", borderRadius: 5, backgroundColor: c.primary },
  rewardPill: { marginTop: 18, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, backgroundColor: c.cream },
  rewardText: { color: c.primaryDark, fontSize: 12, fontWeight: "900" },
});
