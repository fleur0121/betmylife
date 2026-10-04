import { BRAND_ASSET_GROUPS, type BrandAssetName } from "@/components/brand-asset";

export type CosmeticSlot = "Frame" | "Badge" | "Background" | "Title";
export type Reward = {
  id: string;
  name: string;
  price: number;
  asset: BrandAssetName;
  color: string;
  slot: CosmeticSlot;
};
function getFrameRewardName(asset: string) {
  const frameName = asset
    .replace(/^frame/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/Ai/g, "AI")
    .replace(/Classic/g, "")
    .trim();
  return `${frameName} Frame`;
}

const frameColors = ["#E9E5FA", "#DDF8EC", "#FFF3CE", "#E2F1FF", "#FCECEF"];
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
  ...BRAND_ASSET_GROUPS.frames
    .filter((asset) => asset !== "frameSunny" && asset !== "frameGalaxy")
    .map((asset, index) => ({
      id: `frame-${asset}`,
      name: getFrameRewardName(asset),
      price: 200 + index * 20,
      asset,
      color: frameColors[index % frameColors.length],
      slot: "Frame" as const,
    })),
];
