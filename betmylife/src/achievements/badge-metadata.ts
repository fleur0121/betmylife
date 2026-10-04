export type BadgeId =
  | "first_challenge"
  | "goal_getter"
  | "big_achiever"
  | "habit_hero"
  | "challenge_champion"
  | "streak_starter"
  | "three_day_streak"
  | "seven_day_streak"
  | "fourteen_day_streak"
  | "thirty_day_streak"
  | "consistency"
  | "perfect_week"
  | "comeback"
  | "fitness_hero"
  | "knowledge_builder"
  | "positive_habits"
  | "early_bird"
  | "night_owl"
  | "focus_mode"
  | "ai_explorer"
  | "ai_slayer"
  | "prediction_master"
  | "social_butterfly"
  | "points_collector"
  | "reward_hunter";

export type BadgeCategory =
  | "Challenges"
  | "Consistency"
  | "Categories"
  | "Focus"
  | "AI"
  | "Social"
  | "Points";

export type BadgeMetadata = {
  id: BadgeId;
  name: string;
  description: string;
  requirement: string;
  category: BadgeCategory;
  rewardPoints: number;
  target: number;
  hidden: boolean;
};

export const BADGE_METADATA: BadgeMetadata[] = [
  { id: "first_challenge", name: "First Challenge", description: "Your journey starts here.", requirement: "Create your first challenge.", category: "Challenges", rewardPoints: 50, target: 1, hidden: false },
  { id: "goal_getter", name: "Goal Getter", description: "Complete your first goal.", requirement: "Successfully complete a challenge.", category: "Challenges", rewardPoints: 100, target: 1, hidden: false },
  { id: "big_achiever", name: "Big Achiever", description: "Complete a challenge at maximum difficulty.", requirement: "Successfully complete a Difficulty 5 challenge.", category: "Challenges", rewardPoints: 250, target: 1, hidden: false },
  { id: "habit_hero", name: "Habit Hero", description: "Build winning habits across your life.", requirement: "Successfully complete 20 challenges across 3 categories.", category: "Challenges", rewardPoints: 500, target: 20, hidden: false },
  { id: "challenge_champion", name: "Challenge Champion", description: "Complete 50 challenges.", requirement: "Successfully complete 50 challenges.", category: "Challenges", rewardPoints: 750, target: 50, hidden: false },
  { id: "streak_starter", name: "Streak Starter", description: "Small wins add up.", requirement: "Complete challenges on 2 consecutive local days.", category: "Consistency", rewardPoints: 50, target: 2, hidden: false },
  { id: "three_day_streak", name: "3 Day Streak", description: "Three days of showing up.", requirement: "Complete challenges on 3 consecutive local days.", category: "Consistency", rewardPoints: 100, target: 3, hidden: false },
  { id: "seven_day_streak", name: "7 Day Streak", description: "A full week of progress.", requirement: "Complete challenges on 7 consecutive local days.", category: "Consistency", rewardPoints: 250, target: 7, hidden: false },
  { id: "fourteen_day_streak", name: "14 Day Streak", description: "Two weeks of keeping your promise.", requirement: "Complete challenges on 14 consecutive local days.", category: "Consistency", rewardPoints: 500, target: 14, hidden: false },
  { id: "thirty_day_streak", name: "30 Day Streak", description: "A month of momentum.", requirement: "Complete challenges on 30 consecutive local days.", category: "Consistency", rewardPoints: 1000, target: 30, hidden: false },
  { id: "consistency", name: "Consistency", description: "Stay reliable when it matters.", requirement: "Succeed in at least 8 of your latest 10 resolved challenges.", category: "Consistency", rewardPoints: 300, target: 10, hidden: false },
  { id: "perfect_week", name: "Perfect Week", description: "A full week without missing a goal.", requirement: "Resolve 5 or more challenges successfully in one Monday–Sunday week, with no failures.", category: "Consistency", rewardPoints: 300, target: 5, hidden: false },
  { id: "comeback", name: "Comeback", description: "Failure isn't the end.", requirement: "After 2 consecutive failures, successfully complete your next challenge.", category: "Consistency", rewardPoints: 150, target: 1, hidden: false },
  { id: "fitness_hero", name: "Fitness Hero", description: "Movement is becoming your superpower.", requirement: "Successfully complete 10 Fitness challenges.", category: "Categories", rewardPoints: 200, target: 10, hidden: false },
  { id: "knowledge_builder", name: "Knowledge Builder", description: "Keep learning, one win at a time.", requirement: "Successfully complete 10 Study or learning challenges.", category: "Categories", rewardPoints: 200, target: 10, hidden: false },
  { id: "positive_habits", name: "Positive Habits", description: "Make space for habits that help you feel good.", requirement: "Successfully complete 10 Lifestyle, Health, Mindfulness, or Sleep challenges.", category: "Categories", rewardPoints: 200, target: 10, hidden: false },
  { id: "early_bird", name: "Early Bird", description: "You make mornings count.", requirement: "Successfully complete 3 challenges from 05:00 to 09:00 local time.", category: "Focus", rewardPoints: 100, target: 3, hidden: false },
  { id: "night_owl", name: "Night Owl", description: "You keep going after dark.", requirement: "Successfully complete 3 challenges from 21:00 to 02:00 local time.", category: "Focus", rewardPoints: 100, target: 3, hidden: false },
  { id: "focus_mode", name: "Focus Mode", description: "You showed up and stayed focused.", requirement: "Successfully complete 3 challenges using the focus timer or focus session proof.", category: "Focus", rewardPoints: 150, target: 3, hidden: false },
  { id: "ai_explorer", name: "AI Explorer", description: "Put an AI-made proof plan to work.", requirement: "Successfully complete a challenge with an AI-generated proof plan or AI quiz proof.", category: "AI", rewardPoints: 100, target: 1, hidden: false },
  { id: "ai_slayer", name: "AI Slayer", description: "You know how to prove your progress.", requirement: "Successfully complete 10 challenges with AI quiz proof.", category: "AI", rewardPoints: 300, target: 10, hidden: false },
  { id: "prediction_master", name: "Prediction Master", description: "Your predictions are backed by a track record.", requirement: "Resolve 10 predictions, get at least 10 correct, and reach 75% lifetime accuracy.", category: "Social", rewardPoints: 300, target: 10, hidden: false },
  { id: "social_butterfly", name: "Social Butterfly", description: "Good things grow together.", requirement: "Connect with 5 accepted friends.", category: "Social", rewardPoints: 200, target: 5, hidden: false },
  { id: "points_collector", name: "Points Collector", description: "Your effort keeps adding up.", requirement: "Earn 5,000 points over the lifetime of your account.", category: "Points", rewardPoints: 250, target: 5000, hidden: false },
  { id: "reward_hunter", name: "Reward Hunter", description: "Make your points work for you.", requirement: "Purchase 3 different reward-shop items.", category: "Points", rewardPoints: 150, target: 3, hidden: false },
];
