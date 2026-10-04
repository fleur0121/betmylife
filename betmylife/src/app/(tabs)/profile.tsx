/**
 * Account profile and progress view backed by the signed-in user's database data.
 * Reward art is a static catalog; ownership, equipped items, and progress come from saved account state.
 */
import { BrandAsset, type BrandAssetName } from "@/components/brand-asset";
import { BADGE_BY_ID, BADGES } from "@/achievements/badges";
import { ChallengeCard } from "@/components/challenge-card";
import { FeedTabs } from "@/components/feed-tabs";
import { Text } from "@/components/localized-text";
import { Avatar, Button, Card, Screen, SectionHeader, s } from "@/components/ui-kit";
import { API_URL } from "@/constants/api";
import { palette as c } from "@/constants/design";
import { rewards, type CosmeticSlot } from "@/constants/rewards";
import { AVATAR_FRAME_ART_SCALE } from "@/components/profile/avatar-frame";
import { getChallenges } from "@/services/challenge-service";
import { useAppState } from "@/state/app-state";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Image } from "expo-image";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

const futureSelves: { asset: BrandAssetName; label: string; color: string }[] =
  [
    { asset: "mascotReading", label: "FOCUSED YOU", color: c.sky },
    { asset: "mascotActive", label: "ENERGIZED YOU", color: c.peach },
    { asset: "mascotCurious", label: "CURIOUS YOU", color: c.lavender },
    { asset: "mascotCheering", label: "CONFIDENT YOU", color: c.mint },
  ];

const profileFrameArtSize = 76 * AVATAR_FRAME_ART_SCALE;

type UserProfile = {
  id: string;
  username: string;
  nickname: string | null;
  display_name: string;
  avatar: string;
  bio: string;
  points: number;
  profile_frame: string;
  badge: string;
  background: string;
  custom_title: string;
};

type ProfileChallenge = {
  id: string;
  category: string;
  confidence: number;
  result?: string;
  resolvedAt?: string;
  title: string;
  deadline: string;
  probability: number;
  ownerId?: string;
};

function calculatePredictionAccuracy(predictions: { status: string }[]) {
  const settled = predictions.filter((prediction) => prediction.status === "won" || prediction.status === "lost");
  if (!settled.length) return null;
  return Math.round((settled.filter((prediction) => prediction.status === "won").length / settled.length) * 100);
}

function calculateSuccessStreak(challenges: ProfileChallenge[]) {
  const days = [...new Set(challenges
    .filter((challenge) => challenge.result === "success" && challenge.resolvedAt)
    .map((challenge) => new Date(challenge.resolvedAt!).toLocaleDateString("en-CA")))].sort().reverse();
  if (!days.length) return 0;
  let streak = 1;
  for (let index = 1; index < days.length; index += 1) {
    const previous = new Date(`${days[index - 1]}T12:00:00`);
    const current = new Date(`${days[index]}T12:00:00`);
    if (Math.round((previous.getTime() - current.getTime()) / 86_400_000) !== 1) break;
    streak += 1;
  }
  return streak;
}

