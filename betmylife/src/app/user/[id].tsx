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
import type { Challenge } from "@/mock/data";
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
  const [requestSent, setRequestSent] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [profile, setProfile] = useState<{
    id: string; username: string; nickname?: string | null; display_name: string;
    avatar: string; bio: string; points: number;
  } | null>(null);
  const [posts, setPosts] = useState<Challenge[]>([]);
  const isCurrentUser = Boolean(state.authUserId && state.authUserId === id);
  const profileName = profile?.nickname?.trim() || profile?.display_name || profile?.username || "Profile";
  const isFollowing = Boolean(
    state.authUserId &&
      (followingSnapshot?.userId === state.authUserId
        ? followingSnapshot.ids.includes(id)
        : state.followingIds.includes(id)),
  );

  useEffect(() => {
    if (!state.authUserId || !id) {
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/users/${id}/profile`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Profile not found");
        return response.json();
      })
      .then((profileResult) => {
        if (!cancelled) {
          setProfile(profileResult);
          setProfileLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileLoading(false);
          setFollowError(error instanceof Error ? error.message : "Could not load profile.");
        }
      });

    fetch(`${API_URL}/users/${id}/challenges?viewer_id=${encodeURIComponent(state.authUserId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load challenges");
        return response.json();
      })
      .then((challengeResult: any[]) => {
        if (cancelled) return;
        setPosts(challengeResult.map((item: any) => ({
          id: item.id, ownerId: item.user_id, ownerUsername: item.user_handle,
          user: item.user_name, avatar: item.avatar ?? "🌱", color: c.lavender,
          title: item.title, category: item.category, difficulty: item.difficulty,
          confidence: item.confidence, deadline: item.deadline_label, deadlineAt: item.deadline_at,
          probability: item.probability, yesOdds: item.yes_odds.toFixed(2), noOdds: item.no_odds.toFixed(2),
          friends: 0, visibility: item.visibility, proofPlan: item.proof_plan ?? undefined,
        })));
      })
      .catch((error: unknown) => {
        if (!cancelled) setFollowError(error instanceof Error ? error.message : "Could not load challenges.");
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false);
      });
    fetch(`${API_URL}/users/${state.authUserId}/friend-requests/sent`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load friend request status.");
        return response.json() as Promise<{ recipient_id: string }[]>;
      })
      .then((requests) => {
        if (!cancelled) setRequestSent(requests.some((request) => request.recipient_id === id));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, state.authUserId, state.followingIds]);

  async function toggleFollow() {
    if (!state.authUserId || !id) {
      router.push("/auth");
      return;
    }
    setFollowBusy(true);
    setFollowError("");
    try {
      const response = await fetch(
        isFollowing
          ? `${API_URL}/users/${state.authUserId}/following/${encodeURIComponent(id)}`
          : `${API_URL}/users/${state.authUserId}/friend-requests/${encodeURIComponent(id)}`,
        {
        method: isFollowing ? "DELETE" : "POST",
        headers: isFollowing ? undefined : { "Content-Type": "application/json" },
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Could not update follow status.");
      }
      if (isFollowing) {
        const currentIds = followingSnapshot?.userId === state.authUserId ? followingSnapshot.ids : state.followingIds;
        const nextIds = currentIds.filter((followedId) => followedId !== id);
        dispatch({ type: "set-following-ids", ids: nextIds });
        setFollowingSnapshot({ userId: state.authUserId, ids: nextIds });
      } else {
        setRequestSent(true);
      }
    } catch (error) {
      setFollowError(error instanceof Error ? error.message : "Could not update follow status.");
    } finally {
      setFollowBusy(false);
    }
  }

  if (profileLoading && !profile) {
    return (
      <Screen title="Profile" back>
        <Card>
          <Text style={s.sectionTitle}>Loading profile…</Text>
          <Text style={s.muted}>Loading profile information.</Text>
        </Card>
      </Screen>
    );
  }

  if (!profile) {
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
    <Screen title={profileName} back>
      <View style={styles.profile}>
        <View style={styles.cover}>
          <Text style={styles.stars}>✧ ✦ ✧</Text>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarBorder}>
              <Avatar
                emoji={profile.avatar}
                color={c.lavender}
                size={80}
                framed
              />
            </View>
            {!isCurrentUser && (
              <Button
                secondary
                label={followBusy ? "Saving…" : isFollowing ? "Following · Unfollow" : requestSent ? "Request sent" : state.authUserId ? "Add friend" : "Log in to follow"}
                disabled={followBusy}
                onPress={toggleFollow}
              />
            )}
          </View>
            <Text translate={false} style={styles.name}>
            {profileName}
          </Text>
          <Text translate={false} style={s.muted}>
            @{profile.username}
          </Text>
          <View style={styles.badges}>
            <Pill tone="green">Public profile</Pill>
            <Pill>{posts.length} challenges</Pill>
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
          <StatCard value={`${profile.points} PT`} label="Points" />
          <StatCard value={`${posts.length}`} label="Challenges" />
          <StatCard value={isCurrentUser ? "You" : isFollowing ? "Friend" : "Public"} label="Visibility" />
        </View>
      </Card>
      <Text style={s.sectionTitle}>{profileName}&apos;s challenges</Text>
      <View style={styles.posts}>
        {postsLoading ? (
          <Card><Text style={s.muted}>Loading challenges…</Text></Card>
        ) : posts.length ? (
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
