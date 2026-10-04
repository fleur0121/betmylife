/**
 * アプリ全体のモック状態を管理するContextとReducer。
 * predict・create・buy・equip・add-friendで予想、チャレンジ、残高、所有品、装備、友達を更新する。
 * 購入時は二重購入と残高不足、装備時は所有の有無、友達追加時は自己追加・重複・存在を確認する。
 * AppProviderをルートに配置し、各画面はuseAppStateで利用する。永続化はせず再読み込みで初期化する。
 */
import {
    challenges,
    initialCosmetics,
    initialWallet,
    rewards,
    type Challenge,
    type CosmeticSlot,
    type Prediction,
    type PredictionChoice,
} from "@/mock/data";
import { friendDirectory, initialFriendIds, myFriendId } from "@/mock/friends";
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
import {
    createContext,
    useContext,
    useReducer,
    type PropsWithChildren,
} from "react";
type State = {
  authUserId: string | null;
  friendIds: string[];
  challenges: Challenge[];
  predictions: Record<string, PredictionChoice>;
  stakedPredictions: Record<string, Prediction>;
  wallet: number;
  owned: string[];
  equipped: Record<CosmeticSlot, string>;
};
type Action =
  | { type: "login"; userId: string }
  | { type: "add-friend"; id: string }
  | { type: "place-prediction"; prediction: Prediction }
  | { type: "cancel-prediction"; challengeId: string; cancelledAt?: string }
  | {
      type: "settle-predictions";
      challengeId: string;
      outcome: ChallengeOutcome;
      settledAt?: string;
    }
  | { type: "create"; challenge: Challenge }
  | { type: "delete"; id: string }
  | { type: "buy"; id: string }
  | { type: "equip"; id: string };
export const initialState: State = {
  authUserId: null,
  friendIds: initialFriendIds,
  challenges,
  predictions: {},
  stakedPredictions: {},
  wallet: initialWallet,
  owned: [],
  equipped: initialCosmetics,
};
export function appReducer(state: State, action: Action): State {
  switch (action.type) {
    case "login":
      return { ...state, authUserId: action.userId };
    case "add-friend": {
      if (
        action.id === myFriendId ||
        state.friendIds.includes(action.id) ||
        !friendDirectory.some((friend) => friend.id === action.id)
      )
        return state;
      return { ...state, friendIds: [...state.friendIds, action.id] };
    }
    case "place-prediction": {
      const prediction = action.prediction;
      const challenge = state.challenges.find(
        (item) => item.id === prediction.challengeId,
      );
      const user = friendDirectory.find(
        (item) => item.id === prediction.userId,
      );
      const author =
        challenge &&
        friendDirectory.find((item) => item.name === challenge.user);
      const odds =
        challenge &&
        Number(
          prediction.choice === "yes" ? challenge.yesOdds : challenge.noOdds,
        );
      const previous = Object.values(state.stakedPredictions).find(
        (item) =>
          item.challengeId === prediction.challengeId &&
          item.userId === prediction.userId &&
          item.status === "active",
      );
      const settledBefore = Object.values(state.stakedPredictions).some(
        (item) =>
          item.challengeId === prediction.challengeId &&
          item.userId === prediction.userId &&
          (item.status === "won" || item.status === "lost"),
      );
      if (
        !challenge ||
        !user ||
        prediction.userId !== myFriendId ||
        !author ||
        author.id === prediction.userId ||
        !validateStake(prediction.stake, state.wallet + (previous?.stake ?? 0))
          .valid ||
        isChallengeExpired(challenge) ||
        isPredictionWindowClosed(challenge) ||
        (previous !== undefined && isPredictionLocked(previous, challenge)) ||
        settledBefore ||
        !Number.isFinite(odds) ||
        odds! <= 0 ||
        prediction.lockedOdds !== odds ||
        prediction.status !== "active" ||
        Object.values(state.stakedPredictions).some(
          (item) =>
            item.challengeId === challenge.id &&
            item.userId === prediction.userId &&
            item.status !== "void" &&
            item !== previous,
        ) ||
        (state.stakedPredictions[prediction.id] !== undefined &&
          state.stakedPredictions[prediction.id] !== previous)
      )
        return state;
      const storedPrediction: Prediction = {
        ...prediction,
        id: previous?.id ?? prediction.id,
        createdAt: previous?.createdAt ?? prediction.createdAt,
        lockAt: previous?.lockAt ?? getPredictionLockAt(challenge) ?? undefined,
      };
      const stakedPredictions = {
        ...state.stakedPredictions,
        [storedPrediction.id]: storedPrediction,
      };
      return {
        ...state,
        predictions: {
          ...state.predictions,
          [prediction.challengeId]: prediction.choice,
        },
        wallet: state.wallet + (previous?.stake ?? 0) - prediction.stake,
        stakedPredictions,
      };
    }
    case "cancel-prediction": {
      const challenge = state.challenges.find(
        (item) => item.id === action.challengeId,
      );
      const prediction = Object.values(state.stakedPredictions).find(
        (item) =>
          item.challengeId === action.challengeId &&
          item.userId === myFriendId &&
          item.status === "active",
      );
      if (
        !challenge ||
        !prediction ||
        isPredictionLocked(prediction, challenge)
      )
        return state;
      const settledAt = action.cancelledAt ?? new Date().toISOString();
      const stakedPredictions = {
        ...state.stakedPredictions,
        [prediction.id]: {
          ...prediction,
          status: "void" as const,
          payout: prediction.stake,
          settledAt,
        },
      };
      const predictions = { ...state.predictions };
      delete predictions[action.challengeId];
      return {
        ...state,
        predictions,
        stakedPredictions,
        wallet: state.wallet + prediction.stake,
      };
    }
    case "settle-predictions": {
      const result = settleChallengePredictions(
        state.stakedPredictions,
        action.challengeId,
        action.outcome,
        action.settledAt,
      );
      if (!result.changed) return state;
      return {
        ...state,
        stakedPredictions: result.predictions,
        wallet: state.wallet + result.creditedPoints,
      };
    }
    case "create":
      return { ...state, challenges: [action.challenge, ...state.challenges] };
    case "delete": {
      const challenges = state.challenges.filter(
        (challenge) => challenge.id !== action.id || challenge.user !== "Fuka",
      );
      if (challenges.length === state.challenges.length) return state;
      const predictions = { ...state.predictions };
      delete predictions[action.id];
      const result = voidChallengePredictions(
        state.stakedPredictions,
        action.id,
      );
      return {
        ...state,
        challenges,
        predictions,
        stakedPredictions: result.predictions,
        wallet: state.wallet + result.refundedPoints,
      };
    }
    case "buy": {
      const reward = rewards.find((item) => item.id === action.id);
      if (
        !reward ||
        state.owned.includes(reward.id) ||
        state.wallet < reward.price
      )
        return state;
      return {
        ...state,
        wallet: state.wallet - reward.price,
        owned: [...state.owned, reward.id],
      };
    }
    case "equip": {
      const reward = rewards.find((item) => item.id === action.id);
      if (!reward || !state.owned.includes(reward.id)) return state;
      return {
        ...state,
        equipped: { ...state.equipped, [reward.slot]: reward.name },
      };
    }
  }
}
const AppContext = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
} | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}
export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be inside AppProvider");
  return context;
}
