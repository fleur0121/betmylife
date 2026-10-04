/**
 * 画面で使うモックデータと、そのデータ構造を表すTypeScript型。
 * ユーザー、チャレンジ、リワード、初期装備、分析用の数値とヒントをまとめて定義する。
 * プロフィールの週間ポイントとShopの初期ウォレットは用途の異なる値。
 * API接続時は、この型を基準に実データへの置き換えを進められる。
 */
export type Category = "Study" | "Fitness" | "Lifestyle";
export type PredictionChoice = "yes" | "no";
export type PredictionStatus = "active" | "won" | "lost" | "void";
export interface Prediction {
  id: string;
  challengeId: string;
  userId: string;
  choice: PredictionChoice;
  stake: number;
  lockedOdds: number;
  potentialReturn: number;
  potentialProfit: number;
  status: PredictionStatus;
  payout?: number;
  createdAt: string;
  lockAt?: string;
  settledAt?: string;
}
export type Visibility = "public" | "friends";
export type ProofMethod =
  | "photo"
  | "live_camera"
  | "before_after"
  | "timer"
  | "focus_session"
  | "ai_quiz"
  | "text_artifact"
  | "word_count"
  | "friend_witness"
  | "checkpoint"
  | "location"
  | "duration"
  | "screen_time"
  | "health_steps"
  | "health_sleep"
  | "health_workout"
  | "distance"
  | "self_report";
