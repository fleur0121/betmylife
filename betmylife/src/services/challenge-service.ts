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
  title: string;
  category: Challenge["category"];
  difficulty: number;
  confidence: number;
  visibility: Challenge["visibility"];
  deadline_at: string;
  deadline_label: string;
  probability: number;
  /** Live odds: the ML opening line leaned by the stakes placed on each side, less the house margin. */
  yes_odds: number;
  no_odds: number;
  opening_yes_odds: number;
  opening_no_odds: number;
  yes_pool: number;
  no_pool: number;
  proof_plan: Challenge["proofPlan"];
  result: Challenge["result"];
  resolved_at: string | null;
  prediction_source: string;
  prediction_model_version: string | null;
  prediction_meta: Record<string, unknown> | null;
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
  const response = await fetch(`${API_URL}/users/${userId}/challenges`);
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

export type PlacedPrediction = {
  id: string;
  challenge_id: string;
  user_id: string;
  choice: "yes" | "no";
  stake: number;
  locked_odds: number;
  potential_return: number;
  status: string;
  /** Apply together with `transaction`, or the next app-state save deducts the stake again. */
  wallet: number;
  transaction: { id: string; reason: string; amount: number; challengeId: string; createdAt: string };
  yes_odds: number;
  no_odds: number;
};

/** Places a fixed-odds bet. Rejected with 409 if the live odds dropped below `expectedOdds`. */
export async function placePrediction(userId: string, challengeId: string, choice: "yes" | "no", stake: number, expectedOdds: number) {
  const response = await fetch(`${API_URL}/users/${userId}/challenges/${challengeId}/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choice, stake, expected_odds: expectedOdds }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail?.message ?? body.detail ?? `Prediction failed (${response.status}).`);
  return body as PlacedPrediction;
}
