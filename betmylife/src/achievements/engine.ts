import { BADGE_METADATA, type BadgeId, type BadgeMetadata } from "./badge-metadata.ts";

export type AchievementChallenge = {
  id: string;
  status?: "draft" | "active";
  draft?: boolean;
  user?: string;
  ownerId?: string;
  category?: string;
  difficulty?: number;
  createdAt?: string;
  result?: "success" | "failed";
  resolvedAt?: string;
  resolvedTimezone?: string;
  proofPlanSource?: "gemini" | "fallback" | "manual";
  aiProofVerified?: boolean;
  proofMethodsUsed?: string[];
  proofPlan?: { logic?: "all" | "any"; requirements?: { method: string }[] };
};

export type AchievementPrediction = { status: "active" | "won" | "lost" | "void" };
export type AchievementTransaction = { amount: number; reason?: string };
export type AchievementInput = {
  challenges: AchievementChallenge[];
  predictions: AchievementPrediction[];
  acceptedFriendCount: number;
  ownedRewardCount: number;
  lifetimePointsEarned: number;
  transactions?: AchievementTransaction[];
  unlockedBadgeIds?: string[];
  currentUserId?: string | null;
  currentUserName?: string;
  timeZone?: string;
};

export type BadgeProgress = BadgeMetadata & {
  current: number;
  detail?: string;
  isUnlocked: boolean;
  unlockedAt?: string;
  complete: boolean;
};

type Parts = { day: string; hour: number; weekday: string };

function dateParts(timestamp: string, timeZone: string): Parts | null {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return {
      day: `${value("year")}-${value("month")}-${value("day")}`,
      hour: Number(value("hour")),
      weekday: value("weekday"),
    };
  } catch {
    return dateParts(timestamp, "UTC");
  }
}

