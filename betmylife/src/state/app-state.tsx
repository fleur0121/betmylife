/** Shared app state, persisted after login and reconciled with the badge engine. */
import { evaluateAchievements, newlyEligibleBadges } from "@/achievements/engine";
import { BADGE_METADATA, type BadgeId } from "@/achievements/badge-metadata";
import { rewards } from "@/constants/rewards";
import type { CosmeticSlot } from "@/constants/rewards";
import type { Challenge, Prediction, PredictionChoice } from "@/mock/data";
import { friendDirectory, myFriendId } from "@/mock/friends";
import {
  getPredictionLockAt,
  isChallengeExpired,
  isPredictionLocked,
  isPredictionWindowClosed,
  settleChallengePredictions,
  validateStake,
  voidChallengePredictions,
  type ChallengeOutcome,
} from "@/utils/predictions";
import { getChallengePointChange } from "@/utils/points";
import { createContext, useContext, useEffect, useReducer, useRef, useState, type PropsWithChildren } from "react";
import { API_URL } from "@/constants/api";

export type PointTransaction = {
  id: string;
  amount: number;
  reason: string;
  challengeId?: string;
  createdAt: string;
};
export type BadgeUnlock = { unlockedAt: string; rewardPointsGranted: number };
export type State = {
  authUserId: string | null;
  friendIds: string[];
  /** Server-backed follows; the app has no pending friend request state. */
  followingIds: string[];
  challenges: Challenge[];
  predictions: Record<string, PredictionChoice>;
  stakedPredictions: Record<string, Prediction>;
  wallet: number;
  /** Compatibility alias retained while older screens migrate to wallet. */
  pointsBalance: number;
  lifetimePointsEarned: number;
  transactions: PointTransaction[];
  owned: string[];
  equipped: Record<CosmeticSlot, string>;
  badgeUnlocks: Partial<Record<BadgeId, BadgeUnlock>>;
  pendingBadgeClaims: BadgeId[];
  /** Session-only fields; never serialized to the backend. */
  pendingBadgeToasts: BadgeId[];
  badgeNotifications: BadgeId[];
};
type ServerBadge = { badge_id: string; unlocked_at: string; reward_points_granted: number };
type PersistedState = Partial<Omit<State, "authUserId" | "followingIds" | "pendingBadgeToasts" | "badgeNotifications">>;
type Action =
  | { type: "login"; userId: string }
  | { type: "hydrate"; data: PersistedState | null; badges?: ServerBadge[] }
  | { type: "set-following-ids"; ids: string[] }
  | { type: "badge-claim-completed"; badgeId: BadgeId; unlockedAt: string; rewardPointsGranted: number; wallet: number; created: boolean }
  | { type: "dismiss-badge-notification"; badgeId: BadgeId }
  | { type: "add-friend"; id: string }
  | { type: "place-prediction"; prediction: Prediction }
  | { type: "cancel-prediction"; challengeId: string; cancelledAt?: string }
  | { type: "settle-predictions"; challengeId: string; outcome: ChallengeOutcome; settledAt?: string }
  | { type: "settle-challenge"; challengeId: string; outcome: ChallengeOutcome; settledAt?: string; resolvedTimezone?: string; proofMethodsUsed?: string[]; aiProofVerified?: boolean }
  | { type: "create"; challenge: Challenge }
  | { type: "replace-challenges"; challenges: Challenge[] }
  | { type: "delete"; id: string }
  | { type: "buy"; id: string }
  | { type: "equip"; id: string };

export const initialState: State = {
  authUserId: null,
  friendIds: [],
  followingIds: [],
  challenges: [],
  predictions: {},
  stakedPredictions: {},
  wallet: 0,
  pointsBalance: 0,
  lifetimePointsEarned: 0,
  transactions: [],
  owned: [],
  equipped: { Frame: "", Title: "", Badge: "", Background: "" },
  badgeUnlocks: {},
  pendingBadgeClaims: [],
  pendingBadgeToasts: [],
  badgeNotifications: [],
};

function toAchievementInput(state: State) {
  return {
    challenges: state.challenges,
    predictions: Object.values(state.stakedPredictions),
    acceptedFriendCount: state.followingIds.length,
    ownedRewardCount: state.owned.length,
    lifetimePointsEarned: state.lifetimePointsEarned,
    transactions: state.transactions,
    unlockedBadgeIds: Object.keys(state.badgeUnlocks),
    currentUserId: state.authUserId,
  };
}

