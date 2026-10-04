import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAchievements, newlyEligibleBadges } from "../src/achievements/engine.ts";
import { BADGE_METADATA } from "../src/achievements/badge-metadata.ts";

const empty = () => ({
  challenges: [],
  predictions: [],
  acceptedFriendCount: 0,
  ownedRewardCount: 0,
  lifetimePointsEarned: 0,
  timeZone: "UTC",
  currentUserName: "Fuka",
});

function challenge(id, fields = {}) {
  return {
    id,
    user: "Fuka",
    category: "Lifestyle",
    difficulty: 3,
    result: "success",
    resolvedAt: "2026-02-02T12:00:00.000Z",
    resolvedTimezone: "UTC",
    ...fields,
  };
}

function progress(input, id, now = new Date("2026-03-01T12:00:00.000Z")) {
  return evaluateAchievements({ ...empty(), ...input }, now).find((badge) => badge.id === id);
}

test("catalog contains exactly 25 canonical achievements", () => {
  assert.equal(BADGE_METADATA.length, 25);
  assert.equal(new Set(BADGE_METADATA.map((badge) => badge.id)).size, 25);
});

test("first challenge and first success have distinct conditions", () => {
  const draft = challenge("draft", { result: undefined, resolvedAt: undefined });
  draft.status = "draft";
  assert.equal(progress({ challenges: [draft] }, "first_challenge").complete, false);
  const created = challenge("created", { result: undefined, resolvedAt: undefined, status: "active" });
  assert.equal(progress({ challenges: [created] }, "first_challenge").complete, true);
  assert.equal(progress({ challenges: [challenge("read-today")] }, "first_challenge").complete, false);
  assert.equal(progress({ challenges: [draft] }, "goal_getter").complete, false);
  assert.equal(progress({ challenges: [challenge("won")] }, "goal_getter").complete, true);
});

test("unlocks are only returned once and qualified users can be backfilled", () => {
  const eligible = evaluateAchievements({ ...empty(), challenges: [challenge("one")] });
  assert.ok(newlyEligibleBadges(eligible, []).includes("first_challenge"));
  assert.ok(!newlyEligibleBadges(eligible, ["first_challenge"]).includes("first_challenge"));
});

test("streaks count unique consecutive local calendar days and reset across gaps", () => {
  const days = ["2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05", "2026-02-06", "2026-02-07", "2026-02-08"];
  const seven = days.flatMap((day, index) => [
    challenge(`day-${index}`, { resolvedAt: `${day}T12:00:00.000Z` }),
    ...(index === 2 ? [challenge("same-day-duplicate", { resolvedAt: `${day}T18:00:00.000Z` })] : []),
  ]);
  assert.equal(progress({ challenges: seven }, "seven_day_streak").complete, true);
  const gap = seven.filter((item) => !item.id.startsWith("day-") || !["day-3", "day-4", "day-5", "day-6"].includes(item.id));
  assert.equal(progress({ challenges: gap }, "seven_day_streak").complete, false);
});

test("14 and 30 day milestones use the longest success streak", () => {
  const at = (length) => Array.from({ length }, (_, day) => challenge(`d${day}`, {
    resolvedAt: new Date(Date.UTC(2026, 0, 1 + day, 12)).toISOString(),
  }));
  const fourteen = at(14);
  assert.equal(progress({ challenges: fourteen }, "fourteen_day_streak").complete, true);
  assert.equal(progress({ challenges: fourteen }, "thirty_day_streak").complete, false);
  assert.equal(progress({ challenges: at(30) }, "thirty_day_streak").complete, true);
});

test("consistency uses the latest 10 resolved owned challenges and requires 80 percent", () => {
  const ten = Array.from({ length: 10 }, (_, index) => challenge(`c${index}`, {
    result: index < 8 ? "success" : "failed",
    resolvedAt: new Date(Date.UTC(2026, 1, 1 + index, 12)).toISOString(),
  }));
  assert.equal(progress({ challenges: ten }, "consistency").complete, true);
  ten[0].result = "failed";
  assert.equal(progress({ challenges: ten }, "consistency").complete, false);
  assert.equal(progress({ challenges: ten.slice(0, 9) }, "consistency").complete, false);
});

test("perfect week requires five successes with no failure in a Monday-Sunday week", () => {
  const week = Array.from({ length: 5 }, (_, index) => challenge(`w${index}`, {
    resolvedAt: new Date(Date.UTC(2026, 1, 2 + index, 12)).toISOString(),
  }));
  assert.equal(progress({ challenges: week }, "perfect_week").complete, true);
  week[4].result = "failed";
  assert.equal(progress({ challenges: week }, "perfect_week").complete, false);
  assert.equal(progress({ challenges: week.slice(0, 4) }, "perfect_week").complete, false);
});