function localDayNumber(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

function isFitness(category: string) {
  return /fitness|exercise|workout/i.test(category);
}
function isKnowledge(category: string) {
  return /study|education|learning|productivity/i.test(category);
}
function isPositiveHabit(category: string) {
  return /lifestyle|health|mindfulness|sleep/i.test(category);
}

function progressFor(id: BadgeId, metrics: {
  ownChallenges: AchievementChallenge[];
  resolved: AchievementChallenge[];
  successes: AchievementChallenge[];
  successStreak: number;
  consistentSuccesses: number;
  latestResolvedCount: number;
  perfectWeekSuccesses: number;
  comeback: boolean;
  fitness: number;
  knowledge: number;
  positiveHabits: number;
  earlyBird: number;
  nightOwl: number;
  focus: number;
  aiPlans: number;
  aiVerified: number;
  resolvedPredictions: number;
  correctPredictions: number;
  accuracy: number;
  friends: number;
  pointsEarned: number;
  purchasedRewards: number;
}): { current: number; complete: boolean; detail?: string } {
  switch (id) {
    case "first_challenge": return { current: metrics.ownChallenges.length, complete: metrics.ownChallenges.length >= 1 };
    case "goal_getter": return { current: metrics.successes.length, complete: metrics.successes.length >= 1 };
    case "big_achiever": {
      const count = metrics.successes.filter((challenge) => challenge.difficulty === 5).length;
      return { current: count, complete: count >= 1 };
    }
    case "habit_hero": {
      const categories = new Set(metrics.successes.map((challenge) => challenge.category).filter((category): category is string => Boolean(category)));
      return { current: metrics.successes.length, complete: metrics.successes.length >= 20 && categories.size >= 3, detail: `${categories.size} / 3 categories` };
    }
    case "challenge_champion": return { current: metrics.successes.length, complete: metrics.successes.length >= 50 };
    case "streak_starter": return { current: metrics.successStreak, complete: metrics.successStreak >= 2 };
    case "three_day_streak": return { current: metrics.successStreak, complete: metrics.successStreak >= 3 };
    case "seven_day_streak": return { current: metrics.successStreak, complete: metrics.successStreak >= 7 };
    case "fourteen_day_streak": return { current: metrics.successStreak, complete: metrics.successStreak >= 14 };
    case "thirty_day_streak": return { current: metrics.successStreak, complete: metrics.successStreak >= 30 };
    case "consistency": return { current: metrics.consistentSuccesses, complete: metrics.latestResolvedCount >= 10 && metrics.consistentSuccesses >= 8, detail: `${metrics.latestResolvedCount} / 10 resolved` };
    case "perfect_week": return { current: metrics.perfectWeekSuccesses, complete: metrics.perfectWeekSuccesses >= 5, detail: "5 successful challenges and no failures in one week" };
    case "comeback": return { current: Number(metrics.comeback), complete: metrics.comeback, detail: metrics.comeback ? "Comeback achieved" : "Resolve 2 failures, then succeed" };
    case "fitness_hero": return { current: metrics.fitness, complete: metrics.fitness >= 10 };
    case "knowledge_builder": return { current: metrics.knowledge, complete: metrics.knowledge >= 10 };
    case "positive_habits": return { current: metrics.positiveHabits, complete: metrics.positiveHabits >= 10 };
    case "early_bird": return { current: metrics.earlyBird, complete: metrics.earlyBird >= 3 };
    case "night_owl": return { current: metrics.nightOwl, complete: metrics.nightOwl >= 3 };
    case "focus_mode": return { current: metrics.focus, complete: metrics.focus >= 3 };
    case "ai_explorer": return { current: metrics.aiPlans + metrics.aiVerified, complete: metrics.aiPlans + metrics.aiVerified >= 1 };
    case "ai_slayer": return { current: metrics.aiVerified, complete: metrics.aiVerified >= 10 };
    case "prediction_master": return { current: metrics.correctPredictions, complete: metrics.resolvedPredictions >= 10 && metrics.correctPredictions >= 10 && metrics.accuracy >= 75, detail: `${metrics.accuracy}% accuracy · ${metrics.resolvedPredictions} resolved` };
    case "social_butterfly": return { current: metrics.friends, complete: metrics.friends >= 5 };
    case "points_collector": return { current: metrics.pointsEarned, complete: metrics.pointsEarned >= 5000 };
    case "reward_hunter": return { current: metrics.purchasedRewards, complete: metrics.purchasedRewards >= 3 };
  }
}

export function evaluateAchievements(input: AchievementInput, now = new Date()): BadgeProgress[] {
  const deviceTimeZone = input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const ownChallenges = input.challenges.filter((challenge) => {
    const isOwned = input.currentUserId
      ? challenge.ownerId === input.currentUserId
      : challenge.user === input.currentUserName && challenge.id !== "read-today";
    return isOwned && !challenge.draft && challenge.status !== "draft";
  });
  const resolved = ownChallenges
    .filter((challenge) => challenge.result && challenge.resolvedAt)
    .sort((left, right) => new Date(left.resolvedAt!).getTime() - new Date(right.resolvedAt!).getTime());
  const successes = resolved.filter((challenge) => challenge.result === "success");
  const successfulDays = [...new Set(successes.map((challenge) => dateParts(challenge.resolvedAt!, deviceTimeZone)?.day).filter((day): day is string => Boolean(day)))].sort();
  let currentRun = 0;
  let successStreak = 0;
  let priorDay: number | null = null;
  for (const day of successfulDays) {
    const dayNumber = localDayNumber(day);
    currentRun = priorDay !== null && dayNumber === priorDay + 1 ? currentRun + 1 : 1;
    successStreak = Math.max(successStreak, currentRun);
    priorDay = dayNumber;
  }
  const latestTen = resolved.slice(-10);
  const latestResolvedCount = latestTen.length;
  const consistentSuccesses = latestTen.filter((challenge) => challenge.result === "success").length;

  const weekly = new Map<string, { successes: number; failures: number }>();
  for (const challenge of resolved) {
    const local = dateParts(challenge.resolvedAt!, challenge.resolvedTimezone || deviceTimeZone);
    if (!local) continue;
    const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(local.weekday);
    const offset = weekdayIndex < 0 ? 0 : weekdayIndex;
    const monday = new Date(localDayNumber(local.day) * 86_400_000 - offset * 86_400_000).toISOString().slice(0, 10);
    const week = weekly.get(monday) ?? { successes: 0, failures: 0 };
    if (challenge.result === "success") week.successes += 1;
    else week.failures += 1;
    weekly.set(monday, week);
  }
  const perfectWeekSuccesses = Math.max(0, ...[...weekly.values()].map((week) => week.failures === 0 ? week.successes : 0));

  let failedRun = 0;
  let comeback = false;
  for (const challenge of resolved) {
    if (challenge.result === "failed") failedRun += 1;
    else {
      if (failedRun >= 2) comeback = true;
      failedRun = 0;
    }
  }

  const countCategory = (matches: (category: string) => boolean) => successes.filter((challenge) => matches(challenge.category ?? "")).length;
  const countAtHours = (matches: (hour: number) => boolean) => successes.filter((challenge) => {
    const timezone = challenge.resolvedTimezone || deviceTimeZone;
    const local = dateParts(challenge.resolvedAt!, timezone);
    return local !== null && matches(local.hour);
  }).length;
  const hasVerifiedMethod = (challenge: AchievementChallenge, method: string) => {
    if (challenge.proofMethodsUsed) return challenge.proofMethodsUsed.includes(method);
    // Backfill older all-of proof plans, where success means every listed method passed.
    return challenge.proofPlan?.logic === "all" && challenge.proofPlan.requirements?.some((requirement) => requirement.method === method);
  };
  const focus = successes.filter((challenge) => hasVerifiedMethod(challenge, "timer") || hasVerifiedMethod(challenge, "focus_session")).length;
  const aiVerified = successes.filter((challenge) => challenge.aiProofVerified || hasVerifiedMethod(challenge, "ai_quiz")).length;
  const aiPlans = successes.filter((challenge) => challenge.proofPlanSource === "gemini").length;
  const resolvedPredictions = input.predictions.filter((prediction) => prediction.status === "won" || prediction.status === "lost").length;
  const correctPredictions = input.predictions.filter((prediction) => prediction.status === "won").length;
  const accuracy = resolvedPredictions ? Math.round((correctPredictions / resolvedPredictions) * 100) : 0;
  const ledgerPoints = (input.transactions ?? []).reduce((sum, transaction) =>
    transaction.amount > 0 && !transaction.reason?.startsWith("BADGE_REWARD:") && !transaction.reason?.startsWith("PREDICTION_REFUND:") ? sum + transaction.amount : sum, 0);

  const metrics = {
    ownChallenges,
    resolved,
    successes,
    successStreak,
    consistentSuccesses,
    latestResolvedCount,
    perfectWeekSuccesses,
    comeback,
    fitness: countCategory(isFitness),
    knowledge: countCategory(isKnowledge),
    positiveHabits: countCategory(isPositiveHabit),
    earlyBird: countAtHours((hour) => hour >= 5 && hour < 9),
    nightOwl: countAtHours((hour) => hour >= 21 || hour < 2),
    focus,
    aiPlans,
    aiVerified,
    resolvedPredictions,
    correctPredictions,
    accuracy,
    friends: input.acceptedFriendCount,
    pointsEarned: Math.max(input.lifetimePointsEarned, ledgerPoints),
    purchasedRewards: input.ownedRewardCount,
  };
  const unlocked = new Set(input.unlockedBadgeIds ?? []);
  return BADGE_METADATA.map((badge) => {
    const status = progressFor(badge.id, metrics);
    return {
      ...badge,
      current: status.current,
      detail: status.detail,
      isUnlocked: unlocked.has(badge.id),
      complete: status.complete || unlocked.has(badge.id),
    };
  });
}

export function newlyEligibleBadges(progress: BadgeProgress[], unlockedBadgeIds: string[]): BadgeId[] {
  const unlocked = new Set(unlockedBadgeIds);
  return progress.filter((badge) => badge.complete && !unlocked.has(badge.id)).map((badge) => badge.id);
}
