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
} from "@/mock/data";
import { friendDirectory, initialFriendIds, myFriendId } from "@/mock/friends";
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
  predictions: Record<string, Prediction>;
  wallet: number;
  owned: string[];
  equipped: Record<CosmeticSlot, string>;
};
type Action =
  | { type: "login"; userId: string }
  | { type: "add-friend"; id: string }
  | { type: "predict"; id: string; choice: Prediction }
  | { type: "create"; challenge: Challenge }
  | { type: "delete"; id: string }
  | { type: "buy"; id: string }
  | { type: "equip"; id: string };
export const initialState: State = {
  authUserId: null,
  friendIds: initialFriendIds,
  challenges,
  predictions: {},
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
    case "predict":
      return {
        ...state,
        predictions: { ...state.predictions, [action.id]: action.choice },
      };
    case "create":
      return { ...state, challenges: [action.challenge, ...state.challenges] };
    case "delete": {
      const challenges = state.challenges.filter(
        (challenge) => challenge.id !== action.id || challenge.user !== "Fuka",
      );
      if (challenges.length === state.challenges.length) return state;
      const predictions = { ...state.predictions };
      delete predictions[action.id];
      return { ...state, challenges, predictions };
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
