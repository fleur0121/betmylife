import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { BrandAsset, type BrandAssetName } from "@/components/brand-asset";

export type FrameStyle = "default" | "purple_orbit" | "gold_star" | "fire" | "galaxy" | "electric" | "champion";
const frameAssets: Record<FrameStyle, BrandAssetName> = {
  default: "framePurpleAura",
  purple_orbit: "framePurpleAura",
  gold_star: "frameSunny",
  fire: "frameFire",
  galaxy: "frameGalaxy",
  electric: "frameGalaxy",
  champion: "frameSunny",
};
export function getFrameStyle(name?: string): FrameStyle {
  const normalized = (name ?? "").toLowerCase();
  if (normalized.includes("gold")) return "gold_star";
  if (normalized.includes("sunny")) return "gold_star";
  if (normalized.includes("fire")) return "fire";
  if (normalized.includes("galaxy")) return "galaxy";
  if (normalized.includes("electric")) return "electric";
  if (normalized.includes("champion")) return "champion";
  if (normalized.includes("purple") || normalized.includes("orbit") || normalized.includes("aura")) return "purple_orbit";
  return "default";
}

export function AvatarFrame({ frame = "default", size = 96, asset, children }: PropsWithChildren<{ frame?: FrameStyle; size?: number; asset?: BrandAssetName }>) {
  const overlaySize = size * 2.08;
  return (
    <View accessibilityLabel={`${frame.replace("_", " ")} avatar frame`} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: size * 0.49, height: size * 0.49, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{children}</View>
      <BrandAsset name={asset ?? frameAssets[frame]} style={{ position: "absolute", width: overlaySize, height: overlaySize, left: (size - overlaySize) / 2, top: (size - overlaySize) / 2 }} label={`${frame.replace("_", " ")} frame`} />
      {frame === "electric" && <BrandAsset name="decoSparkleBlue" style={{ position: "absolute", width: size * 0.34, height: size * 0.34, top: size * 0.03, right: size * 0.02 }} label="Electric frame sparkle" />}
      {frame === "champion" && <BrandAsset name="iconTrophy" style={{ position: "absolute", width: size * 0.34, height: size * 0.34, top: size * 0.01, right: size * 0.01 }} label="Champion frame trophy" />}
    </View>
  );
}

export function SampleAvatar({ size }: { size: number }) {
  return <BrandAsset name="mascotCheerful" style={{ width: size * 0.6, height: size * 0.6 }} label="Cheerful cloud mascot avatar" />;
}
