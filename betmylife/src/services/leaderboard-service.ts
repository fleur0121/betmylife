import { API_URL } from "@/constants/api";

export type LeaderboardUser = {
  id: string;
  username: string;
  display_name: string;
  nickname: string | null;
  avatar: string;
  points: number;
  accuracy: number;
  streak: number;
};

export async function getLeaderboard(userId: string): Promise<LeaderboardUser[]> {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}/leaderboard`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.detail ?? `Leaderboard load failed (${response.status}).`);
  }
  return body as LeaderboardUser[];
}
