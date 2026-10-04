import { API_URL } from "@/constants/api";
import type { Challenge } from "@/mock/data";
import type { ChallengeNlpResult } from "@/services/challenge-nlp";

type CreateChallengeInput = {
  userId: string;
  title: string;
  category: Challenge["category"];
  difficulty: number;
  confidence: number;
  visibility: Challenge["visibility"];
  deadlineAt: string;
  deadlineLabel: string;
  analysis: ChallengeNlpResult | null;
  proofPlan?: Challenge["proofPlan"];
  userInput?: Record<string, unknown>;
};

export type SavedChallenge = {
  id: string;
  user_id: string;
  user_name: string;
  user_handle: string;
  title: string;
  category: Challenge["category"];
  difficulty: number;
  confidence: number;
  visibility: Challenge["visibility"];
  deadline_at: string;
  deadline_label: string;
  probability: number;
  yes_odds: number;
  no_odds: number;
  model_probability: number;
  market_probability: number;
  quoted_yes_odds: number;
  quoted_no_odds: number;
  overround: number;
  proof_plan: Challenge["proofPlan"];
  result: Challenge["result"];
  resolved_at: string | null;
  prediction_source: string;
  prediction_model_version: string | null;
  prediction_meta: Record<string, unknown> | null;
  created_at: string;
};

export async function saveChallenge(input: CreateChallengeInput): Promise<SavedChallenge> {
  const response = await fetch(`${API_URL}/users/${input.userId}/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      category: input.category,
      difficulty: input.difficulty,
      confidence: input.confidence,
      visibility: input.visibility,
      deadline_at: input.deadlineAt,
      deadline_label: input.deadlineLabel,
      analysis: input.analysis,
      ...(input.proofPlan ? { proof_plan: input.proofPlan } : {}),
      ...(input.userInput ? { user_input: input.userInput } : {}),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Challenge save failed (${response.status}).`);
  return body as SavedChallenge;
}

export async function getChallenges(userId: string): Promise<SavedChallenge[]> {
  const response = await fetch(`${API_URL}/users/${encodeURIComponent(userId)}/challenges?viewer_id=${encodeURIComponent(userId)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Challenge load failed (${response.status}).`);
  return body as SavedChallenge[];
}

export async function recordChallengeResult(userId: string, challengeId: string, result: "success" | "failed") {
  const response = await fetch(`${API_URL}/users/${userId}/challenges/${challengeId}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Challenge result save failed (${response.status}).`);
  return body as { status: string; result: "success" | "failed"; created: boolean };
}

export async function getPublicChallenges(userId: string) {
  const response = await fetch(`${API_URL}/challenges?viewer_id=${encodeURIComponent(userId)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Challenge feed load failed (${response.status}).`);
  return body as Awaited<ReturnType<typeof getChallenges>>;
}

export type PlacedBet = {
  id: string;
  challenge_id: string;
  side: "yes" | "no";
  stake: number;
  locked_odds: number;
  model_probability: number;
  market_probability: number;
  quote_version: number;
  balance: number;
  current_yes_odds: number;
  current_no_odds: number;
};

export async function placeBet(input: {
  challengeId: string;
  userId: string;
  side: "yes" | "no";
  stake: number;
  existingBetId?: string;
}): Promise<PlacedBet> {
  const response = await fetch(`${API_URL}/challenges/${input.challengeId}/bets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: input.userId,
      side: input.side,
      stake: input.stake,
      ...(input.existingBetId ? { existing_bet_id: input.existingBetId } : {}),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Bet placement failed (${response.status}).`);
  return body as PlacedBet;
}
