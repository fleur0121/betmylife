/**
 * ランキング画面。モックユーザーを週間ポイント・予想精度・連続日数で並べ替える。
 * 選択された指標に応じてトップ3の表彰台、一覧の順位、表示するスコアを切り替える。
 * Weeklyのポイント指標にはアプリの共有PT残高を使う。
 */
import { LeaderboardRow } from "@/components/leaderboard-row";
import { Text } from "@/components/localized-text";
import {
    Card,
    PageHeading,
    Screen,
    SectionHeader,
    Segments,
    s,
} from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { users } from "@/mock/data";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BrandAsset } from "@/components/brand-asset";
import { useAppState } from "@/state/app-state";
import { AvatarFrame, SampleAvatar } from "@/components/profile/avatar-frame";
const metrics = ["PT", "Prediction", "Streak"] as const;
type Metric = (typeof metrics)[number];
export default function Leaderboard() {
  const [metric, setMetric] = useState<Metric>("PT");
  const { state } = useAppState();
  const key =
    metric === "PT"
      ? "points"
      : metric === "Prediction"
        ? "accuracy"
        : "streak";
  const liveUsers = users.map((user) => user.name === "Fuka" ? { ...user, points: state.pointsBalance } : user);
  const ranked = [...liveUsers].sort((a, b) => b[key] - a[key]);
  const score = (user: (typeof users)[number]) =>
    `${user[key].toLocaleString()}${key === "accuracy" ? "%" : key === "streak" ? " days" : " PT"}`;
  return (
    <Screen title="Leaderboard">
      <PageHeading
        title="Your circle, your climb"
        subtitle="Compare points, prediction accuracy, and streaks."
      />
      <Segments options={metrics} value={metric} onChange={setMetric} />
      <View style={styles.podium}>
        {[1, 0, 2].map((index) => {
          const user = ranked[index];
          return (
            <View
              key={user.name}
              style={[styles.podiumUser, index === 0 && { marginTop: 0 }]}
            >
              {index === 0 && <BrandAsset name="iconTrophy" style={styles.crown} label="Leaderboard leader" />}
              <View style={styles.avatarStage}>
                <AvatarFrame frame={index === 0 ? "champion" : index === 1 ? "purple_orbit" : "fire"} size={index === 0 ? 72 : 60}>
                  <SampleAvatar size={index === 0 ? 72 : 60} />
                </AvatarFrame>
              </View>
              <Text translate={false} style={s.bold}>
                {user.name}
              </Text>
              <Text
                style={[s.caption, { color: c.primaryDark, fontWeight: "800" }]}
              >
                {score(user)}
              </Text>
              <View
                style={[
                  styles.pedestal,
                  {
                    height: index === 0 ? 105 : index === 1 ? 75 : 55,
                    backgroundColor: index === 0 ? c.primary : c.lavender,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rank,
                    { color: index === 0 ? c.card : c.primary },
                  ]}
                >
                  0{index + 1}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <Card style={{ backgroundColor: c.lavenderLight }}>
        <Text style={s.bold}>
          ✦ You’re #{ranked.findIndex((user) => user.name === "Fuka") + 1} in your circle
        </Text>
        <Text style={s.muted}>
          Every little effort counts. Your next challenge could move you up.
        </Text>
      </Card>
      <SectionHeader title="Your circle" detail="SHARED PT · DEMO" />
      <View style={{ gap: 8 }}>
        {ranked.map((user, index) => (
          <LeaderboardRow
            key={user.name}
            user={user}
            rank={index + 1}
            score={score(user)}
          />
        ))}
      </View>
      <Text style={[s.caption, { textAlign: "center" }]}>
        One shared PT balance powers predictions, challenge results and Shop rewards.
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
  podiumUser: { flex: 1, alignItems: "center", gap: 10, marginTop: 30 },
  crown: { width: 53, height: 46, marginBottom: -4 },
  avatarStage: { width: 82, height: 82, alignItems: "center", justifyContent: "center" },
  pedestal: {
    width: "100%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rank: { fontWeight: "800", fontSize: 30 },
});
