import {
  BRAND_ASSET_GROUPS,
  BrandAsset,
  type BrandAssetName,
} from "@/components/brand-asset";
import { Text } from "@/components/localized-text";
import { Button, PageHeading, Screen, SectionHeader, s } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { router } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

const shelves: {
  key: keyof typeof BRAND_ASSET_GROUPS;
  title: string;
  note: string;
  color: string;
}[] = [
  { key: "mascots", title: "Cloud crew", note: "A cloud for every mood", color: c.sky },
  { key: "states", title: "Little moments", note: "Wins, wishes & fresh starts", color: c.peach },
  { key: "frames", title: "Picture frames", note: "Give your profile a glow-up", color: c.lavender },
  { key: "icons", title: "Tiny symbols", note: "The little details around the app", color: c.cream },
  { key: "badges", title: "Milestone badges", note: "Celebrate every kind of progress", color: c.mint },
  { key: "rewards", title: "Pocket rewards", note: "Small treats for showing up", color: c.peach },
  { key: "decor", title: "Happy accents", note: "A little sparkle goes a long way", color: c.sky },
  { key: "stickers", title: "Words to keep", note: "Gentle reminders for the journey", color: c.lavender },
];

function prettyName(asset: BrandAssetName) {
  return asset
    .replace(/^(mascot|state|frame|icon|category|status|badge|deco|reward|sticker)/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/V(\d+)/g, " · $1")
    .replace(/Classic/g, "")
    .replace(/Ai/g, "AI")
    .trim();
}

function AssetTile({ asset, color }: { asset: BrandAssetName; color: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <View style={styles.artFrame}>
        <BrandAsset
          name={asset}
          style={styles.art}
          label={prettyName(asset)}
        />
      </View>
      <Text numberOfLines={2} style={styles.tileLabel}>
        {prettyName(asset)}
      </Text>
    </View>
  );
}

export default function CloudCloset() {
  return (
    <Screen title="Cloud closet" back>
      <PageHeading
        eyebrow="A LITTLE ART FOR EVERY DAY"
        title="The cloud closet"
        subtitle="Meet the mascots, badges and bright little details that make this space yours."
        right={<BrandAsset name="mascotIdea" style={styles.heroMascot} label="Curious cloud mascot" />}
      />

      <View style={styles.welcomeCard}>
        <BrandAsset name="decoRainbowStar" style={styles.welcomeSparkle} />
        <View style={s.flex}>
          <Text style={styles.welcomeTitle}>A whole lot of little joy</Text>
          <Text style={styles.welcomeCopy}>
            Browse every illustration by theme. Swipe a shelf to see the whole collection.
          </Text>
        </View>
        <BrandAsset name="decoArrowBlue" style={styles.welcomeArrow} />
      </View>

      {shelves.map((shelf) => {
        const data = BRAND_ASSET_GROUPS[shelf.key] as readonly BrandAssetName[];
        return (
          <View key={shelf.key} style={styles.shelf}>
            <SectionHeader
              title={shelf.title}
              detail={`${data.length} little pieces`}
            />
            <Text style={styles.shelfNote}>{shelf.note}</Text>
            <FlatList
              horizontal
              data={data}
              keyExtractor={(asset) => asset}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelfItems}
              initialNumToRender={4}
              maxToRenderPerBatch={6}
              windowSize={4}
              renderItem={({ item }) => <AssetTile asset={item} color={shelf.color} />}
            />
          </View>
        );
      })}

      <View style={styles.shopCard}>
        <BrandAsset name="mascotCelebrating" style={styles.shopMascot} />
        <View style={s.flex}>
          <Text style={styles.welcomeTitle}>Found a favorite?</Text>
          <Text style={styles.welcomeCopy}>Pick up a frame or reward in the shop.</Text>
        </View>
        <Button secondary label="Visit shop" onPress={() => router.push("/shop")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroMascot: { width: 76, height: 74 },
  welcomeCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 22,
    backgroundColor: c.cream,
    overflow: "hidden",
  },
  welcomeTitle: { color: c.text, fontSize: 14, fontWeight: "900" },
  welcomeCopy: { marginTop: 3, color: c.muted, fontSize: 10, lineHeight: 15 },
  welcomeSparkle: { width: 42, height: 42 },
  welcomeArrow: { width: 34, height: 34, transform: [{ rotate: "8deg" }] },
  shelf: { gap: 2 },
  shelfNote: { marginTop: -8, marginBottom: 4, color: c.muted, fontSize: 10 },
  shelfItems: { gap: 9, paddingVertical: 6, paddingRight: 4 },
  tile: {
    width: 88,
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: 7,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(75, 59, 112, 0.08)",
  },
  artFrame: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  art: { width: 62, height: 62 },
  tileLabel: {
    minHeight: 25,
    color: c.text,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  shopCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 21,
    backgroundColor: c.lavenderLight,
  },
  shopMascot: { width: 58, height: 58 },
});
