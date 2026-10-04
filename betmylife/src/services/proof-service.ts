import type { AppCapabilities, VerificationPlan } from '@/mock/data';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export type ProofPlanInput = {
  title: string;
  category: string;
  difficulty: number;
  confidence: number;
  deadline: string;
  capabilities: AppCapabilities;
};

export async function generateProofPlan(input: ProofPlanInput): Promise<VerificationPlan> {
  const response = await fetch(`${apiUrl}/proof-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Proof planner unavailable');
  const result = (await response.json()) as {
    category: string;
    title: string;
    summary: string;
    logic: VerificationPlan['logic'];
    requirements: VerificationPlan['requirements'];
    explanation: string;
    verification_strength: VerificationPlan['verificationStrength'];
    fallback_allowed: boolean;
  };
  return {
    category: result.category,
    title: result.title,
    summary: result.summary,
    logic: result.logic,
    requirements: result.requirements,
    explanation: result.explanation,
    verificationStrength: result.verification_strength,
    fallbackAllowed: result.fallback_allowed,
  };
}

export async function translateWithGemini(text: string): Promise<string> {
  const response = await fetch(`${apiUrl}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_language: 'en', target_language: 'ja' }),
  });
  if (!response.ok) throw new Error('Translation service unavailable');
  const result = (await response.json()) as { translated_text: string };
  return result.translated_text;
}