test("comeback unlocks after two consecutive failures followed by success", () => {
  const items = ["failed", "failed", "success"].map((result, index) => challenge(`cb${index}`, {
    result,
    resolvedAt: new Date(Date.UTC(2026, 1, 2 + index, 12)).toISOString(),
  }));
  assert.equal(progress({ challenges: items }, "comeback").complete, true);
  items[2].result = "failed";
  assert.equal(progress({ challenges: items }, "comeback").complete, false);
});

test("difficulty and category achievements only count successful challenges", () => {
  const fitness = Array.from({ length: 10 }, (_, index) => challenge(`f${index}`, { category: "Fitness", difficulty: index === 0 ? 5 : 3 }));
  assert.equal(progress({ challenges: fitness }, "fitness_hero").complete, true);
  assert.equal(progress({ challenges: fitness }, "big_achiever").complete, true);
  const study = Array.from({ length: 10 }, (_, index) => challenge(`s${index}`, { category: "Study" }));
  assert.equal(progress({ challenges: study }, "knowledge_builder").complete, true);
  const wellness = Array.from({ length: 10 }, (_, index) => challenge(`l${index}`, { category: "Lifestyle" }));
  assert.equal(progress({ challenges: wellness }, "positive_habits").complete, true);
});

test("early bird and night owl use each successful challenge's local completion hour", () => {
  const timed = [5, 6, 8, 21, 23, 1].map((hour, index) => challenge(`t${index}`, {
    resolvedAt: `2026-02-02T${String(hour).padStart(2, "0")}:15:00.000Z`,
  }));
  assert.equal(progress({ challenges: timed.slice(0, 3) }, "early_bird").complete, true);
  assert.equal(progress({ challenges: timed.slice(3) }, "night_owl").complete, true);
});

test("focus and AI badges require their actual proof methods", () => {
  const studyOnly = Array.from({ length: 10 }, (_, index) => challenge(`study${index}`, { category: "Study" }));
  assert.equal(progress({ challenges: studyOnly }, "focus_mode").complete, false);
  const focus = Array.from({ length: 3 }, (_, index) => challenge(`focus${index}`, { proofMethodsUsed: ["focus_session"] }));
  assert.equal(progress({ challenges: focus }, "focus_mode").complete, true);
  assert.equal(progress({ challenges: [challenge("plan", { proofPlanSource: "gemini" })] }, "ai_explorer").complete, true);
  assert.equal(progress({ challenges: [challenge("any-plan", { proofPlanSource: "gemini", proofPlan: { logic: "any", requirements: [{ method: "ai_quiz" }] } })] }, "ai_slayer").complete, false);
  const ai = Array.from({ length: 10 }, (_, index) => challenge(`ai${index}`, { proofMethodsUsed: ["ai_quiz"], aiProofVerified: true }));
  assert.equal(progress({ challenges: ai }, "ai_slayer").complete, true);
});

test("prediction accuracy ignores active, void, and unresolved bets", () => {
  const predictions = [
    ...Array.from({ length: 10 }, () => ({ status: "won" })),
    { status: "active" }, { status: "void" }, { status: "active" },
  ];
  const status = progress({ predictions }, "prediction_master");
  assert.equal(status.complete, true);
  assert.match(status.detail, /100% accuracy/);
  assert.equal(progress({ predictions: [...Array.from({ length: 9 }, () => ({ status: "won" })), ...predictions.slice(10)] }, "prediction_master").complete, false);
});

test("social, lifetime points, and distinct owned rewards drive their own progress", () => {
  assert.equal(progress({ acceptedFriendCount: 5 }, "social_butterfly").complete, true);
  assert.equal(progress({ lifetimePointsEarned: 4999 }, "points_collector").complete, false);
  assert.equal(progress({ lifetimePointsEarned: 5000 }, "points_collector").complete, true);
  assert.equal(progress({ ownedRewardCount: 3 }, "reward_hunter").complete, true);
});

test("badge bonus points do not recursively satisfy Points Collector", () => {
  const status = progress({ transactions: [
    { amount: 5000, reason: "BADGE_REWARD:points_collector" },
    { amount: 400, reason: "PREDICTION_REFUND:deleted-challenge" },
  ] }, "points_collector");
  assert.equal(status.current, 0);
  assert.equal(status.complete, false);
});
