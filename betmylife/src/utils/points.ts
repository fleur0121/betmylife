import type { Challenge } from "@/mock/data";

export const CHALLENGE_POINT_RULES = {
  1: { success: 20, failure: -10 },
  2: { success: 30, failure: -15 },
  3: { success: 50, failure: -25 },
  4: { success: 70, failure: -35 },
  5: { success: 100, failure: -50 },
} as const;

export type ChallengeOutcome = "success" | "failed";
export function getChallengePointChange(difficulty: number | undefined, outcome: ChallengeOutcome) {
  const level = Number.isInteger(difficulty) && difficulty! >= 1 && difficulty! <= 5 ? difficulty! : 3;
  return CHALLENGE_POINT_RULES[level as keyof typeof CHALLENGE_POINT_RULES][outcome === "success" ? "success" : "failure"];
}

export function clampPointBalance(balance: number, change: number) {
  return Math.max(0, balance + change);
}

export function getChallengePointPreview(challenge: Pick<Challenge, "difficulty">) {
  return {
    success: getChallengePointChange(challenge.difficulty, "success"),
    failed: getChallengePointChange(challenge.difficulty, "failed"),
  };
}
