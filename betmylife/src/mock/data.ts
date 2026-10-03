/**
 * 画面で使うモックデータと、そのデータ構造を表すTypeScript型。
 * ユーザー、チャレンジ、リワード、初期装備、分析用の数値とヒントをまとめて定義する。
 * プロフィールの週間ポイントとShopの初期ウォレットは用途の異なる値。
 * API接続時は、この型を基準に実データへの置き換えを進められる。
 */
export type Category = "Study" | "Fitness" | "Lifestyle";
export type Prediction = "yes" | "no";
export type Visibility = "public" | "friends";
export type Challenge = {
  id: string;
  user: string;
  avatar: string;
  color: string;
  title: string;
  category: Category;
  deadline: string;
  confidence: number;
  probability: number;
  yesOdds: string;
  noOdds: string;
  friends: number;
  difficulty: number;
  visibility: Visibility;
  titleJa?: string;
};
export const currentUser = {
  name: "Fuka",
  avatar: "🌷",
  title: "AI Slayer",
  points: 980,
  accuracy: 74,
  streak: 5,
  completed: 12,
};
export const initialWallet = 1250;
export const challenges: Challenge[] = [
  {
    id: "wake",
    user: "Fuka",
    avatar: "🌷",
    color: "#EEE7FC",
    title: "Wake up before 7 AM tomorrow",
    category: "Lifestyle",
    deadline: "8h 32m remaining",
    confidence: 80,
    probability: 68,
    yesOdds: "1.47",
    noOdds: "3.13",
    friends: 12,
    difficulty: 3,
    visibility: "public",
    titleJa: "明日は朝7時までに起きる",
  },
  {
    id: "gym",
    user: "Alex",
    avatar: "🐻",
    color: "#FFE8DA",
    title: "Hit the gym 3 times this week",
    category: "Fitness",
    deadline: "2 days remaining",
    confidence: 90,
    probability: 82,
    yesOdds: "1.22",
    noOdds: "5.56",
    friends: 8,
    difficulty: 4,
    visibility: "public",
    titleJa: "今週3回ジムに行く",
  },
  {
    id: "study",
    user: "Sarah",
    avatar: "🍀",
    color: "#E8F5ED",
    title: "Finish my assignment before dinner",
    category: "Study",
    deadline: "5h 15m remaining",
    confidence: 70,
    probability: 65,
    yesOdds: "1.54",
    noOdds: "2.86",
    friends: 16,
    difficulty: 3,
    visibility: "public",
    titleJa: "夕食前に課題を終わらせる",
  },
];
export const users = [
  {
    name: "Noah",
    avatar: "🦊",
    color: "#FFF3D8",
    points: 1250,
    accuracy: 86,
    streak: 9,
  },
  {
    name: "Fuka",
    avatar: "🌷",
    color: "#EEE7FC",
    points: 980,
    accuracy: 74,
    streak: 5,
  },
  {
    name: "Alex",
    avatar: "🐻",
    color: "#FFE8DA",
    points: 720,
    accuracy: 79,
    streak: 7,
  },
  {
    name: "Sarah",
    avatar: "🍀",
    color: "#E8F5ED",
    points: 640,
    accuracy: 81,
    streak: 4,
  },
  {
    name: "Liam",
    avatar: "🐳",
    color: "#E4EFFC",
    points: 580,
    accuracy: 68,
    streak: 3,
  },
  {
    name: "Mia",
    avatar: "🍑",
    color: "#FCECEF",
    points: 420,
    accuracy: 71,
    streak: 6,
  },
];
export type CosmeticSlot = "Frame" | "Badge" | "Background" | "Title";
export type Reward = {
  id: string;
  name: string;
  price: number;
  emoji: string;
  color: string;
  slot: CosmeticSlot;
};
export const rewards: Reward[] = [
  {
    id: "aura",
    name: "Purple Aura Frame",
    price: 300,
    emoji: "🌷",
    color: "#EEE7FC",
    slot: "Frame",
  },
  {
    id: "crown",
    name: "Gold Crown",
    price: 500,
    emoji: "👑",
    color: "#FFF3D8",
    slot: "Badge",
  },
  {
    id: "fire",
    name: "Fire Frame",
    price: 700,
    emoji: "🔥",
    color: "#FFE8DA",
    slot: "Frame",
  },
  {
    id: "galaxy",
    name: "Galaxy Background",
    price: 800,
    emoji: "🪐",
    color: "#E9E5FA",
    slot: "Background",
  },
  {
    id: "title",
    name: "Custom Title",
    price: 1000,
    emoji: "✨",
    color: "#E8F5ED",
    slot: "Title",
  },
];
export const initialCosmetics: Record<CosmeticSlot, string> = {
  Frame: "Lavender Bloom",
  Badge: "Rising Star",
  Background: "Soft Lavender",
  Title: "AI Slayer",
};
export const categoryStats = [
  { name: "Wake Up", emoji: "☀️", value: 45 },
  { name: "Gym", emoji: "💪", value: 80 },
  { name: "Study", emoji: "📚", value: 65 },
  { name: "Cooking", emoji: "🍳", value: 35 },
];
export const insights = [
  {
    emoji: "💪",
    title: "Fitness is your superpower",
    text: "Your fitness challenges have the highest completion rate.",
  },
  {
    emoji: "🌱",
    title: "Start the week strong",
    text: "You are more successful earlier in the week. Save a big goal for Monday.",
  },
  {
    emoji: "🔮",
    title: "A little optimistic? We love it.",
    text: "Your confidence is usually slightly higher than your actual completion rate.",
  },
];
