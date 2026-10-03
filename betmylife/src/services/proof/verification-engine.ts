import type { ProofRequirement, VerificationPlan } from '@/mock/data';

export type ProofResult = {
  requirementId: string;
  passed: boolean;
  source: 'device' | 'demo' | 'user';
  explanation?: string;
};

export type VerificationSummary = {
  completed: boolean;
  completedRequirements: number;
  totalRequirements: number;
  strength: VerificationPlan['verificationStrength'];
};

export function evaluateVerificationPlan(
  plan: VerificationPlan,
  results: ProofResult[],
): VerificationSummary {
  const required = plan.requirements.filter((requirement) => requirement.required);
  const completedRequirements = required.filter((requirement) =>
    results.some((result) => result.requirementId === requirement.id && result.passed),
  ).length;
  const completed = plan.logic === 'all'
    ? completedRequirements === required.length
    : completedRequirements > 0;
  return {
    completed,
    completedRequirements,
    totalRequirements: required.length,
    strength: plan.verificationStrength,
  };
}

export function getRequirementProgress(
  requirement: ProofRequirement,
  results: ProofResult[],
) {
  return results.find((result) => result.requirementId === requirement.id);
}
