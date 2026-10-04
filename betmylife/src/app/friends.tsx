/** Friend search, QR sharing, friend requests, and the signed-in user's real friend list. */
import { FriendQR } from "@/components/friend-qr";
import { FriendScanner } from "@/components/friend-scanner";
import { Text } from "@/components/localized-text";
import { Avatar, Button, Card, PageHeading, Screen, SectionHeader, Segments, s } from "@/components/ui-kit";
import { BrandAsset } from "@/components/brand-asset";
import { palette as c } from "@/constants/design";
import { API_URL } from "@/constants/api";
import { useLanguage } from "@/i18n/language";
import { useAppState } from "@/state/app-state";
import { encodeFriendQR, normalizeFriendId, parseFriendQR } from "@/utils/friend-id";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

type UserSummary = {
  id: string;
  username: string;
  nickname?: string | null;
  display_name: string;
  avatar: string;
};

function displayName(user: UserSummary) {
  return user.nickname?.trim() || user.display_name || user.username;
}

function asUserSummary(value: Partial<UserSummary> & { id: string; username?: string }): UserSummary {
  return {
    id: value.id,
    username: value.username || value.id,
    nickname: value.nickname || null,
    display_name: value.display_name || value.username || value.id,
    avatar: value.avatar || "🐼",
  };
}

