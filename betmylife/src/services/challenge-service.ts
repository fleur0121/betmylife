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
  proofPlan: Challenge["proofPlan"];
};

export async function saveChallenge(input: CreateChallengeInput) {
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
      probability: 68,
      yes_odds: 1.47,
      no_odds: 3.13,
      analysis: input.analysis,
      proof_plan: input.proofPlan,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Challenge save failed (${response.status}).`);
  return body;
}

export async function getChallenges(userId: string) {
  const response = await fetch(`${API_URL}/users/${userId}/challenges`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? `Challenge load failed (${response.status}).`);
  return body as {
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
    yes_odds: number;
    no_odds: number;
    proof_plan: Challenge["proofPlan"];
  }[];
}
