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
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAppState();
  const profile = friendDirectory.find((friend) => friend.id === id);
  const stats = users.find((user) => user.name === profile?.name);
  const isCurrentUser = profile?.name === currentUser.name;
  const posts = state.challenges.filter(
    (challenge) => challenge.user === profile?.name,
  );

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
                label="Add friends"
                onPress={() => router.push("/friends")}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/friends")}
            style={({ pressed }) => [styles.metaLink, pressed && s.pressed]}
          >
            <Text style={s.bold}>Follow their progress</Text>
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
  posts: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
});
