/**
 * ランキング一覧の1行分を描画する表示用コンポーネント。
 * ユーザー、順位、整形済みスコアを受け取り、自分の行だけ背景色を変えて見つけやすくする。
 * 並べ替えやスコアの計算は呼び出し元のLeaderboard画面で行う。
 */
import { Text } from "@/components/localized-text";
import { palette as c } from "@/constants/design";
import type { LeaderboardUser } from "@/services/leaderboard-service";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { Avatar, s } from "./ui-kit";
export function LeaderboardRow({
  user,
  rank,
  score,
  currentUserId,
}: {
  user: LeaderboardUser;
  rank: number;
  score: string;
  currentUserId?: string;
}) {
  const name = user.nickname?.trim() || user.display_name || user.username;
  const isCurrentUser = user.id === currentUserId;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s profile`}
      onPress={() => router.push(`/user/${user.id}`)}
      style={({ pressed }) => [
        s.row,
        pressed && { opacity: 0.7 },
        {
          padding: 14,
          borderRadius: 16,
          backgroundColor: isCurrentUser ? c.lavenderLight : c.card,
        },
      ]}
    >
      <Text style={[s.caption, { width: 18, fontWeight: "800" }]}>{rank}</Text>
      <Avatar emoji={user.avatar || "☁️"} color={isCurrentUser ? c.lavenderLight : c.peach} size={40} />
      <Text style={[s.bold, s.flex]}>
        {name}
        {isCurrentUser ? " (you)" : ""}
      </Text>
      <Text style={[s.bold, { color: c.primaryDark }]}>{score}</Text>
    </Pressable>
  );
}
