/** Rank the signed-in user and followed accounts using saved account data. */
import { BrandAsset, type BrandAssetName } from "@/components/brand-asset";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { Text } from "@/components/localized-text";
import {
    Avatar,
    Card,
    PageHeading,
    Screen,
    SectionHeader,
    Segments,
    s,
} from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { AVATAR_FRAME_ART_SCALE } from "@/components/profile/avatar-frame";
import { getLeaderboard, type LeaderboardUser } from "@/services/leaderboard-service";
import { useAppState } from "@/state/app-state";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
const metrics = ["Points", "Prediction", "Streak"] as const;
type Metric = (typeof metrics)[number];
export default function Leaderboard() {
  const { state } = useAppState();
  const [metric, setMetric] = useState<Metric>("Points");
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!state.authUserId) return;
    let cancelled = false;
    const userId = state.authUserId;
    getLeaderboard(userId)
      .then((entries) => {
        if (cancelled) return;
        setUsers(entries);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setUsers([]);
        setError(loadError instanceof Error ? loadError.message : "Could not load leaderboard.");
      })
      .finally(() => { if (!cancelled) setLoadedForUserId(userId); });
    return () => { cancelled = true; };
  }, [state.authUserId]);
  const key =
    metric === "Points"
      ? "points"
      : metric === "Prediction"
        ? "accuracy"
        : "streak";
  const ranked = users.slice().sort((a, b) => b[key] - a[key] || b.points - a.points);
  const currentRank = ranked.findIndex((user) => user.id === state.authUserId) + 1;
  const visibleError = state.authUserId ? error : "Sign in to see your circle leaderboard.";
  const loading = Boolean(state.authUserId && loadedForUserId !== state.authUserId);
  const score = (user: LeaderboardUser) =>
    `${user[key].toLocaleString()}${key === "accuracy" ? "%" : key === "streak" ? " days" : " PT"}`;
  const podiumOrder = ranked.length >= 3
    ? [1, 0, 2]
    : ranked.length === 2
      ? [1, 0]
      : ranked.map((_, index) => index);
  return (
    <Screen title="Leaderboard">
      <PageHeading
        title="Your circle, your climb"
        subtitle="Compare points, prediction accuracy, and streaks with people you follow."
        right={<BrandAsset name="iconLeaderboard" style={styles.headingArt} label="Leaderboard" />}
      />
      <Segments options={metrics} value={metric} onChange={setMetric} />
      {!!ranked.length && <View style={styles.podium}>
        {podiumOrder.map((index) => {
          const user = ranked[index];
          const rank = index + 1;
          const isLeader = rank === 1;
          const name = user.nickname?.trim() || user.display_name || user.username;
          const avatarSize = isLeader ? 63 : 52;
          const frameArtSize = avatarSize * AVATAR_FRAME_ART_SCALE;
          return (
            <View
              key={user.id}
              style={[styles.podiumUser, isLeader && { marginTop: 0 }]}
            >
              {isLeader && (
                <BrandAsset
                  name="iconTrophy"
                  style={styles.crown}
                  label="Leaderboard leader"
                />
              )}
              <View style={styles.avatarStage}>
                <Avatar
                  emoji={user.avatar || "☁️"}
                  color={rank === 1 ? c.lavenderLight : c.peach}
                  size={avatarSize}
                />
                <BrandAsset
                  name={
                    (
                      [
                        "frameSunny",
                        "framePurpleAura",
                        "frameFire",
                      ] as BrandAssetName[]
                    )[index]
                  }
                  style={[
                    styles.avatarFrame,
                    {
                      width: frameArtSize,
                      height: frameArtSize,
                      left: (82 - frameArtSize) / 2,
                      top: (82 - frameArtSize) / 2,
                    },
                  ]}
                />
              </View>
              <Text translate={false} style={s.bold}>{name}</Text>
              <Text
                style={[s.caption, { color: c.primaryDark, fontWeight: "800" }]}
              >
                {score(user)}
              </Text>
              <View
                style={[
                  styles.pedestal,
                  {
                    height: rank === 1 ? 105 : rank === 2 ? 75 : 55,
                    backgroundColor: isLeader ? c.primary : c.lavender,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rank,
                    { color: isLeader ? c.card : c.primary },
                  ]}
                >
                  0{rank}
                </Text>
              </View>
            </View>
          );
        })}
      </View>}
      <Card style={{ backgroundColor: c.lavenderLight }}>
        <Text style={s.bold}>{currentRank ? `✦ You’re #${currentRank} in your circle` : "✦ Your circle leaderboard"}</Text>
        <Text style={s.muted}>
          Scores use saved account points, settled predictions, and completed challenges.
        </Text>
      </Card>
      <SectionHeader title="Your circle" detail="FOLLOWED ACCOUNTS" />
      {state.authUserId && loading && <Text style={s.muted}>Loading leaderboard…</Text>}
      {!!visibleError && <Text accessibilityRole="alert" style={{ color: c.red }}>{visibleError}</Text>}
      {state.authUserId && !loading && !visibleError && ranked.length === 0 && <Text style={s.muted}>No leaderboard data yet.</Text>}
      <View style={{ gap: 8 }}>
        {ranked.map((user, index) => (
          <LeaderboardRow
            key={user.id}
            user={user}
            rank={index + 1}
            score={score(user)}
            currentUserId={state.authUserId ?? undefined}
          />
        ))}
      </View>
      <Text style={[s.caption, { textAlign: "center" }]}>
        Points are your current account balance. Prediction accuracy uses settled picks.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 12,
  },
  headingArt: { width: 54, height: 54 },
  podiumUser: { flex: 1, alignItems: "center", gap: 10, marginTop: 30 },
  crown: { width: 53, height: 46, marginBottom: -4 },
  avatarStage: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFrame: { position: "absolute" },
  pedestal: {
    width: "100%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rank: { fontWeight: "800", fontSize: 30 },
});
