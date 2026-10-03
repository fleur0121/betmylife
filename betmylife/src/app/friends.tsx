/**
 * 友達のID検索、QR読み取り、自分のQR表示、追加済み一覧をまとめた画面。
 * IDとQRは同じユーザー検索・確認フローにつなぎ、自分自身や重複の追加を防ぐ。
 * カメラまたは保存済みのQRスクリーンショットから友達を追加できる。実際の友達関係はモック状態のみ。
 */
import { FriendQR } from "@/components/friend-qr";
import { FriendScanner } from "@/components/friend-scanner";
import { Text } from "@/components/localized-text";
import {
    Avatar,
    Button,
    Card,
    PageHeading,
    Screen,
    SectionHeader,
    Segments,
    s,
} from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useLanguage } from "@/i18n/language";
import { friendDirectory, myFriendId, type Friend } from "@/mock/friends";
import { useAppState } from "@/state/app-state";
import {
    encodeFriendQR,
    normalizeFriendId,
    parseFriendQR,
} from "@/utils/friend-id";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
export default function Friends() {
  const { state, dispatch } = useAppState();
  const { t } = useLanguage();
  const [mode, setMode] = useState("By ID");
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<Friend | null>(null);
  const [message, setMessage] = useState("");
  function search(id: string | null) {
    setCandidate(null);
    setMessage("");
    if (id === null) {
      setMessage("Invalid friend QR code.");
      return;
    }
    if (!id) {
      setMessage("Enter a friend ID.");
      return;
    }
    if (id === myFriendId) {
      setMessage("That’s your own ID.");
      return;
    }
    const user = friendDirectory.find((item) => item.id === id);
    if (!user) {
      setMessage("Friend not found. Try one of the demo IDs.");
      return;
    }
    setCandidate(user);
  }
  const friends = friendDirectory.filter((user) =>
    state.friendIds.includes(user.id),
  );
  const added = candidate ? state.friendIds.includes(candidate.id) : false;
  return (
    <Screen title="Friends" back>
      <PageHeading
        title="Add friends"
        subtitle="Find a friend by their ID, or scan their QR code."
      />
      <Segments
        options={["By ID", "Scan QR", "My QR"]}
        value={mode}
        onChange={(value) => {
          setMode(value);
          setCandidate(null);
          setMessage("");
        }}
      />
      {mode === "By ID" && (
        <Card>
          <Text style={s.sectionTitle}>Friend ID</Text>
          <TextInput
            accessibilityLabel={t("Friend ID")}
            placeholder={t("Example: noah-1250")}
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setCandidate(null);
              setMessage("");
            }}
            onSubmitEditing={() => search(normalizeFriendId(query))}
            returnKeyType="search"
            style={styles.input}
          />
          <Button
            label="Search"
            onPress={() => search(normalizeFriendId(query))}
          />
          <Text style={s.caption}>
            Demo IDs: noah-1250, liam-0580, mia-0420
          </Text>
        </Card>
      )}
      {mode === "Scan QR" && (
        <Card>
          <FriendScanner onScan={(data) => search(parseFriendQR(data))} />
        </Card>
      )}
      {mode === "My QR" && (
        <Card>
          <Text style={s.sectionTitle}>Show this QR to a friend.</Text>
          <FriendQR id={myFriendId} />
          <Text style={s.caption}>Your ID</Text>
          <Text selectable translate={false} style={s.bold}>
            {myFriendId}
          </Text>
          <Text selectable translate={false} style={s.caption}>
            {encodeFriendQR(myFriendId)}
          </Text>
        </Card>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            s.body,
            { color: message === "Friend added!" ? c.green : c.red },
          ]}
        >
          {message}
        </Text>
      )}
      {candidate && (
        <Card>
          <View style={s.row}>
            <Avatar emoji={candidate.avatar} color={candidate.color} />
            <View style={s.flex}>
              <Text translate={false} style={s.bold}>
                {candidate.name}
              </Text>
              <Text translate={false} style={s.caption}>
                @{candidate.id}
              </Text>
            </View>
          </View>
          <Button
            disabled={added}
            label={added ? "Already friends" : "Add friend"}
            onPress={() => {
              dispatch({ type: "add-friend", id: candidate.id });
              setMessage("Friend added!");
            }}
          />
        </Card>
      )}
      <SectionHeader title="Your friends" detail={String(friends.length)} />
      {friends.length ? (
        <Card>
          {friends.map((friend) => (
            <Pressable
              key={friend.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${friend.name}'s profile`}
              onPress={() => router.push(`/user/${friend.id}`)}
              style={({ pressed }) => [s.row, pressed && s.pressed]}
            >
              <Avatar emoji={friend.avatar} color={friend.color} size={40} />
              <View style={s.flex}>
                <Text translate={false} style={s.bold}>
                  {friend.name}
                </Text>
                <Text translate={false} style={s.caption}>
                  @{friend.id}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Text style={s.muted}>
          No friends yet. Find your first friend above.
        </Text>
      )}
      <Text style={s.caption}>Demo only · Friends reset on reload.</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    padding: 14,
    backgroundColor: c.background,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    color: c.text,
    fontSize: 15,
  },
});
