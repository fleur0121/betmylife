/**
 * ランキング画面。モックユーザーを週間ポイント・予想精度・連続日数で並べ替える。
 * 選択された指標に応じてトップ3の表彰台、一覧の順位、表示するスコアを切り替える。
 * ここで使う週間ポイントは、Shopで消費するウォレット残高とは別の値。
 */
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
import { users } from "@/mock/data";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
const metrics = ["Weekly Points", "Accuracy", "Streak"] as const;
type Metric = (typeof metrics)[number];
export default function Leaderboard() {
  const [metric, setMetric] = useState<Metric>("Weekly Points");
  const key =
    metric === "Weekly Points"
      ? "points"
      : metric === "Accuracy"
        ? "accuracy"
        : "streak";
  const ranked = [...users].sort((a, b) => b[key] - a[key]);
  const score = (user: (typeof users)[number]) =>
    `${user[key].toLocaleString()}${key === "accuracy" ? "%" : key === "streak" ? " days" : " PT"}`;
  return (
    <Screen title="Leaderboard">
      <PageHeading
        title="This week’s leaderboard"
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
              {index === 0 && <Text style={styles.crown}>👑</Text>}
              <Avatar
                emoji={user.avatar}
                color={user.color}
                size={index === 0 ? 72 : 58}
                framed={index === 0}
              />
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
          ✦ You’re #{ranked.findIndex((user) => user.name === "Fuka") + 1} this
          week
        </Text>
        <Text style={s.muted}>
          Every little effort counts. Your next challenge could move you up.
        </Text>
      </Card>
      <SectionHeader title="Your circle" detail="THIS WEEK · DEMO" />
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
        Weekly points celebrate progress. Shop points are yours to spend.
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
  crown: { fontSize: 26 },
  pedestal: {
    width: "100%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rank: { fontWeight: "800", fontSize: 30 },
});
