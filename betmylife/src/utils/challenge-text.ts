import type { Challenge } from "@/mock/data";

type Locale = "en" | "ja";

const localJapaneseTranslations: Record<string, string> = {
  "Wake up before 7 AM tomorrow": "明日は朝7時までに起きる",
  "Hit the gym 3 times this week": "今週3回ジムに行く",
  "Finish my assignment before dinner": "夕食前に課題を終わらせる",
};

export function getJapaneseTitle(challenge: Challenge) {
  return challenge.titleJa ?? localJapaneseTranslations[challenge.title];
}

export function getChallengeTitle(challenge: Challenge, locale: Locale) {
  const japaneseTitle = getJapaneseTitle(challenge);
  if (locale === "ja" && japaneseTitle) return japaneseTitle;
  return challenge.title;
}