function finalizeTransition(previous: State, next: State, showToast = true): State {
  if (next === previous) return previous;
  const eligible = newlyEligibleBadges(
    evaluateAchievements(toAchievementInput(next)),
    Object.keys(next.badgeUnlocks),
  );
  if (!eligible.length) return { ...next, pointsBalance: next.wallet };
  const unlockedAt = new Date().toISOString();
  const badgeUnlocks = { ...next.badgeUnlocks };
  for (const badgeId of eligible) {
    badgeUnlocks[badgeId] = { unlockedAt, rewardPointsGranted: 0 };
  }
  return {
    ...next,
    pointsBalance: next.wallet,
    badgeUnlocks,
    pendingBadgeClaims: [...new Set([...next.pendingBadgeClaims, ...eligible])],
    pendingBadgeToasts: showToast
      ? [...new Set([...next.pendingBadgeToasts, ...eligible])]
      : next.pendingBadgeToasts,
  };
}

function appendTransactions(state: State, additions: PointTransaction[]) {
  const ids = new Set(state.transactions.map((item) => item.id));
  const fresh = additions.filter((item) => !ids.has(item.id));
  return fresh.length ? [...state.transactions, ...fresh] : state.transactions;
}

function loadPersistedState(state: State, data: PersistedState | null, badges: ServerBadge[] = []): State {
  const saved = data ?? {};
  const transactions = [...(Array.isArray(saved.transactions) ? saved.transactions : state.transactions)];
  const badgeUnlocks = { ...state.badgeUnlocks, ...(saved.badgeUnlocks ?? {}) };
  const pendingBadgeClaims = [...new Set([...(saved.pendingBadgeClaims ?? []), ...state.pendingBadgeClaims])];
  let wallet = typeof saved.wallet === "number" && Number.isFinite(saved.wallet) ? saved.wallet : state.wallet;
  for (const badge of badges) {
    if (!BADGE_METADATA.some((definition) => definition.id === badge.badge_id)) continue;
    const badgeId = badge.badge_id as BadgeId;
    badgeUnlocks[badgeId] = {
      unlockedAt: badgeUnlocks[badgeId]?.unlockedAt ?? badge.unlocked_at,
      rewardPointsGranted: badge.reward_points_granted,
    };
    const reason = `BADGE_REWARD:${badge.badge_id}`;
    if (!transactions.some((transaction) => transaction.id === reason)) {
      transactions.push({ id: reason, reason, amount: badge.reward_points_granted, createdAt: badge.unlocked_at });
      wallet += badge.reward_points_granted;
    }
  }
  const databaseBadgeIds = new Set(badges.map((badge) => badge.badge_id));
  return {
    ...state,
    ...saved,
    authUserId: state.authUserId,
    wallet,
    pointsBalance: wallet,
    transactions,
    badgeUnlocks,
    pendingBadgeClaims: pendingBadgeClaims.filter((id) => !databaseBadgeIds.has(id)),
    pendingBadgeToasts: [],
    badgeNotifications: [],
  };
}