export type VerificationLogic = "all" | "any";
export type VerificationStrength = "basic" | "medium" | "strong";
export type ProofRequirement = {
  id: string;
  method: ProofMethod;
  label: string;
  instructions: string;
  required: boolean;
  config: {
    minimumPhotos?: number;
    minimumMinutes?: number;
    maximumMinutes?: number;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
    appName?: string;
    appIdentifier?: string;
    minimumSteps?: number;
    minimumSleepMinutes?: number;
    minimumDistanceMeters?: number;
    minimumWordCount?: number;
    quizQuestionCount?: number;
    quizPassingScore?: number;
    checkpointCount?: number;
    witnessCount?: number;
    requireLiveCapture?: boolean;
    workoutType?: string;
  };
};
export type VerificationPlan = {
  category: string;
  title: string;
  summary: string;
  logic: VerificationLogic;
  requirements: ProofRequirement[];
  explanation: string;
  verificationStrength: VerificationStrength;
  fallbackAllowed: boolean;
  funLabel?: string;
};
export type AppCapabilities = {
  photo: boolean;
  liveCamera: boolean;
  beforeAfter: boolean;
  timer: boolean;
  focusSession: boolean;
  aiQuiz: boolean;
  textArtifact: boolean;
  wordCount: boolean;
  friendWitness: boolean;
  checkpoint: boolean;
  location: boolean;
  screenTime: boolean;
  healthSteps: boolean;
  healthSleep: boolean;
  healthWorkout: boolean;
};
export type Challenge = {
  id: string;
  user: string;
  avatar: string;
  color: string;
  title: string;
  category: Category;
  deadline: string;
  /** Optional canonical deadline; human-readable `deadline` remains for display. */
  deadlineAt?: string;
  confidence: number;
  probability: number;
  yesOdds: string;
  noOdds: string;
  friends: number;
  difficulty: number;
  visibility: Visibility;
  titleJa?: string;
  proofPlan?: VerificationPlan;
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
export const initialWallet = 420;
const demoClock = Date.now();
const todayNinePm = new Date(demoClock);
todayNinePm.setHours(21, 0, 0, 0);
if (todayNinePm.getTime() <= demoClock)
  todayNinePm.setDate(todayNinePm.getDate() + 1);
export const challenges: Challenge[] = [
  {
    id: "read-today",
    user: "Fuka",
    avatar: "🌷",
    color: "#EEE7FC",
    title: "Read for 20 Minutes",
    category: "Study",
    deadline: "Today · 9:00 PM",
    deadlineAt: todayNinePm.toISOString(),
    confidence: 73,
    probability: 68,
    yesOdds: "1.47",
    noOdds: "3.13",
    friends: 12,
    difficulty: 2,
    visibility: "public",
    titleJa: "20分間読書する",
    proofPlan: {
      category: "study",
      title: "THE READING SPRINT",
      summary: "Read for 20 focused minutes.",
      logic: "all",
      requirements: [
        {
          id: "reading-timer",
          method: "timer",
          label: "Reading Timer",
          instructions: "Read for 20 focused minutes.",
          required: true,
          config: { minimumMinutes: 20 },
        },
      ],
      explanation:
        "A timer is a simple way to keep this small reading promise.",
      verificationStrength: "medium",
      fallbackAllowed: true,
    },
  },
  {
    id: "gym",
    user: "Alex",
    avatar: "🐻",
    color: "#FFE8DA",
    title: "Hit the gym 3 times this week",
    category: "Fitness",
    deadline: "2 days remaining",
    deadlineAt: new Date(demoClock + 2 * 24 * 60 * 60 * 1000).toISOString(),
    confidence: 90,
    probability: 82,
    yesOdds: "1.22",
    noOdds: "5.56",
    friends: 8,
    difficulty: 4,
    visibility: "public",
    titleJa: "今週3回ジムに行く",
    proofPlan: {
      category: "fitness",
      title: "PROVE THE PROGRESS",
      summary: "Show progress from one of your completed gym sessions.",
      logic: "all",
      requirements: [
        {
          id: "gym-photo",
          method: "photo",
          label: "Gym Progress Photo",
          instructions:
            "Upload a photo from one of your completed gym sessions.",
          required: true,
          config: { minimumPhotos: 1 },
        },
      ],
      explanation:
        "A photo can show visible progress without pretending to use location tracking.",
      verificationStrength: "medium",
      fallbackAllowed: true,
    },
  },
  {
    id: "study",
    user: "Sarah",
    avatar: "🍀",
    color: "#E8F5ED",
    title: "Finish my assignment before dinner",
    category: "Study",
    deadline: "5h 15m remaining",
    deadlineAt: new Date(
      demoClock + 5 * 60 * 60 * 1000 + 15 * 60 * 1000,
    ).toISOString(),
    confidence: 70,
    probability: 65,
    yesOdds: "1.54",
    noOdds: "2.86",
    friends: 16,
    difficulty: 3,
    visibility: "public",
    titleJa: "夕食前に課題を終わらせる",
    proofPlan: {
      category: "study",
      title: "SHOW THE FINISH",
      summary: "Show the finished assignment before dinner.",
      logic: "all",
      requirements: [
        {
          id: "assignment-photo",
          method: "photo",
          label: "Finished Assignment",
          instructions:
            "Upload a photo of your finished assignment before dinner.",
          required: true,
          config: { minimumPhotos: 1 },
        },
      ],
      explanation: "A photo is a useful way to show a finished piece of work.",
      verificationStrength: "medium",
      fallbackAllowed: true,
    },
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
  asset: import("@/components/brand-asset").BrandAssetName;
  color: string;
  slot: CosmeticSlot;
};
export const rewards: Reward[] = [
  {
    id: "sunny-frame",
    name: "Sunny Vibes Frame",
    price: 200,
    asset: "frameSunny",
    color: "#FFF3CE",
    slot: "Frame",
  },
  {
    id: "galaxy-frame",
    name: "Galaxy Frame",
    price: 300,
    asset: "frameGalaxy",
    color: "#E9E5FA",
    slot: "Frame",
  },
  {
    id: "focused-title",
    name: "Focused Title",
    price: 150,
    asset: "rewardFocusBeats",
    color: "#DDF8EC",
    slot: "Title",
  },
  {
    id: "big-dreamer-title",
    name: "Big Dreamer Title",
    price: 150,
    asset: "stickerBigDreamer",
    color: "#F1E5FF",
    slot: "Title",
  },
  {
    id: "plant-buddy",
    name: "Plant Buddy Sticker",
    price: 100,
    asset: "rewardPlantBuddy",
    color: "#DDF8EC",
    slot: "Badge",
  },
  {
    id: "chill-cap",
    name: "Chill Cap Sticker",
    price: 100,
    asset: "rewardChillCap",
    color: "#DDF2FF",
    slot: "Badge",
  },
  {
    id: "study-star",
    name: "Study Star Sticker",
    price: 100,
    asset: "rewardBookLover",
    color: "#E9E5FA",
    slot: "Badge",
  },
];
export const initialCosmetics: Record<CosmeticSlot, string> = {
  Frame: "Purple Aura Frame",
  Badge: "Rising Star",
  Background: "Soft Lavender",
  Title: "AI Slayer",
};
export const categoryStats = [
  { name: "Study", asset: "iconStudy", value: 65 },
  { name: "Fitness", asset: "iconFitness", value: 80 },
  { name: "Lifestyle", asset: "iconLifestyle", value: 58 },
  { name: "Wake Up", asset: "iconStreak", value: 45 },
] as const;
export const insights = [
  {
    asset: "iconFitness",
    title: "Fitness is your superpower",
    text: "Your fitness challenges have the highest completion rate.",
  },
  {
    asset: "stickerBrighterDays",
    title: "Start the week strong",
    text: "You are more successful earlier in the week. Save a big goal for Monday.",
  },
  {
    asset: "iconAiInsight",
    title: "A little optimistic? We love it.",
    text: "Your confidence is usually slightly higher than your actual completion rate.",
  },
] as const;
