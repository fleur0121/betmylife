import { API_URL } from "@/constants/api";
import type { Challenge } from "@/mock/data";
import type { ChallengeNlpResult } from "@/services/challenge-nlp";
import { predict, toDateString, type PredictRequest } from "@/services/predictApi";

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

// ---------- ML odds ----------

// App category -> ML category key. Edit to match your app's category values.
const ML_CATEGORY: Record<string, string> = {
  wake_up: "wake_up", wakeup: "wake_up", early_rise: "wake_up",
  study: "study", homework: "study",
  cook: "cook", cooking: "cook",
  exercise: "exercise", gym: "exercise", workout: "exercise",
  steps: "steps", walk: "steps",
  sleep: "sleep",
};

// Categories where the deadline hour actually changes the prediction
const HOUR_MATTERS = new Set(["wake_up", "study", "cook"]);

// Used only if the ML server can't be reached, so saving never breaks
const FALLBACK_ODDS = { probability: 68, yes_odds: 1.47, no_odds: 3.13 };

async function getAiOdds(input: CreateChallengeInput) {
  try {
    const key = String(input.category).toLowerCase().replace(/[\s-]/g, "_");
    const category = ML_CATEGORY[key] ?? key; // unknown -> API treats it as a new category
    const deadline = new Date(input.deadlineAt);
    const hour = deadline.getHours();

    // Confidence may be 0-100 in the app; the API wants 0-1
    const conf = input.confidence > 1 ? input.confidence / 100 : input.confidence;

    const req: PredictRequest = {
      category,
      deadline_date: toDateString(deadline),
      difficulty: Math.min(5, Math.max(1, Math.round(input.difficulty))),
      user_confidence: Math.min(1, Math.max(0, conf)),
    };

    // Only send the hour where it means something.
    // Study/cook deadlines after midnight are skipped (the model only knows evening deadlines).
    if (category === "wake_up" || (HOUR_MATTERS.has(category) && hour >= 12)) {
      req.target_hour = hour;
      req.goal_type = "deadline";
    }

    // If the NLP analysis already extracted goal details, use them
    const a = (input.analysis ?? {}) as Partial<PredictRequest>;
    if (a.goal_type) req.goal_type = a.goal_type;
    if (a.goal_value != null) req.goal_value = a.goal_value;
    if (a.goal_unit) req.goal_unit = a.goal_unit;

    const r = await predict(req);
    return {
      probability: Math.round(r.success_probability * 100), // backend stores 68, not 0.68
      yes_odds: r.yes_odds,
      no_odds: r.no_odds,
    };
  } catch (e) {
    console.warn("ML API failed, using fallback odds:", e);
    return FALLBACK_ODDS;
  }
}

// ---------- Backend calls ----------

export async function saveChallenge(input: CreateChallengeInput) {
  const ai = await getAiOdds(input);
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
      probability: ai.probability,
      yes_odds: ai.yes_odds,
      no_odds: ai.no_odds,
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
