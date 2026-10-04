/**
 * Collectible identity page with equipped cosmetics, progress and recent activity.
 * Purchases and equipped items remain connected to the existing local reducer.
 */
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/localized-text";
import { BrandAsset, type BrandAssetName } from "@/components/brand-asset";
import { Button, Card, Screen, SectionHeader, s } from "@/components/ui-kit";
import { FeedTabs } from "@/components/feed-tabs";
import { ChallengeCard } from "@/components/challenge-card";
import { currentUser as user } from "@/mock/data";
import { myFriendId } from "@/mock/friends";
import { useAppState } from "@/state/app-state";
import { palette as c } from "@/constants/design";
import { API_URL } from "@/constants/api";

const futureSelves: { asset: BrandAssetName; label: string; color: string }[] = [
  { asset: "mascotReading", label: "FOCUSED YOU", color: c.sky },
  { asset: "mascotActive", label: "ENERGIZED YOU", color: c.peach },
  { asset: "mascotCurious", label: "CURIOUS YOU", color: c.lavender },
  { asset: "mascotCheering", label: "CONFIDENT YOU", color: c.mint },
];

const profileFrames: Record<string, BrandAssetName> = {
  "Sunny Vibes Frame": "frameSunny",
  "Purple Aura Frame": "framePurpleAura",
  "Galaxy Frame": "frameGalaxy",
  "Fire Frame": "frameFire",
};

export default function Profile() {
  const { state } = useAppState();
  const [tab, setTab] = useState("Overview");
  const [nickname, setNickname] = useState("");
  const posts = state.challenges.filter((challenge) => challenge.user === user.name);
  const activeFrame = profileFrames[state.equipped.Frame] ?? "framePurpleAura";

  useEffect(() => {
    if (!state.authUserId) return;
    fetch(`${API_URL}/users/${state.authUserId}/profile`)
      .then((response) => response.ok ? response.json() : null)
      .then((profile) => {
        if (profile?.nickname || profile?.display_name) {
          setNickname(profile.nickname ?? profile.display_name);
        }
      })
      .catch(() => {
        // Keep the demo fallback if the profile API is temporarily unavailable.
      });
  }, [state.authUserId]);

  return (
    <Screen title="Your profile">
      <View style={styles.hero}>
        <View style={styles.cover}>
          <View style={styles.coverOrbit} />
          <BrandAsset name="mascotCelebrating" style={styles.coverMascot} />
          <View style={styles.coverNote}><Text style={styles.coverNoteText}>GROWING, GLOWING</Text></View>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}><BrandAsset name="mascotCheerful" style={styles.avatarMascot} /></View>
              <BrandAsset name={activeFrame} style={styles.avatarFrame} />
              <View style={styles.levelChip}><Text style={styles.levelText}>LEVEL 5</Text></View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push("/friends")} style={({ pressed }) => [styles.friendsButton, pressed && s.pressed]}>
              <Text style={styles.friendsButtonText}>＋  Add friends</Text>
            </Pressable>
          </View>
          <Text translate={false} style={styles.name}>{nickname || "Loading…"}<Text style={styles.verified}> ✦</Text></Text>
          <Text translate={false} style={styles.handle}>@{myFriendId} · making little promises, keeping big dreams</Text>
          <View style={styles.titleLine}>
            <BrandAsset name="stickerSmallSteps" style={styles.titleArt} />
            <View style={styles.titleInfo}><Text style={styles.titleLabel}>PROFILE CUSTOMIZATION</Text><Text style={styles.titleValue}>COMING SOON</Text></View>
            <View style={styles.badgeCount}><Text style={styles.badgeCountValue}>—</Text><Text style={styles.badgeCountLabel}>COMING SOON</Text></View>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatTile asset="iconPoints" value={user.points.toLocaleString()} label="POINTS" color={c.cream} />
        <StatTile asset="iconConfidence" value={`${user.accuracy}%`} label="ACCURACY" color={c.lavender} />
        <StatTile asset="iconStreak" value={`${user.streak}`} label="DAY STREAK" color={c.peach} />
        <StatTile asset="iconChallenge" value={`${user.completed}`} label="CHALLENGES" color={c.mint} />
      </View>

      <FeedTabs options={["Overview", "My challenges"]} value={tab} onChange={setTab} />
      {tab === "My challenges" ? (
        <View style={styles.posts}>
          {posts.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}
          {!posts.length && (
            <Card>
              <BrandAsset name="stateNoChallenges" style={styles.emptyArt} />
              <Text style={s.muted}>No challenges here yet</Text>
              <Button label="Post a challenge" onPress={() => router.push("/create")} />
            </Card>
          )}
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={() => router.push("/habit-dna")} style={({ pressed }) => [styles.journey, pressed && s.pressed]}>
            <View style={styles.journeyTop}>
              <View><Text style={styles.journeyEyebrow}>YOUR JOURNEY</Text><Text style={styles.journeyTitle}>{user.completed} little wins, so far</Text></View>
              <BrandAsset name="stickerBrighterDays" style={styles.journeySticker} />
            </View>
            <View style={styles.journeyProgress}><View style={styles.journeyFill} /></View>
            <View style={styles.journeyBottom}><Text style={styles.journeyCaption}>You’re building a brighter-you habit.</Text><Text style={styles.journeyLink}>Habit DNA →</Text></View>
          </Pressable>

          <View style={styles.sectionHeading}><SectionHeader title="Your future selves" /><Text style={styles.sectionNote}>COMING INTO FOCUS</Text></View>
          <View style={styles.futureGrid}>
            {futureSelves.map((self) => (
              <View key={self.label} style={[styles.futureCard, { backgroundColor: self.color }]}>
                <BrandAsset name={self.asset} style={styles.futureArt} />
                <Text style={styles.futureLabel}>{self.label}</Text>
              </View>
            ))}
          </View>

          <SectionHeader title="Profile style" />
          <View style={styles.comingSoonCard}>
            <BrandAsset name="iconShop" style={styles.collectionIcon} />
            <View style={s.flex}>
              <Text style={styles.collectionTitle}>Profile customization</Text>
              <Text style={styles.collectionCopy}>Frames, titles, badges and more are coming soon.</Text>
            </View>
            <Text style={styles.comingSoonLabel}>COMING SOON</Text>
          </View>

          <View style={styles.sectionHeading}><SectionHeader title="Recent challenges" /><Text style={styles.sectionNote}>LATEST</Text></View>
          {posts.slice(0, 1).map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}
        </>
      )}
    </Screen>
  );
}

