/**
 * 投稿をすぐ読めるホームタイムライン。ヘッダーとフィードタブはスクロール中も固定する。
 * すべて・友達・自分の予想とカテゴリを組み合わせて絞り込み、FlatListで投稿を描画する。
 * 投稿欄と右下の作成ボタン、ヘッダーの友達追加から主要操作へ直接移動できる。
 */
import { ChallengeCard } from "@/components/challenge-card";
import { FeedTabs } from "@/components/feed-tabs";
import { Text } from "@/components/localized-text";
import { ScreenHeader } from "@/components/screen-header";
import { Avatar, Button, s } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useLanguage } from "@/i18n/language";
import type { Challenge } from "@/mock/data";
import { friendDirectory } from "@/mock/friends";
import { useAppState } from "@/state/app-state";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useRef, useState } from "react";
import {
    FlatList,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export default function Home() {
  const { state } = useAppState();
  const { t } = useLanguage();
  const [filter, setFilter] = useState("Public");
  const [category, setCategory] = useState("All");
  const list = useRef<FlatList<Challenge>>(null);
  const friends = friendDirectory
    .filter((friend) => state.friendIds.includes(friend.id))
    .map((friend) => friend.name);
  const feed = state.challenges.filter(
    (item) =>
      (category === "All" || category === item.category) &&
      (filter === "Public"
        ? item.visibility === "public"
        : filter === "Friends"
          ? friends.includes(item.user)
          : !!state.predictions[item.id]),
  );
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.column}>
        <ScreenHeader title="Home" home />
        <FeedTabs
          options={["Public", "Friends", "My picks"]}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            list.current?.scrollToOffset({ offset: 0, animated: false });
          }}
        />
        <FlatList
          ref={list}
          data={feed}
          keyExtractor={(item) => item.id}
          extraData={state.predictions}
          renderItem={({ item }) => <ChallengeCard challenge={item} />}
          contentContainerStyle={styles.feed}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={5}
          ListHeaderComponent={
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("Post a challenge")}
                onPress={() => router.push("/create")}
                style={({ pressed }) => [
                  styles.composer,
                  pressed && { backgroundColor: c.lavenderLight },
                ]}
              >
                <Avatar emoji="🌷" size={40} />
                <View style={s.flex}>
                  <Text style={styles.prompt}>
                    What will you challenge today?
                  </Text>
                  <Text style={s.caption}>
                    Share a goal. Let friends predict.
                  </Text>
                </View>
                <SymbolView
                  name={{
                    ios: "plus.circle.fill",
                    android: "add_circle",
                    web: "add_circle",
                  }}
                  size={26}
                  tintColor={c.primary}
                />
              </Pressable>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categories}
              >
                {["All", "Lifestyle", "Fitness", "Study"].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === value }}
                    onPress={() => {
                      setCategory(value);
                      list.current?.scrollToOffset({
                        offset: 0,
                        animated: false,
                      });
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      category === value && styles.chipActive,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        category === value && { color: c.primaryDark },
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 32 }}>
                {filter === "My picks" ? "🔮" : "🌱"}
              </Text>
              <Text style={s.sectionTitle}>
                {filter === "My picks"
                  ? "No predictions yet"
                  : "No challenges here yet"}
              </Text>
              <Text style={[s.muted, { textAlign: "center" }]}>
                {filter === "My picks"
                  ? "Choose YES or NO on a post to save your prediction here."
                  : "Try another category or invite a friend to join you."}
              </Text>
              <Button
                label="Show all posts"
                onPress={() => {
                  setFilter("Public");
                  setCategory("All");
                }}
              />
              {filter === "Friends" && (
                <Button
                  secondary
                  label="Add friends"
                  onPress={() => router.push("/friends")}
                />
              )}
            </View>
          }
          ListFooterComponent={
            feed.length ? (
              <View style={styles.footer}>
                <Text style={s.caption}>You’re all caught up</Text>
                <Text style={[s.caption, { marginTop: 4 }]}>
                  Demo feed · Predictions can be changed anytime
                </Text>
              </View>
            ) : null
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Post a challenge")}
          onPress={() => router.push("/create")}
          style={({ pressed }) => [styles.fab, pressed && s.pressed]}
        >
          <SymbolView
            name={{ ios: "square.and.pencil", android: "edit", web: "edit" }}
            size={24}
            tintColor={c.card}
          />
          <Text style={styles.fabText}>Post</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.card },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  feed: { paddingBottom: 100 },
  composer: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  prompt: { fontSize: 15, color: c.text, marginBottom: 5 },
  categories: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 22,
    backgroundColor: c.card,
  },
  chipActive: { backgroundColor: c.lavenderLight, borderColor: "#C9B6F0" },
  chipText: { fontSize: 12, color: c.muted, fontWeight: "600" },
  empty: { padding: 32, gap: 16, alignItems: "center" },
  footer: { padding: 24, alignItems: "center" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 18,
    minHeight: 54,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 28,
    backgroundColor: c.primary,
    boxShadow: "0 4px 14px rgba(85, 51, 160, 0.22)",
  },
  fabText: { fontSize: 15, fontWeight: "800", color: c.card },
});
