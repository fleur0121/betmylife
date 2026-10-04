import type { Challenge, Prediction, PredictionChoice } from "@/mock/data";

export const MIN_PREDICTION_STAKE = 10;
export const MAX_PREDICTION_STAKE = 200;
export const PREDICTION_STAKE_PRESETS = [10, 25, 50, 100] as const;
export const PREDICTION_LOCK_BEFORE_DEADLINE_MS = 60 * 60 * 1000;

export type StakeValidation =
  | { valid: true }
  | { valid: false; reason: "invalid" | "below-minimum" | "above-maximum" | "insufficient-balance" };

export function calculatePotentialReturn(stake: number, odds: number) {
  return Math.round(stake * odds);
}

export function calculatePotentialProfit(stake: number, odds: number) {
  return calculatePotentialReturn(stake, odds) - stake;
}

export function validateStake(stake: number, balance: number): StakeValidation {
  if (!Number.isFinite(stake) || !Number.isInteger(stake) || !Number.isFinite(balance) || stake <= 0) {
    return { valid: false, reason: "invalid" };
  }
  if (stake < MIN_PREDICTION_STAKE) return { valid: false, reason: "below-minimum" };
  if (stake > MAX_PREDICTION_STAKE) return { valid: false, reason: "above-maximum" };
  if (stake > balance) return { valid: false, reason: "insufficient-balance" };
  return { valid: true };
}

export function parseChallengeDeadline(deadlineText: string, now = new Date()): Date | null {
  const explicitDeadline = new Date(deadlineText);
  if (/^\d{4}-\d{2}-\d{2}T/.test(deadlineText) && !Number.isNaN(explicitDeadline.getTime())) {
    return explicitDeadline;
  }
  const label = deadlineText;
  const calendarDate = label.match(/^(\d{4})-(\d{2})-(\d{2})\s*[·-]\s*(\d{2}):(\d{2})$/);
  if (calendarDate) {
    const result = new Date(Number(calendarDate[1]), Number(calendarDate[2]) - 1, Number(calendarDate[3]), Number(calendarDate[4]), Number(calendarDate[5]));
    return Number.isNaN(result.getTime()) ? null : result;
  }
  const relativeTime = label.match(/(today|tomorrow|in\s+(\d+)\s+days?)\s*[·-]?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (relativeTime) {
    const result = new Date(now);
    const dayLabel = relativeTime[1].toLowerCase();
    if (dayLabel === "tomorrow") result.setDate(result.getDate() + 1);
    else if (dayLabel.startsWith("in ")) result.setDate(result.getDate() + Number(relativeTime[2]));
    let hour = Number(relativeTime[3]) % 12;
    if (relativeTime[5].toLowerCase() === "pm") hour += 12;
    result.setHours(hour, Number(relativeTime[4] ?? 0), 0, 0);
    return result;
  }
  const remaining = label.match(/(?:(\d+)\s*d(?:ays?)?\s*)?(?:(\d+)\s*h(?:ours?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?\s*)?remaining/i);
  if (remaining) {
    const duration = Number(remaining[1] ?? 0) * 86_400_000 + Number(remaining[2] ?? 0) * 3_600_000 + Number(remaining[3] ?? 0) * 60_000;
    return new Date(now.getTime() + duration);
  }
  return null;
}

export function getChallengeDeadline(challenge: Challenge, now = new Date()): Date | null {
  if (challenge.deadlineAt) {
    const parsed = new Date(challenge.deadlineAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return parseChallengeDeadline(challenge.deadline, now);
}

export function isChallengeExpired(challenge: Challenge, now = new Date()) {
  const deadline = getChallengeDeadline(challenge, now);
  return deadline === null || now.getTime() > deadline.getTime();
}

export function getPredictionLockAt(challenge: Challenge, now = new Date()) {
  const deadline = getChallengeDeadline(challenge, now);
  return deadline
    ? new Date(deadline.getTime() - PREDICTION_LOCK_BEFORE_DEADLINE_MS).toISOString()
    : null;
}

export function isPredictionLocked(
  prediction: Prediction,
  challenge?: Challenge,
  now = new Date(),
) {
  const lockAt = prediction.lockAt ?? (challenge ? getPredictionLockAt(challenge, now) : null);
  const lockTime = lockAt ? new Date(lockAt).getTime() : Number.NaN;
  return !Number.isFinite(lockTime) || now.getTime() >= lockTime;
}

export function isPredictionWindowClosed(challenge: Challenge, now = new Date()) {
  const lockAt = getPredictionLockAt(challenge, now);
  return lockAt === null || now.getTime() >= new Date(lockAt).getTime();
}

export function createStakedPrediction(input: {
  id: string;
  challenge: Challenge;
  userId: string;
  choice: PredictionChoice;
  stake: number;
  lockedOdds?: number;
  createdAt?: string;
  lockAt?: string;
}): Prediction {
  const lockedOdds = input.lockedOdds ?? Number(input.choice === "yes" ? input.challenge.yesOdds : input.challenge.noOdds);
  if (!Number.isFinite(lockedOdds) || lockedOdds <= 0) throw new Error("Prediction odds must be positive.");
  const potentialReturn = calculatePotentialReturn(input.stake, lockedOdds);
  return {
    id: input.id,
    challengeId: input.challenge.id,
    userId: input.userId,
    choice: input.choice,
    stake: input.stake,
    lockedOdds,
    potentialReturn,
    potentialProfit: potentialReturn - input.stake,
    status: "active",
    createdAt: input.createdAt ?? new Date().toISOString(),
    lockAt: input.lockAt ?? getPredictionLockAt(input.challenge, new Date()) ?? undefined,
  };
}

export type ChallengeOutcome = "success" | "failed";

export function settleChallengePredictions(
  predictions: Record<string, Prediction>,
  challengeId: string,
  outcome: ChallengeOutcome,
  settledAt = new Date().toISOString(),
) {
  let creditedPoints = 0;
  let changed = false;
  const next = { ...predictions };
  for (const [id, prediction] of Object.entries(predictions)) {
    if (prediction.challengeId !== challengeId || prediction.status !== "active") continue;
    const winningChoice: PredictionChoice = outcome === "success" ? "yes" : "no";
    const won = prediction.choice === winningChoice;
    const payout = won ? calculatePotentialReturn(prediction.stake, prediction.lockedOdds) : 0;
    next[id] = { ...prediction, status: won ? "won" : "lost", payout, settledAt };
    creditedPoints += won && prediction.userId ? payout : 0;
    changed = true;
  }
  return { predictions: changed ? next : predictions, creditedPoints, changed };
}

export function voidChallengePredictions(
  predictions: Record<string, Prediction>,
  challengeId: string,
  settledAt = new Date().toISOString(),
) {
  let refundedPoints = 0;
  let changed = false;
  const next = { ...predictions };
  for (const [id, prediction] of Object.entries(predictions)) {
    if (prediction.challengeId !== challengeId || prediction.status !== "active") continue;
    next[id] = { ...prediction, status: "void", payout: prediction.stake, settledAt };
    refundedPoints += prediction.stake;
    changed = true;
  }
  return { predictions: changed ? next : predictions, refundedPoints, changed };
}