function StatTile({ asset, value, label, color }: { asset: BrandAssetName; value: string; label: string; color: string }) {
  return (
    <View style={[styles.statTile, { backgroundColor: color }]}>
      <BrandAsset name={asset} style={styles.statIcon} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: c.card, borderRadius: 25, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  cover: { height: 122, backgroundColor: c.primary, overflow: "hidden", justifyContent: "flex-end", alignItems: "flex-end", paddingRight: 16, paddingBottom: 13 },
  coverOrbit: { position: "absolute", width: 185, height: 185, borderRadius: 100, right: 38, top: -96, borderWidth: 1, borderColor: "rgba(255,255,255,0.34)" },
  coverMascot: { position: "absolute", width: 116, height: 104, right: 66, top: 4 },
  coverNote: { zIndex: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: c.yellow, transform: [{ rotate: "-4deg" }] },
  coverNoteText: { color: c.text, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  identity: { paddingHorizontal: 16, paddingBottom: 15 },
  avatarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: -44, marginBottom: 6 },
  avatarWrap: { width: 110, height: 110 },
  avatarCircle: { position: "absolute", top: 17, left: 17, width: 76, height: 76, borderRadius: 40, backgroundColor: c.sky, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarMascot: { width: 82, height: 79 },
  avatarFrame: { position: "absolute", width: 110, height: 110, top: 4, left: 0 },
  levelChip: { position: "absolute", top: 4, right: -1, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 11, backgroundColor: c.yellow, transform: [{ rotate: "6deg" }] },
  levelText: { color: c.text, fontSize: 8, fontWeight: "900" },
  friendsButton: { marginBottom: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18, backgroundColor: c.lavender },
  friendsButtonText: { color: c.primaryDark, fontSize: 11, fontWeight: "900" },
  name: { color: c.text, fontSize: 27, lineHeight: 32, fontWeight: "900", letterSpacing: -0.8 },
  verified: { color: c.primary, fontSize: 16 },
  handle: { marginTop: 1, color: c.muted, fontSize: 10, lineHeight: 16 },
  titleLine: { flexDirection: "row", alignItems: "center", marginTop: 9, gap: 9 },
  titleArt: { width: 52, height: 45 },
  titleInfo: { flex: 1, gap: 2 },
  titleLabel: { color: c.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  titleValue: { color: c.text, fontSize: 13, fontWeight: "900" },
  badgeCount: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: c.cream },
  badgeCountValue: { color: c.text, fontSize: 15, fontWeight: "900" },
  badgeCountLabel: { color: c.muted, fontSize: 7, fontWeight: "900" },
  statsRow: { flexDirection: "row", gap: 8 },
  statTile: { flex: 1, minHeight: 78, paddingVertical: 7, paddingHorizontal: 2, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  statIcon: { width: 29, height: 29 },
  statValue: { marginTop: -2, color: c.text, fontSize: 13, fontWeight: "900" },
  statLabel: { color: c.muted, fontSize: 6, fontWeight: "900", letterSpacing: 0.3 },
  journey: { padding: 15, borderRadius: 22, backgroundColor: c.lavenderLight, borderWidth: 1, borderColor: "#E8E1FF", gap: 11 },
  journeyTop: { minHeight: 43, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  journeyEyebrow: { color: c.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  journeyTitle: { marginTop: 3, color: c.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.4 },
  journeySticker: { width: 75, height: 52 },
  journeyProgress: { height: 8, borderRadius: 8, overflow: "hidden", backgroundColor: "#D8DDFB" },
  journeyFill: { width: "72%", height: "100%", borderRadius: 8, backgroundColor: c.primary },
  journeyBottom: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  journeyCaption: { flex: 1, color: c.muted, fontSize: 9, fontWeight: "600" },
  journeyLink: { color: c.primary, fontSize: 9, fontWeight: "900" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionNote: { color: c.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  sectionLink: { color: c.primary, fontSize: 9, fontWeight: "900" },
  futureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  futureCard: { width: "48%", minHeight: 101, borderRadius: 19, alignItems: "center", justifyContent: "center", gap: 2, padding: 7, overflow: "hidden" },
  futureArt: { width: 77, height: 72 },
  futureLabel: { color: c.text, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  styleCard: { paddingHorizontal: 13, paddingVertical: 3, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  styleRow: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 8 },
  styleDivider: { borderTopWidth: 1, borderTopColor: c.border },
  styleIcon: { width: 37, height: 39 },
  styleSlot: { color: c.muted, width: 75, fontSize: 10, fontWeight: "700" },
  styleValue: { flex: 1, color: c.text, textAlign: "right", fontSize: 10, fontWeight: "800" },
  framePreview: { width: 39, height: 39, alignItems: "center", justifyContent: "center" },
  framePreviewImage: { width: 39, height: 39 },
  ownedItems: { gap: 8 },
  ownedRow: { minHeight: 54, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  ownedArt: { width: 42, height: 42 },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  badgeItem: { flex: 1, alignItems: "center" },
  badgeArt: { width: "100%", height: 78 },
  collectionLink: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderRadius: 18, backgroundColor: c.cream },
  collectionIcon: { width: 42, height: 42 },
  collectionTitle: { color: c.text, fontSize: 12, fontWeight: "900" },
  collectionCopy: { marginTop: 2, color: c.muted, fontSize: 9 },
  comingSoonCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderRadius: 18, backgroundColor: c.cream, opacity: 0.85 },
  comingSoonLabel: { color: c.primary, fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  posts: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  emptyArt: { alignSelf: "center", width: 112, height: 82 },
});
