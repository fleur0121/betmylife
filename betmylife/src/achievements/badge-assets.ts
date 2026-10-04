import type { BadgeId } from "./badge-metadata";

export type BadgeArtwork = { image: number; miniImage?: number };

export const BADGE_ARTWORK: Record<BadgeId, BadgeArtwork> = {
  first_challenge: { image: require("@/assets/brand/badges/badge_first_challenge_v2.png"), miniImage: require("@/assets/brand/badges/badge_mini_first_challenge.png") },
  goal_getter: { image: require("@/assets/brand/badges/badge_goal_getter.png") },
  big_achiever: { image: require("@/assets/brand/badges/badge_big_achiever.png"), miniImage: require("@/assets/brand/badges/badge_mini_big_achiever.png") },
  habit_hero: { image: require("@/assets/brand/badges/badge_habit_hero.png") },
  challenge_champion: { image: require("@/assets/brand/badges/badge_challenge_champion.png") },
  streak_starter: { image: require("@/assets/brand/badges/badge_streak_starter.png") },
  three_day_streak: { image: require("@/assets/brand/badges/threeDayStreak.png") },
  seven_day_streak: { image: require("@/assets/brand/badges/badge_7_day_streak_v2.png"), miniImage: require("@/assets/brand/badges/badge_mini_7_day_streak.png") },
  fourteen_day_streak: { image: require("@/assets/brand/badges/badge_14_day_streak.png") },
  thirty_day_streak: { image: require("@/assets/brand/badges/badge_30_day_streak.png") },
  consistency: { image: require("@/assets/brand/badges/consistency.png"), miniImage: require("@/assets/brand/badges/badge_mini_consistent_you.png") },
  perfect_week: { image: require("@/assets/brand/badges/badge_perfect_week.png") },
  comeback: { image: require("@/assets/brand/badges/badge_comeback.png") },
  fitness_hero: { image: require("@/assets/brand/badges/badge_fitness_hero_v2.png"), miniImage: require("@/assets/brand/badges/badge_mini_fitness_hero.png") },
  knowledge_builder: { image: require("@/assets/brand/badges/badge_knowledge_builder_v2.png"), miniImage: require("@/assets/brand/badges/badge_mini_knowledge.png") },
  positive_habits: { image: require("@/assets/brand/badges/badge_positive_habits.png"), miniImage: require("@/assets/brand/badges/badge_mini_positive_mindset.png") },
  early_bird: { image: require("@/assets/brand/badges/earlyBird.png") },
  night_owl: { image: require("@/assets/brand/badges/badge_night_owl.png") },
  focus_mode: { image: require("@/assets/brand/badges/badge_focus_mode.png") },
  ai_explorer: { image: require("@/assets/brand/badges/badge_ai_explorer.png") },
  ai_slayer: { image: require("@/assets/brand/badges/aiSlayer.png") },
  prediction_master: { image: require("@/assets/brand/badges/badge_prediction_master.png") },
  social_butterfly: { image: require("@/assets/brand/badges/badge_social_butterfly.png"), miniImage: require("@/assets/brand/badges/badge_mini_social_butterfly.png") },
  points_collector: { image: require("@/assets/brand/badges/badge_points_collector.png") },
  reward_hunter: { image: require("@/assets/brand/badges/badge_reward_hunter.png") },
};