export function appReducer(state: State, action: Action): State {
  switch (action.type) {
    case "login":
      return { ...state, authUserId: action.userId };
    case "hydrate":
      return finalizeTransition(state, loadPersistedState(state, action.data, action.badges), false);
    case "set-following-ids":
      return finalizeTransition(state, { ...state, followingIds: [...new Set(action.ids.filter((id) => id !== myFriendId))] });
    case "badge-claim-completed": {
      const definition = BADGE_METADATA.find((badge) => badge.id === action.badgeId);
      if (!definition) return state;
      const reason = `BADGE_REWARD:${action.badgeId}`;
      const alreadyRecorded = state.transactions.some((item) => item.id === reason);
      const shouldToast = action.created && state.pendingBadgeToasts.includes(action.badgeId);
      const transactions = !alreadyRecorded
        ? appendTransactions(state, [{ id: reason, reason, amount: action.rewardPointsGranted, createdAt: action.unlockedAt }])
        : state.transactions;
      return {
        ...state,
        wallet: Math.max(0, action.wallet),
        pointsBalance: Math.max(0, action.wallet),
        transactions,
        badgeUnlocks: { ...state.badgeUnlocks, [action.badgeId]: { unlockedAt: action.unlockedAt, rewardPointsGranted: definition.rewardPoints } },
        pendingBadgeClaims: state.pendingBadgeClaims.filter((id) => id !== action.badgeId),
        pendingBadgeToasts: state.pendingBadgeToasts.filter((id) => id !== action.badgeId),
        badgeNotifications: shouldToast ? [...state.badgeNotifications, action.badgeId] : state.badgeNotifications,
      };
    }
    case "dismiss-badge-notification":
      return { ...state, badgeNotifications: state.badgeNotifications.filter((id) => id !== action.badgeId) };
    case "add-friend": {
      if (action.id === myFriendId || state.friendIds.includes(action.id) || !friendDirectory.some((friend) => friend.id === action.id)) return state;
      return finalizeTransition(state, { ...state, friendIds: [...state.friendIds, action.id] });
    }
    case "place-prediction": {
      const prediction = action.prediction;
      const challenge = state.challenges.find((item) => item.id === prediction.challengeId);
      const user = friendDirectory.find((item) => item.id === prediction.userId);
      const author = challenge && friendDirectory.find((item) => item.name === challenge.user);
      const odds = challenge && Number(prediction.choice === "yes" ? challenge.yesOdds : challenge.noOdds);
      const previous = Object.values(state.stakedPredictions).find((item) => item.challengeId === prediction.challengeId && item.userId === prediction.userId && item.status === "active");
      const settledBefore = Object.values(state.stakedPredictions).some((item) => item.challengeId === prediction.challengeId && item.userId === prediction.userId && (item.status === "won" || item.status === "lost"));
      if (!challenge || !user || prediction.userId !== myFriendId || !author || author.id === prediction.userId || !validateStake(prediction.stake, state.wallet + (previous?.stake ?? 0)).valid || isChallengeExpired(challenge) || isPredictionWindowClosed(challenge) || (previous !== undefined && isPredictionLocked(previous, challenge)) || settledBefore || !Number.isFinite(odds) || odds! <= 0 || prediction.lockedOdds !== odds || prediction.status !== "active" || Object.values(state.stakedPredictions).some((item) => item.challengeId === challenge.id && item.userId === prediction.userId && item.status !== "void" && item !== previous) || (state.stakedPredictions[prediction.id] !== undefined && state.stakedPredictions[prediction.id] !== previous)) return state;
      const storedPrediction: Prediction = {
        ...prediction,
        id: previous?.id ?? prediction.id,
        createdAt: previous?.createdAt ?? prediction.createdAt,
        lockAt: previous?.lockAt ?? getPredictionLockAt(challenge) ?? undefined,
      };
      const stakedPredictions = { ...state.stakedPredictions, [storedPrediction.id]: storedPrediction };
      const stakeDelta = prediction.stake - (previous?.stake ?? 0);
      const reason = `PREDICTION_STAKE:${storedPrediction.id}:${storedPrediction.createdAt}`;
      return finalizeTransition(state, {
        ...state,
        predictions: { ...state.predictions, [prediction.challengeId]: prediction.choice },
        wallet: state.wallet - stakeDelta,
        stakedPredictions,
        transactions: stakeDelta ? appendTransactions(state, [{ id: reason, reason, amount: -stakeDelta, challengeId: challenge.id, createdAt: new Date().toISOString() }]) : state.transactions,
      });
    }
    case "cancel-prediction": {
      const challenge = state.challenges.find((item) => item.id === action.challengeId);
      const prediction = Object.values(state.stakedPredictions).find((item) => item.challengeId === action.challengeId && item.userId === myFriendId && item.status === "active");
      if (!challenge || !prediction || isPredictionLocked(prediction, challenge)) return state;
      const settledAt = action.cancelledAt ?? new Date().toISOString();
      const stakedPredictions = { ...state.stakedPredictions, [prediction.id]: { ...prediction, status: "void" as const, payout: prediction.stake, settledAt } };
      const predictions = { ...state.predictions };
      delete predictions[action.challengeId];
      const reason = `PREDICTION_REFUND:${prediction.id}`;
      return finalizeTransition(state, {
        ...state,
        predictions,
        stakedPredictions,
        wallet: state.wallet + prediction.stake,
        transactions: appendTransactions(state, [{ id: reason, reason, amount: prediction.stake, challengeId: action.challengeId, createdAt: settledAt }]),
      });
    }
    case "settle-predictions": {
      const result = settleChallengePredictions(state.stakedPredictions, action.challengeId, action.outcome, action.settledAt);
      if (!result.changed) return state;
      const settledAt = action.settledAt ?? new Date().toISOString();
      const additions = Object.values(result.predictions)
        .filter((item) => item.challengeId === action.challengeId && item.status === "won" && item.settledAt === settledAt)
        .map((item) => ({ id: `PREDICTION_PAYOUT:${item.id}`, reason: `PREDICTION_PAYOUT:${item.id}`, amount: item.payout ?? 0, challengeId: action.challengeId, createdAt: settledAt }));
      return finalizeTransition(state, {
        ...state,
        stakedPredictions: result.predictions,
        wallet: state.wallet + result.creditedPoints,
        lifetimePointsEarned: state.lifetimePointsEarned + result.creditedPoints,
        transactions: appendTransactions(state, additions),
      });
    }
    case "settle-challenge": {
      const challenge = state.challenges.find((item) => item.id === action.challengeId);
      if (!challenge || challenge.result) return state;
      const settledAt = action.settledAt ?? new Date().toISOString();
      const pointDelta = getChallengePointChange(challenge.difficulty, action.outcome);
      const nextWallet = Math.max(0, state.wallet + pointDelta);
      const appliedPoints = nextWallet - state.wallet;
      const reason = action.outcome === "success" ? "challenge_success" : "challenge_failure";
      const challengeTransaction = { id: `${reason}:${challenge.id}`, reason, amount: appliedPoints, challengeId: challenge.id, createdAt: settledAt };
      const predictionResult = settleChallengePredictions(state.stakedPredictions, challenge.id, action.outcome, settledAt);
      const predictionTransactions = Object.values(predictionResult.predictions)
        .filter((item) => item.challengeId === challenge.id && item.status === "won" && item.settledAt === settledAt)
        .map((item) => ({ id: `PREDICTION_PAYOUT:${item.id}`, reason: `PREDICTION_PAYOUT:${item.id}`, amount: item.payout ?? 0, challengeId: challenge.id, createdAt: settledAt }));
      const updatedChallenges = state.challenges.map((item) => item.id === challenge.id ? {
        ...item,
        result: action.outcome,
        resolvedAt: settledAt,
        resolvedTimezone: action.resolvedTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        pointsSettled: true,
        proofMethodsUsed: action.proofMethodsUsed ?? item.proofMethodsUsed ?? [],
        aiProofVerified: action.aiProofVerified ?? item.aiProofVerified ?? false,
      } : item);
      return finalizeTransition(state, {
        ...state,
        challenges: updatedChallenges,
        stakedPredictions: predictionResult.predictions,
        wallet: nextWallet + predictionResult.creditedPoints,
        lifetimePointsEarned: state.lifetimePointsEarned + Math.max(0, appliedPoints) + predictionResult.creditedPoints,
        transactions: appendTransactions(state, [challengeTransaction, ...predictionTransactions]),
      });
    }
    case "create":
      return finalizeTransition(state, {
        ...state,
        challenges: [{ ...action.challenge, ownerId: state.authUserId ?? undefined, createdAt: action.challenge.createdAt ?? new Date().toISOString() }, ...state.challenges],
      });
    case "replace-challenges": {
      const previous = new Map(state.challenges.map((challenge) => [challenge.id, challenge]));
      const challenges = action.challenges.map((challenge) => {
        const saved = previous.get(challenge.id);
        return saved ? { ...saved, ...challenge, result: saved.result, pointsSettled: saved.pointsSettled, resolvedAt: saved.resolvedAt, resolvedTimezone: saved.resolvedTimezone, proofMethodsUsed: saved.proofMethodsUsed, aiProofVerified: saved.aiProofVerified } : challenge;
      });
      return finalizeTransition(state, { ...state, challenges });
    }
    case "delete": {
      const challenge = state.challenges.find((item) => item.id === action.id);
      if (!challenge || !state.authUserId || challenge.ownerId !== state.authUserId) return state;
      const nextChallenges = state.challenges.filter((item) => item.id !== action.id);
      const predictions = { ...state.predictions };
      delete predictions[action.id];
      const result = voidChallengePredictions(state.stakedPredictions, action.id);
      const wallet = state.wallet + result.refundedPoints;
      return finalizeTransition(state, {
        ...state,
        challenges: nextChallenges,
        predictions,
        stakedPredictions: result.predictions,
        wallet,
        transactions: result.refundedPoints ? appendTransactions(state, [{ id: `PREDICTION_REFUND:${action.id}`, reason: `PREDICTION_REFUND:${action.id}`, amount: result.refundedPoints, challengeId: action.id, createdAt: new Date().toISOString() }]) : state.transactions,
      });
    }
    case "buy": {
      const reward = rewards.find((item) => item.id === action.id);
      if (!reward || state.owned.includes(reward.id) || state.wallet < reward.price) return state;
      const reason = `STORE_PURCHASE:${reward.id}`;
      return finalizeTransition(state, {
        ...state,
        wallet: state.wallet - reward.price,
        owned: [...state.owned, reward.id],
        transactions: appendTransactions(state, [{ id: reason, reason, amount: -reward.price, createdAt: new Date().toISOString() }]),
      });
    }
    case "equip": {
      const reward = rewards.find((item) => item.id === action.id);
      if (!reward || !state.owned.includes(reward.id)) return state;
      return finalizeTransition(state, { ...state, equipped: { ...state.equipped, [reward.slot]: reward.name } });
    }
  }
}