export default function Profile() {
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState("Overview");
  const [profileResult, setProfileResult] = useState<{ userId: string; profile: UserProfile } | null>(null);
  const [profileFailure, setProfileFailure] = useState<{ userId: string; message: string } | null>(null);
  const [challengeFailure, setChallengeFailure] = useState<{ userId: string; message: string } | null>(null);
  const profile = profileResult?.userId === state.authUserId ? profileResult.profile : null;
  const profileError = profileFailure?.userId === state.authUserId ? profileFailure.message : "";
  const challengeError = challengeFailure?.userId === state.authUserId ? challengeFailure.message : "";
  const profileLoading = Boolean(state.authUserId && !profile && !profileError);
  const slots: CosmeticSlot[] = ["Frame", "Title", "Badge", "Background"];
  const owned = rewards.filter((item) => state.owned.includes(item.id));
  const earnedBadgeCount = Object.keys(state.badgeUnlocks).length;
  const recentBadges = Object.entries(state.badgeUnlocks)
    .sort((left, right) => right[1]!.unlockedAt.localeCompare(left[1]!.unlockedAt))
    .slice(0, 5)
    .map(([id, unlock]) => ({ badge: BADGE_BY_ID[id], unlockedAt: unlock!.unlockedAt }))
    .filter((item) => item.badge);
  const profileName = profile?.nickname || profile?.display_name || profile?.username || "";
  const posts = state.challenges
    .filter((challenge) => challenge.ownerId === state.authUserId)
    .map((challenge) => ({ ...challenge, user: profileName, avatar: profile?.avatar || "☁️" }));
  const accuracy = calculatePredictionAccuracy(
    Object.values(state.stakedPredictions).filter((prediction) => prediction.userId === state.authUserId),
  );
  const streak = calculateSuccessStreak(posts);
  const completedChallenges = posts.filter((challenge) => challenge.result === "success" || challenge.result === "failed").length;
  const equippedLabels: Record<CosmeticSlot, string> = {
    Frame: state.equipped.Frame || profile?.profile_frame || "",
    Badge: state.equipped.Badge || profile?.badge || "",
    Background: state.equipped.Background || profile?.background || "",
    Title: state.equipped.Title || profile?.custom_title || "",
  };
  const activeFrame = rewards.find(
    (item) => item.slot === "Frame" && item.name === equippedLabels.Frame,
  )?.asset;
  const activeTitle = rewards.find(
    (item) => item.slot === "Title" && item.name === equippedLabels.Title,
  );

  useFocusEffect(useCallback(() => {
    if (!state.authUserId) return;
    const userId = state.authUserId;
    let active = true;
    const profileRequest = fetch(`${API_URL}/users/${userId}/profile`).then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { detail?: string } | null;
          throw new Error(body?.detail ?? `Profile could not be loaded (${response.status}).`);
        }
        return response.json() as Promise<UserProfile>;
      });
    void Promise.allSettled([profileRequest, getChallenges(userId)]).then(([profileResult, challengesResult]) => {
      if (!active) return;
      if (profileResult.status === "fulfilled") {
        setProfileResult({ userId, profile: profileResult.value });
        setProfileFailure(null);
      } else {
        setProfileFailure({ userId, message: profileResult.reason instanceof Error ? profileResult.reason.message : "Profile could not be loaded." });
      }
      if (challengesResult.status === "fulfilled") {
        setChallengeFailure(null);
        dispatch({
          type: "replace-challenges",
          challenges: challengesResult.value.map((item) => ({
          id: item.id,
          ownerId: item.user_id,
          user: "You",
          avatar: "☁️",
          color: c.lavender,
          title: item.title,
          category: item.category,
          difficulty: item.difficulty,
          confidence: item.confidence,
          deadline: item.deadline_label,
          deadlineAt: item.deadline_at,
          probability: item.probability,
          yesOdds: item.yes_odds.toFixed(2),
          noOdds: item.no_odds.toFixed(2),
          friends: 0,
          visibility: item.visibility,
          proofPlan: item.proof_plan ?? undefined,
          })),
        });
      } else {
        setChallengeFailure({ userId, message: challengesResult.reason instanceof Error ? challengesResult.reason.message : "Your challenges could not be loaded." });
      }
    });
    return () => { active = false; };
  }, [dispatch, state.authUserId]));

  if (!state.authUserId) {
    return (
      <Screen title="Your profile">
        <Card>
          <Text style={s.sectionTitle}>Log in to view your profile</Text>
          <Button label="Log in" onPress={() => router.push("/auth")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Your profile">
      <View style={styles.hero}>
        <View style={styles.cover}>
          <View style={styles.coverOrbit} />
          <BrandAsset name="mascotCelebrating" style={styles.coverMascot} />
          <View style={styles.coverNote}>
            <Text style={styles.coverNoteText}>GROWING, GLOWING</Text>
          </View>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                <Avatar emoji={profile?.avatar || "☁️"} color={c.sky} size={76} />
              </View>
              {activeFrame && <BrandAsset name={activeFrame} style={styles.avatarFrame} />}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/friends")}
              style={({ pressed }) => [
                styles.friendsButton,
                pressed && s.pressed,
              ]}
            >
              <Text style={styles.friendsButtonText}>＋ Add friends</Text>
            </Pressable>
          </View>
          <Text translate={false} style={styles.name}>
            {profileLoading ? "Loading profile…" : profile?.nickname || profile?.display_name || profile?.username || "Profile"}
          </Text>
          <Text translate={false} style={styles.handle}>
            @{profile?.username ?? ""}{profile?.bio ? ` · ${profile.bio}` : ""}
          </Text>
          <View style={styles.titleLine}>
            <BrandAsset name={activeTitle?.asset ?? "iconTrophy"} style={styles.titleArt} />
            <View style={styles.titleInfo}>
              <Text style={styles.titleLabel}>EQUIPPED TITLE</Text>
              <Text style={styles.titleValue}>{equippedLabels.Title || (profileLoading ? "Loading…" : "Not equipped")}</Text>
            </View>
            <View style={styles.badgeCount}>
              <Text style={styles.badgeCountValue}>{earnedBadgeCount}/{BADGES.length}</Text>
              <Text style={styles.badgeCountLabel}>BADGES</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatTile
          asset="iconPoints"
          value={(profile?.points ?? 0).toLocaleString()}
          label="POINTS"
          color={c.cream}
        />
        <StatTile
          asset="iconConfidence"
          value={accuracy === null ? "—" : `${accuracy}%`}
          label="ACCURACY"
          color={c.lavender}
        />
        <StatTile
          asset="iconStreak"
          value={`${streak}`}
          label="DAY STREAK"
          color={c.peach}
        />
        <StatTile
          asset="iconChallenge"
          value={`${completedChallenges}`}
          label="CHALLENGES"
          color={c.mint}
        />
      </View>

      {!!profileError && <Text accessibilityRole="alert" style={{ color: c.red }}>{profileError}</Text>}
      <FeedTabs
        options={["Overview", "My challenges"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "My challenges" ? (
        <View style={styles.posts}>
          {posts.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
          {!posts.length && (
            <Card>
              <BrandAsset name="stateNoChallenges" style={styles.emptyArt} />
              <Text style={s.muted}>{challengeError || "No challenges here yet"}</Text>
              <Button
                label="Post a challenge"
                onPress={() => router.push("/create")}
              />
            </Card>
          )}
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/habit-dna")}
            style={({ pressed }) => [styles.journey, pressed && s.pressed]}
          >
            <View style={styles.journeyTop}>
              <View>
                <Text style={styles.journeyEyebrow}>YOUR JOURNEY</Text>
                <Text style={styles.journeyTitle}>
                  {completedChallenges} little wins, so far
                </Text>
              </View>
              <BrandAsset
                name="stickerBrighterDays"
                style={styles.journeySticker}
              />
            </View>
            <View style={styles.journeyProgress}>
              <View style={styles.journeyFill} />
            </View>
            <View style={styles.journeyBottom}>
              <Text style={styles.journeyCaption}>
                You’re building a brighter-you habit.
              </Text>
              <Text style={styles.journeyLink}>Habit DNA →</Text>
            </View>
          </Pressable>

          <View style={styles.sectionHeading}>
            <SectionHeader title="Your future selves" />
            <Text style={styles.sectionNote}>COMING INTO FOCUS</Text>
          </View>
          <View style={styles.futureGrid}>
            {futureSelves.map((self) => (
              <View
                key={self.label}
                style={[styles.futureCard, { backgroundColor: self.color }]}
              >
                <BrandAsset name={self.asset} style={styles.futureArt} />
                <Text style={styles.futureLabel}>{self.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeading}>
            <SectionHeader title="Profile style" />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/shop")}
            >
              <Text style={styles.sectionLink}>EDIT ↗</Text>
            </Pressable>
          </View>
          <View style={styles.styleCard}>
            {slots.map((slot, index) => (
              <View
                key={slot}
                style={[styles.styleRow, index > 0 && styles.styleDivider]}
              >
                {slot === "Frame" ? (
                  <View style={styles.framePreview}>
                    <SymbolView
                      name={{
                        ios: "person.fill",
                        android: "person",
                        web: "person",
                      }}
                      size={12}
                      tintColor={c.primaryDark}
                    />
                    {activeFrame && <BrandAsset name={activeFrame} style={styles.framePreviewImage} />}
                  </View>
                ) : (
                  <BrandAsset
                    name={
                      slot === "Title"
                        ? "stickerFocused"
                        : slot === "Badge"
                          ? "badgeAiSlayer"
                          : "stickerSmallSteps"
                    }
                    style={styles.styleIcon}
                  />
                )}
                <Text style={styles.styleSlot}>{slot}</Text>
                <Text numberOfLines={1} style={styles.styleValue}>
                  {equippedLabels[slot] || (profileLoading ? "Loading…" : "Not equipped")}
                </Text>
              </View>
            ))}
          </View>
          {owned.length > 0 && (
            <View style={styles.ownedItems}>
              {owned.map((item) => (
                <View key={item.id} style={styles.ownedRow}>
                  <BrandAsset name={item.asset} style={styles.ownedArt} />
                  <Text style={[s.body, s.flex]}>{item.name}</Text>
                  <Button
                    secondary
                    label={
                      state.equipped[item.slot] === item.name
                        ? "Equipped"
                        : "Equip"
                    }
                    disabled={state.equipped[item.slot] === item.name}
                    onPress={() => dispatch({ type: "equip", id: item.id })}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={styles.sectionHeading}>
            <SectionHeader title="My badges" />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/badges")}
            >
              <Text style={styles.sectionLink}>VIEW ALL →</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.badgeRow}
          >
            {recentBadges.length ? recentBadges.map(({ badge }) => (
              <View key={badge.id} style={styles.badgeItem}>
                <Image
                  source={badge.miniImage ?? badge.image}
                  contentFit="contain"
                  style={styles.badgeArt}
                  accessibilityLabel={badge.name}
                />
                <Text numberOfLines={2} style={styles.badgeLabel}>{badge.name}</Text>
              </View>
            )) : (
              <Text style={s.muted}>Earn your first badge to see it here.</Text>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/closet")}
            style={({ pressed }) => [
              styles.collectionLink,
              pressed && s.pressed,
            ]}
          >
            <BrandAsset name="iconShop" style={styles.collectionIcon} />
            <View style={s.flex}>
              <Text style={styles.collectionTitle}>
                Explore the cloud closet
              </Text>
              <Text style={styles.collectionCopy}>
                Mascots, frames, badges & stickers
              </Text>
            </View>
            <Text style={styles.journeyLink}>OPEN →</Text>
          </Pressable>

          <View style={styles.sectionHeading}>
            <SectionHeader title="Recent challenges" />
            <Text style={styles.sectionNote}>LATEST</Text>
          </View>
          <View style={styles.recentList}>
            {posts.slice(0, 3).map((challenge) => (
              <RecentChallengeRow
                key={challenge.id}
                challenge={challenge}
                onPress={() => setTab("My challenges")}
              />
            ))}
            {!posts.length && (
              <Text style={s.muted}>
                Your recent challenges will show up here.
              </Text>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

function RecentChallengeRow({
  challenge,
  onPress,
}: {
  challenge: ProfileChallenge;
  onPress: () => void;
}) {
  const categoryAsset: BrandAssetName =
    challenge.category === "Fitness"
      ? "iconFitness"
      : challenge.category === "Study"
        ? "iconStudy"
        : "iconLifestyle";
  const categoryColor =
    challenge.category === "Fitness"
      ? c.mint
      : challenge.category === "Study"
        ? c.sky
        : c.lavender;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.recentCard, pressed && s.pressed]}
    >
      <View style={[styles.recentIconWrap, { backgroundColor: categoryColor }]}>
        <BrandAsset name={categoryAsset} style={styles.recentIcon} />
      </View>
      <View style={styles.recentBody}>
        <Text style={styles.recentCategory}>
          {challenge.category.toUpperCase()} · {challenge.confidence}% CONFIDENT
        </Text>
        <Text numberOfLines={2} style={styles.recentTitle}>
          {challenge.title}
        </Text>
        <View style={styles.recentMeta}>
          <Text numberOfLines={1} style={styles.recentDeadline}>
            ◷ {challenge.deadline}
          </Text>
          <View style={styles.recentAi}>
            <Text style={styles.recentAiText}>AI {challenge.probability}%</Text>
          </View>
        </View>
      </View>
      <Text style={styles.recentArrow}>›</Text>
    </Pressable>
  );
}

function StatTile({
  asset,
  value,
  label,
  color,
}: {
  asset: BrandAssetName;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: color }]}>
      <BrandAsset name={asset} style={styles.statIcon} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: c.card,
    borderRadius: 25,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  cover: {
    height: 122,
    backgroundColor: c.primary,
    overflow: "hidden",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingRight: 16,
    paddingBottom: 13,
  },
  coverOrbit: {
    position: "absolute",
    width: 185,
    height: 185,
    borderRadius: 100,
    right: 38,
    top: -96,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  coverMascot: {
    position: "absolute",
    width: 116,
    height: 104,
    right: 66,
    top: 4,
  },
  coverNote: {
    zIndex: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: c.yellow,
    transform: [{ rotate: "-4deg" }],
  },
  coverNoteText: {
    color: c.text,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  identity: { paddingHorizontal: 16, paddingBottom: 15 },
  avatarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: -44,
    marginBottom: 6,
  },
  avatarWrap: { width: 110, height: 110, overflow: "visible" },
  avatarCircle: {
    position: "absolute",
    top: 17,
    left: 17,
    width: 76,
    height: 76,
    borderRadius: 40,
    backgroundColor: c.sky,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFrame: {
    position: "absolute",
    width: profileFrameArtSize,
    height: profileFrameArtSize,
    top: (110 - profileFrameArtSize) / 2,
    left: (110 - profileFrameArtSize) / 2,
  },
  friendsButton: {
    marginBottom: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: c.lavender,
  },
  friendsButtonText: { color: c.primaryDark, fontSize: 11, fontWeight: "900" },
  name: {
    color: c.text,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  handle: { marginTop: 1, color: c.muted, fontSize: 10, lineHeight: 16 },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
    gap: 9,
  },
  titleArt: { width: 52, height: 45 },
  titleInfo: { flex: 1, gap: 2 },
  titleLabel: {
    color: c.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  titleValue: { color: c.text, fontSize: 13, fontWeight: "900" },
  badgeCount: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: c.cream,
  },
  badgeCountValue: { color: c.text, fontSize: 15, fontWeight: "900" },
  badgeCountLabel: { color: c.muted, fontSize: 7, fontWeight: "900" },
  statsRow: { flexDirection: "row", gap: 8 },
  statTile: {
    flex: 1,
    minHeight: 78,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statIcon: { width: 29, height: 29 },
  statValue: { marginTop: -2, color: c.text, fontSize: 13, fontWeight: "900" },
  statLabel: {
    color: c.muted,
    fontSize: 6,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  journey: {
    padding: 15,
    borderRadius: 22,
    backgroundColor: c.lavenderLight,
    borderWidth: 1,
    borderColor: "#E8E1FF",
    gap: 11,
  },
  journeyTop: {
    minHeight: 43,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  journeyEyebrow: {
    color: c.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  journeyTitle: {
    marginTop: 3,
    color: c.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  journeySticker: { width: 75, height: 52 },
  journeyProgress: {
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#D8DDFB",
  },
  journeyFill: {
    width: "72%",
    height: "100%",
    borderRadius: 8,
    backgroundColor: c.primary,
  },
  journeyBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  journeyCaption: { flex: 1, color: c.muted, fontSize: 9, fontWeight: "600" },
  journeyLink: { color: c.primary, fontSize: 9, fontWeight: "900" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionNote: {
    color: c.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionLink: { color: c.primary, fontSize: 9, fontWeight: "900" },
  futureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  futureCard: {
    width: "48%",
    minHeight: 101,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 7,
    overflow: "hidden",
  },
  futureArt: { width: 77, height: 72 },
  futureLabel: {
    color: c.text,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  styleCard: {
    paddingHorizontal: 13,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  styleRow: {
    minHeight: 51,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  styleDivider: { borderTopWidth: 1, borderTopColor: c.border },
  styleIcon: { width: 37, height: 39 },
  styleSlot: { color: c.muted, width: 75, fontSize: 10, fontWeight: "700" },
  styleValue: {
    flex: 1,
    color: c.text,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "800",
  },
  framePreview: {
    position: "relative",
    width: 39,
    height: 39,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  framePreviewImage: {
    position: "absolute",
    width: 78,
    height: 78,
    top: -19.5,
    left: -19.5,
  },
  ownedItems: { gap: 8 },
  ownedRow: {
    minHeight: 54,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  ownedArt: { width: 42, height: 42 },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  badgeItem: { width: 72, alignItems: "center" },
  badgeArt: { width: 68, height: 68 },
  badgeLabel: { color: c.muted, fontSize: 7, fontWeight: "900", textAlign: "center" },
  collectionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 18,
    backgroundColor: c.cream,
  },
  collectionIcon: { width: 42, height: 42 },
  collectionTitle: { color: c.text, fontSize: 12, fontWeight: "900" },
  collectionCopy: { marginTop: 2, color: c.muted, fontSize: 9 },
  recentList: { gap: 9 },
  recentCard: {
    minHeight: 91,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 18,
    backgroundColor: c.card,
  },
  recentIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  recentIcon: { width: 42, height: 42 },
  recentBody: { flex: 1, minWidth: 0, gap: 3 },
  recentCategory: {
    color: c.primaryDark,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  recentTitle: {
    color: c.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  recentMeta: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  recentDeadline: { flex: 1, color: c.muted, fontSize: 8, fontWeight: "700" },
  recentAi: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: c.lavenderLight,
  },
  recentAiText: { color: c.primaryDark, fontSize: 8, fontWeight: "900" },
  recentArrow: { color: c.primary, fontSize: 25, fontWeight: "700" },
  posts: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  emptyArt: { alignSelf: "center", width: 112, height: 82 },
});
