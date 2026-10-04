import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

const assets = {
  mascotCheerful: require("@/assets/brand/mascots/cheerful.png"),
  mascotSupportive: require("@/assets/brand/mascots/supportive.png"),
  mascotCurious: require("@/assets/brand/mascots/curious.png"),
  mascotCelebrating: require("@/assets/brand/mascots/celebrating.png"),
  mascotReading: require("@/assets/brand/mascots/reading.png"),
  mascotActive: require("@/assets/brand/mascots/active.png"),
  mascotFocused: require("@/assets/brand/mascots/focused.png"),
  mascotCheering: require("@/assets/brand/mascots/cheering.png"),
  mascotPrediction: require("@/assets/brand/mascots/prediction.png"),
  iconStudy: require("@/assets/brand/icons/study.png"),
  iconFitness: require("@/assets/brand/icons/fitness.png"),
  iconLifestyle: require("@/assets/brand/icons/lifestyle.png"),
  iconPoints: require("@/assets/brand/icons/points.png"),
  iconStreak: require("@/assets/brand/icons/streak.png"),
  iconAiInsight: require("@/assets/brand/icons/aiInsight.png"),
  iconTrophy: require("@/assets/brand/icons/trophy.png"),
  iconLeaderboard: require("@/assets/brand/icons/leaderboard.png"),
  iconShop: require("@/assets/brand/icons/shop.png"),
  iconPrediction: require("@/assets/brand/icons/prediction.png"),
  iconConfidence: require("@/assets/brand/icons/confidence.png"),
  iconSuccess: require("@/assets/brand/icons/success.png"),
  iconFailed: require("@/assets/brand/icons/failed.png"),
  iconChallenge: require("@/assets/brand/icons/challenge.png"),
  badgeFirstChallenge: require("@/assets/brand/badges/firstChallenge.png"),
  badgeThreeDayStreak: require("@/assets/brand/badges/threeDayStreak.png"),
  badgeSevenDayStreak: require("@/assets/brand/badges/sevenDayStreak.png"),
  badgeKnowledgeBuilder: require("@/assets/brand/badges/knowledgeBuilder.png"),
  badgeFitnessHero: require("@/assets/brand/badges/fitnessHero.png"),
  badgeEarlyBird: require("@/assets/brand/badges/earlyBird.png"),
  badgeAiSlayer: require("@/assets/brand/badges/aiSlayer.png"),
  badgeConsistency: require("@/assets/brand/badges/consistency.png"),
  frameSunny: require("@/assets/brand/frames/sunny.png"),
  framePurpleAura: require("@/assets/brand/frames/purpleAura.png"),
  frameGalaxy: require("@/assets/brand/frames/galaxy.png"),
  frameFire: require("@/assets/brand/frames/fire.png"),
  rewardFocusBeats: require("@/assets/brand/rewards/focusBeats.png"),
  rewardBookLover: require("@/assets/brand/rewards/bookLover.png"),
  rewardPlantBuddy: require("@/assets/brand/rewards/plantBuddy.png"),
  rewardChillCap: require("@/assets/brand/rewards/chillCap.png"),
  decoSparkleBlue: require("@/assets/brand/decor/sparkleBlue.png"),
  stickerKeepGoing: require("@/assets/brand/stickers/keepGoing.png"),
  stickerSmallSteps: require("@/assets/brand/stickers/smallSteps.png"),
  stickerYouGotThis: require("@/assets/brand/stickers/youGotThis.png"),
  stickerBrighterDays: require("@/assets/brand/stickers/brighterDays.png"),
  stickerFocused: require("@/assets/brand/stickers/focused.png"),
  stickerBigDreamer: require("@/assets/brand/stickers/bigDreamer.png"),
  stickerYouCalledIt: require("@/assets/brand/stickers/youCalledIt.png"),
  statePredicting: require("@/assets/brand/states/predicting.png"),
  statePointsEarned: require("@/assets/brand/states/pointsEarned.png"),
  stateChallengeSuccess: require("@/assets/brand/states/challengeSuccess.png"),
  stateChallengeFailed: require("@/assets/brand/states/challengeFailed.png"),
  stateNoChallenges: require("@/assets/brand/states/noChallenges.png"),
  stateNoFriends: require("@/assets/brand/states/noFriends.png"),
} as const;

export type BrandAssetName = keyof typeof assets;

export function BrandAsset({
  name,
  style,
  label,
}: {
  name: BrandAssetName;
  style: StyleProp<ImageStyle>;
  label?: string;
}) {
  return (
    <Image
      source={assets[name]}
      style={style}
      contentFit="contain"
      accessibilityLabel={label}
      accessible={!!label}
    />
  );
}
