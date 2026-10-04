import { ChallengeCard } from "@/components/challenge-card";
import { Text } from "@/components/localized-text";
import {
    Avatar,
    Button,
    Card,
    Pill,
    Screen,
    StatCard,
    s,
} from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { currentUser, users } from "@/mock/data";
import { friendDirectory } from "@/mock/friends";
import { useAppState } from "@/state/app-state";
import { API_URL } from "@/constants/api";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useAppState();
  const [followingSnapshot, setFollowingSnapshot] = useState<{ userId: string; ids: string[] } | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");
  const profile = friendDirectory.find((friend) => friend.id === id);
  const stats = users.find((user) => user.name === profile?.name);
  const isCurrentUser = profile?.name === currentUser.name;
  const isFollowing = Boolean(state.authUserId && followingSnapshot?.userId === state.authUserId && followingSnapshot.ids.includes(id));
  const posts = state.challenges.filter(
    (challenge) => challenge.user === profile?.name,
  );

  useEffect(() => {
    if (!state.authUserId || !id) {
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/users/${state.authUserId}/following`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load followed users (${response.status})`);
        return response.json() as Promise<{ followed_ids: string[] }>;
      })
      .then((result) => {
        if (!cancelled) setFollowingSnapshot({ userId: state.authUserId!, ids: result.followed_ids });
      })
      .catch((error: unknown) => {
        if (!cancelled) setFollowError(error instanceof Error ? error.message : "Could not load follow status.");
      });
    return () => { cancelled = true; };
  }, [id, state.authUserId]);

  async function toggleFollow() {
    if (!state.authUserId || !id) {
      router.push("/auth");
      return;
    }
    setFollowBusy(true);
    setFollowError("");
    try {
      const response = await fetch(`${API_URL}/users/${state.authUserId}/following/${encodeURIComponent(id)}`, {
        method: isFollowing ? "DELETE" : "PUT",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Could not update follow status.");
      }
      const currentIds = followingSnapshot?.userId === state.authUserId
        ? followingSnapshot.ids
        : state.followingIds;
      const nextIds = isFollowing
        ? currentIds.filter((followedId) => followedId !== id)
        : [...currentIds, id];
      dispatch({ type: "set-following-ids", ids: nextIds });
      setFollowingSnapshot({ userId: state.authUserId, ids: nextIds });
    } catch (error) {
      setFollowError(error instanceof Error ? error.message : "Could not update follow status.");
    } finally {
      setFollowBusy(false);
    }
  }

  if (!profile || !stats) {
    return (
      <Screen title="Profile" back>
        <Card>
          <Text style={s.sectionTitle}>Profile not found</Text>
          <Text style={s.muted}>This account may no longer be available.</Text>
          <Button label="Back to home" onPress={() => router.replace("/")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={profile.name} back>
      <View style={styles.profile}>
        <View style={styles.cover}>
          <Text style={styles.stars}>✧ ✦ ✧</Text>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBorder}>
              <Avatar
                emoji={profile.avatar}
                color={profile.color}
                size={80}
                framed
              />
            </View>
            {!isCurrentUser && (
              <Button
                secondary
                label={followBusy ? "Saving…" : isFollowing ? "Following · Unfollow" : state.authUserId ? "Follow" : "Log in to follow"}
                disabled={followBusy}
                onPress={toggleFollow}
              />
            )}
          </View>
          <Text translate={false} style={styles.name}>
            {profile.name}
          </Text>
          <Text translate={false} style={s.muted}>
            @{profile.id}
          </Text>
          <View style={styles.badges}>
            <Pill tone="green">{stats.streak} day streak</Pill>
            <Pill>{stats.accuracy}% prediction accuracy</Pill>
          </View>
          <Text style={s.body}>Showing up, one challenge at a time.</Text>
          {!!followError && <Text accessibilityLiveRegion="polite" style={styles.followError}>{followError}</Text>}
          <Pressable accessibilityRole="button" onPress={() => router.push("/friends")} style={({ pressed }) => [styles.metaLink, pressed && s.pressed]}>
            <Text style={s.bold}>Find more people</Text>
          </Pressable>
        </View>
      </View>
      <Card>
        <View style={s.row}>
          <StatCard value={`${isCurrentUser ? state.pointsBalance : stats.points} PT`} label="Points" />
          <StatCard value={`${stats.accuracy}%`} label="Accuracy" />
          <StatCard value={`${stats.streak} days`} label="Streak" />
        </View>
      </Card>
      <Text style={s.sectionTitle}>{profile.name}&apos;s challenges</Text>
      <View style={styles.posts}>
        {posts.length ? (
          posts.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))
        ) : (
          <Card>
            <Text style={s.muted}>No challenges here yet</Text>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    backgroundColor: c.card,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  cover: {
    height: 96,
    backgroundColor: c.lavender,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 20,
  },
  stars: { fontSize: 38, color: "#B29BDF", letterSpacing: 8 },
  identity: { gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  avatarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: -30,
    marginBottom: 4,
  },
  avatarBorder: { padding: 4, backgroundColor: c.card, borderRadius: 50 },
  name: { fontSize: 24, fontWeight: "800", color: c.text },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 4 },
  metaLink: { minHeight: 44, justifyContent: "center" },
  followError: { color: c.red, fontSize: 11 },
  posts: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
});