export default function Friends() {
  const { state, dispatch } = useAppState();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<UserSummary | null>(null);
  const [mode, setMode] = useState("By ID");
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<UserSummary | null>(null);
  const [friends, setFriends] = useState<UserSummary[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestSent, setRequestSent] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    if (!state.authUserId) return;
    let cancelled = false;
    const userId = state.authUserId;
    async function loadFriendData() {
      try {
        const [profileResponse, friendsResponse, sentResponse] = await Promise.all([
          fetch(`${API_URL}/users/${userId}/profile`),
          fetch(`${API_URL}/users/${userId}/following/details`),
          fetch(`${API_URL}/users/${userId}/friend-requests/sent`),
        ]);
        const [profileBody, friendsBody, sentBody] = await Promise.all([
          profileResponse.json(), friendsResponse.json(), sentResponse.json(),
        ]);
        if (!profileResponse.ok || !friendsResponse.ok || !sentResponse.ok) {
          throw new Error("Could not load your friend data.");
        }
        if (cancelled) return;
        setProfile(asUserSummary(profileBody));
        const followedUsers = Array.isArray(friendsBody) ? friendsBody as UserSummary[] : [];
        setFriends(followedUsers);
        dispatch({ type: "set-following-ids", ids: followedUsers.map((friend) => friend.id) });
        setRequestSent(Array.isArray(sentBody)
          ? sentBody.map((request: { recipient_id: string }) => request.recipient_id)
          : []);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load your friends.");
        }
      }
    }
    void loadFriendData();
    return () => { cancelled = true; };
  }, [dispatch, state.authUserId]));

  async function search(id: string | null) {
    setCandidate(null);
    setMessage("");
    const normalized = id ? normalizeFriendId(id) : "";
    if (id === null) { setMessage("Invalid friend QR code."); return; }
    if (!normalized) { setMessage("Enter a username, nickname, or friend ID."); return; }
    if (!state.authUserId) { setMessage("Please sign in first."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(normalized)}&viewer_id=${encodeURIComponent(state.authUserId)}`);
      if (!response.ok) throw new Error("search failed");
      const users = (await response.json()) as UserSummary[];
      const exact = users.find((user) => user.id.toLowerCase() === normalized || user.username.toLowerCase() === normalized);
      const result = exact || (users.length === 1 ? users[0] : null);
      if (!result) {
        setMessage(users.length ? "More than one user matched. Search with an exact username or ID." : "User not found.");
        return;
      }
      setCandidate(result);
    } catch {
      setMessage("Could not search users. Check that the API is running.");
    } finally { setBusy(false); }
  }

  async function sendRequest() {
    if (!state.authUserId || !candidate) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/users/${state.authUserId}/friend-requests/${encodeURIComponent(candidate.id)}`, { method: "POST" });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        if (response.status === 409 && /already sent/i.test(detail?.detail ?? "")) {
          setRequestSent((current) => [...new Set([...current, candidate.id])]);
          setMessage("Friend request already sent.");
          return;
        }
        throw new Error(detail?.detail || "Could not send friend request.");
      }
      setRequestSent((current) => [...new Set([...current, candidate.id])]);
      setMessage("Friend request sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send friend request.");
    } finally { setBusy(false); }
  }

  const alreadyFriends = candidate ? friends.some((friend) => friend.id === candidate.id) : false;
  const pending = candidate ? requestSent.includes(candidate.id) : false;
  const myId = state.authUserId || "";

  return (
    <Screen title="Friends" back>
      <PageHeading title="Add friends" subtitle="Find a friend by username or ID, or scan their QR code." />
      <Segments options={["By ID", "Scan QR", "My QR"]} value={mode} onChange={(value) => { setMode(value); setCandidate(null); setMessage(""); }} />
      {mode === "By ID" && (
        <Card>
          <Text style={s.sectionTitle}>Find a user</Text>
          <TextInput
            accessibilityLabel={t("Friend ID")}
            placeholder={t("Username, nickname, or ID")}
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={100}
            value={query}
            onChangeText={(value) => { setQuery(value); setCandidate(null); setMessage(""); }}
            onSubmitEditing={() => void search(query)}
            returnKeyType="search"
            style={styles.input}
          />
          <Button label={busy ? "Searching…" : "Search"} disabled={busy} onPress={() => void search(query)} />
          <Text style={s.caption}>Search uses registered users in the database.</Text>
        </Card>
      )}
      {mode === "Scan QR" && <Card><FriendScanner onScan={(data) => void search(parseFriendQR(data))} /></Card>}
      {mode === "My QR" && (
        <Card>
          <Text style={s.sectionTitle}>Show this QR to a friend.</Text>
          {myId ? <FriendQR id={myId} /> : <Text style={s.muted}>Sign in to show your QR.</Text>}
          <Text style={s.caption}>Your username</Text>
          <Text selectable translate={false} style={s.bold}>{profile?.username || "—"}</Text>
          <Text style={s.caption}>Account ID</Text>
          <Text selectable translate={false} style={s.bold}>{myId || "—"}</Text>
          {myId ? <Text selectable translate={false} style={s.caption}>{encodeFriendQR(myId)}</Text> : null}
        </Card>
      )}
      {!!message && <Text accessibilityLiveRegion="polite" style={[s.body, { color: message.includes("sent") ? c.green : c.red }]}>{message}</Text>}
      {candidate && (
        <Card>
          <View style={s.row}>
            <Avatar emoji={candidate.avatar || "🐼"} color={c.lavenderLight} />
            <View style={s.flex}>
              <Text translate={false} style={s.bold}>{displayName(candidate)}</Text>
              <Text translate={false} style={s.caption}>@{candidate.username}</Text>
            </View>
          </View>
          <Button disabled={busy || alreadyFriends || pending} label={alreadyFriends ? "Already friends" : pending ? "Request sent" : "Add friend"} onPress={() => void sendRequest()} />
        </Card>
      )}
      <SectionHeader title="Your friends" detail={String(friends.length)} />
      {friends.length ? (
        <Card>
          {friends.map((friend) => (
            <Pressable key={friend.id} accessibilityRole="button" accessibilityLabel={`Open ${displayName(friend)}'s profile`} onPress={() => router.push(`/user/${friend.id}`)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
              <Avatar emoji={friend.avatar || "🐼"} color={c.lavenderLight} size={40} />
              <View style={s.flex}>
                <Text translate={false} style={s.bold}>{displayName(friend)}</Text>
                <Text translate={false} style={s.caption}>@{friend.username}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Card style={styles.emptyFriends}>
          <BrandAsset name="stateNoFriends" style={styles.emptyFriendsArt} label="No friends yet" />
          <Text style={s.sectionTitle}>Your circle is just getting started</Text>
          <Text style={s.muted}>Find a registered user by username or share your QR code.</Text>
        </Card>
      )}
      <Text style={s.caption}>Your friend list is loaded from your account.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyFriends: { alignItems: "center", backgroundColor: c.lavenderLight },
  emptyFriendsArt: { width: 175, height: 128 },
  input: { minHeight: 48, padding: 14, backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 12, color: c.text, fontSize: 15 },
});
