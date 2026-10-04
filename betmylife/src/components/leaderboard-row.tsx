/**
 * ランキング一覧の1行分を描画する表示用コンポーネント。
 * ユーザー、順位、整形済みスコアを受け取り、自分の行だけ背景色を変えて見つけやすくする。
 * 並べ替えやスコアの計算は呼び出し元のLeaderboard画面で行う。
 */
import { Text } from "@/components/localized-text";
import { palette as c } from "@/constants/design";
import { users } from "@/mock/data";
import { friendDirectory } from "@/mock/friends";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { Avatar, s } from "./ui-kit";
export function LeaderboardRow({
  user,
  rank,
  score,
  currentUserName,
}: {
  user: (typeof users)[number];
  rank: number;
  score: string;
  currentUserName?: string;
}) {
  const profile = friendDirectory.find((friend) => friend.name === user.name);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${user.name}'s profile`}
      onPress={() => profile && router.push(`/user/${profile.id}`)}
      style={({ pressed }) => [
        s.row,
        pressed && { opacity: 0.7 },
        {
          padding: 14,
          borderRadius: 16,
          backgroundColor: user.name === currentUserName ? c.lavenderLight : c.card,
        },
      ]}
    >
      <Text style={[s.caption, { width: 18, fontWeight: "800" }]}>{rank}</Text>
      <Avatar emoji={user.avatar} color={user.color} size={40} />
      <Text style={[s.bold, s.flex]}>
        {user.name}
        {user.name === currentUserName ? " (you)" : ""}
      </Text>
      <Text style={[s.bold, { color: c.primaryDark }]}>{score}</Text>
    </Pressable>
  );
}