const AppContext = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const claimsInFlight = useRef(new Set<BadgeId>());

  useEffect(() => {
    const userId = state.authUserId;
    if (!userId) return;
    let active = true;
    void (async () => {
      const [stateResult, badgeResult, followingResult] = await Promise.allSettled([
        fetch(`${API_URL}/users/${userId}/app-state`).then(async (response) => response.ok ? response.json() : null),
        fetch(`${API_URL}/users/${userId}/badges`).then(async (response) => response.ok ? response.json() : null),
        fetch(`${API_URL}/users/${userId}/following`).then(async (response) => response.ok ? response.json() : null),
      ]);
      if (!active) return;
      const saved = stateResult.status === "fulfilled" ? stateResult.value : null;
      const badgesPayload = badgeResult.status === "fulfilled" ? badgeResult.value : null;
      const followingPayload = followingResult.status === "fulfilled" ? followingResult.value : null;
      dispatch({
        type: "hydrate",
        data: saved?.data ?? null,
        badges: Array.isArray(badgesPayload?.badges) ? badgesPayload.badges : [],
      });
      if (Array.isArray(followingPayload?.followed_ids)) {
        dispatch({ type: "set-following-ids", ids: followingPayload.followed_ids });
      }
      setHydratedUserId(userId);
    })();
    return () => { active = false; };
  }, [state.authUserId]);

  useEffect(() => {
    if (!state.authUserId || hydratedUserId !== state.authUserId) return;
    const userId = state.authUserId;
    const data: PersistedState = {
      friendIds: state.friendIds,
      challenges: state.challenges,
      predictions: state.predictions,
      stakedPredictions: state.stakedPredictions,
      wallet: state.wallet,
      pointsBalance: state.wallet,
      lifetimePointsEarned: state.lifetimePointsEarned,
      transactions: state.transactions,
      owned: state.owned,
      equipped: state.equipped,
      badgeUnlocks: state.badgeUnlocks,
      pendingBadgeClaims: state.pendingBadgeClaims,
    };
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      void fetch(`${API_URL}/users/${userId}/app-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 2, data }),
      }).then((response) => {
        if (!response.ok) throw new Error("Could not save app state");
        if (active) setSavedUserId(userId);
      }).catch(() => {
        retryTimer = setTimeout(() => { if (active) setRetry((value) => value + 1); }, 5000);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [state, hydratedUserId, retry]);

  useEffect(() => {
    const userId = state.authUserId;
    if (!userId || hydratedUserId !== userId || savedUserId !== userId || !state.pendingBadgeClaims.length) return;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pending = state.pendingBadgeClaims;
    void (async () => {
      for (const badgeId of pending) {
        if (!active) break;
        if (claimsInFlight.current.has(badgeId)) continue;
        claimsInFlight.current.add(badgeId);
        try {
          const response = await fetch(`${API_URL}/users/${userId}/badges/${badgeId}/claim`, { method: "POST" });
          if (!response.ok) throw new Error("Could not claim badge");
          const result = await response.json();
          if (active) dispatch({
            type: "badge-claim-completed",
            badgeId,
            unlockedAt: result.unlocked_at,
            rewardPointsGranted: result.reward_points_granted,
            wallet: result.wallet,
            created: result.created,
          });
        } catch {
          retryTimer = setTimeout(() => { if (active) setRetry((value) => value + 1); }, 5000);
        } finally {
          claimsInFlight.current.delete(badgeId);
        }
      }
    })();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [state.authUserId, state.pendingBadgeClaims, hydratedUserId, savedUserId, retry]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}
export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be inside AppProvider");
  return context;
}
