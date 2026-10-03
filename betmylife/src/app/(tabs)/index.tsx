/**
 * Home pairs a branded daily prediction with the filterable friends feed.
 * Featured votes and feed votes both update the existing local mock state.
 */
import { ChallengeCard } from "@/components/challenge-card";
import { FeaturedChallengeCard } from "@/components/featured-challenge-card";
import { FeedTabs } from "@/components/feed-tabs";
import { Text } from "@/components/localized-text";
import { ScreenHeader } from "@/components/screen-header";
import { BrandAsset } from "@/components/brand-asset";
import { s } from "@/components/ui-kit";
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

const dates = [
  { day: "Mon", date: "12" },
  { day: "Tue", date: "13" },
  { day: "Wed", date: "14" },
  { day: "Thu", date: "15" },
  { day: "Fri", date: "16" },
];
const categories = [
  { label: "All", icon: null },
  { label: "Study", icon: "iconStudy" },
  { label: "Fitness", icon: "iconFitness" },
  { label: "Lifestyle", icon: "iconLifestyle" },
] as const;

function StatTile({
  asset,
  value,
  label,
  color,
}: {
  asset: "iconStreak" | "iconPoints" | "iconPrediction";
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

export default function Home() {
  const { state } = useAppState();
  const { t } = useLanguage();
  const [filter, setFilter] = useState("Public");
  const [category, setCategory] = useState("All");
  const [selectedDate, setSelectedDate] = useState("Wed");
  const list = useRef<FlatList<Challenge>>(null);
  const featured = state.challenges.find((item) => item.id === "read-today");
  const friendNames = friendDirectory
    .filter((friend) => state.friendIds.includes(friend.id))
    .map((friend) => friend.name);
  const feed = state.challenges.filter(
    (item) =>
      item.id !== featured?.id &&
      (category === "All" || category === item.category) &&
      (filter === "Public"
        ? item.visibility === "public"
        : filter === "Friends"
          ? friendNames.includes(item.user)
          : !!state.predictions[item.id]),
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.column}>
        <ScreenHeader title="Predict My Life" home />
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
              <View style={styles.dateSection}>
                <View style={styles.dateHeading}>
                  <Text style={styles.weekLabel}>YOUR WEEK</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Add friends")}
                    onPress={() => router.push("/friends")}
                    style={({ pressed }) => [styles.friendsLink, pressed && s.pressed]}
                  >
                    <SymbolView
                      name={{ ios: "person.2", android: "people", web: "people" }}
                      size={15}
                      tintColor={c.primary}
                    />
                    <Text style={styles.friendsLinkText}>Your circle</Text>
                  </Pressable>
                </View>
                <View style={styles.dateRow}>
                  {dates.map(({ day, date }) => (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedDate === day }}
                      onPress={() => setSelectedDate(day)}
                      style={({ pressed }) => [
                        styles.dateItem,
                        selectedDate === day && styles.dateSelected,
                        pressed && s.pressed,
                      ]}
                    >
                      <Text style={[styles.dateDay, selectedDate === day && styles.dateSelectedText]}>{day}</Text>
                      <Text style={[styles.dateNumber, selectedDate === day && styles.dateSelectedText]}>{date}</Text>
                    </Pressable>
                  ))}
                  <View style={styles.calendarButton}>
                    <SymbolView
                      name={{ ios: "calendar", android: "calendar_month", web: "calendar_month" }}
                      size={22}
                      tintColor={c.text}
                    />
                  </View>
                </View>
              </View>
              {featured ? (
                <View style={styles.featureWrap}>
                  <FeaturedChallengeCard challenge={featured} />
                </View>
              ) : (
                <View style={styles.emptyHero}>
                  <BrandAsset name="stateNoChallenges" style={styles.emptyMascot} label="No challenges yet" />
                  <Text style={styles.emptyTitle}>No challenges yet</Text>
                  <Text style={s.muted}>Start with one small promise today.</Text>
                </View>
              )}
              <View style={styles.statsRow}>
                <StatTile asset="iconStreak" value="21" label="DAY STREAK" color={c.peach} />
                <StatTile asset="iconPoints" value="420" label="POINTS" color={c.cream} />
                <StatTile asset="iconPrediction" value="8" label="PREDICTIONS" color={c.lavender} />
              </View>
              <View style={styles.feedHeading}>
                <View>
                  <Text style={styles.feedEyebrow}>YOUR CIRCLE</Text>
                  <Text style={styles.feedTitle}>Friends’ Challenges</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/create")}
                  style={({ pressed }) => [styles.addChallenge, pressed && s.pressed]}
                >
                  <Text style={styles.addChallengeText}>＋ Create</Text>
                </Pressable>
              </View>
              <FeedTabs
                options={["Public", "Friends", "My picks"]}
                value={filter}
                onChange={(value) => {
                  setFilter(value);
                  list.current?.scrollToOffset({ offset: 0, animated: false });
                }}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categories}
              >
                {categories.map(({ label, icon }) => (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === label }}
                    onPress={() => {
                      setCategory(label);
                      list.current?.scrollToOffset({ offset: 0, animated: false });
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      category === label && styles.chipActive,
                      pressed && s.pressed,
                    ]}
                  >
                    {icon && <BrandAsset name={icon} style={styles.categoryIcon} />}
                    <Text style={[styles.chipText, category === label && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyFeed}>
              <BrandAsset name={filter === "Friends" ? "stateNoFriends" : "stateNoChallenges"} style={styles.emptyMascot} />
              <Text style={s.sectionTitle}>{filter === "My picks" ? "No predictions yet" : filter === "Friends" ? "No friends here yet" : "No challenges in this category"}</Text>
              <Text style={[s.muted, styles.emptyCopy]}>{filter === "My picks" ? "Choose YES or NO to save your first prediction." : "Try another filter or invite a friend to join you."}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFilter("Public");
                  setCategory("All");
                }}
                style={({ pressed }) => [styles.resetButton, pressed && s.pressed]}
              >
                <Text style={styles.resetText}>Show all challenges</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={feed.length ? <Text style={styles.footer}>You’re all caught up · Predictions are just for fun</Text> : null}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Post a challenge")}
          onPress={() => router.push("/create")}
          style={({ pressed }) => [styles.fab, pressed && s.pressed]}
        >
          <SymbolView name={{ ios: "square.and.pencil", android: "edit", web: "edit" }} size={22} tintColor="#FFFFFF" />
          <Text style={styles.fabText}>Post</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  column: { flex: 1, width: "100%", maxWidth: 620, alignSelf: "center", borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  feed: { paddingBottom: 108, backgroundColor: c.background },
  dateSection: { paddingTop: 13, paddingBottom: 15, paddingHorizontal: 17, backgroundColor: c.background },
  dateHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  weekLabel: { color: c.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  friendsLink: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  friendsLinkText: { color: c.primary, fontSize: 10, fontWeight: "800" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dateItem: { flex: 1, minHeight: 55, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: c.card },
  dateSelected: { backgroundColor: c.primary },
  dateDay: { color: c.muted, fontSize: 9, fontWeight: "700" },
  dateNumber: { color: c.text, fontSize: 15, fontWeight: "900" },
  dateSelectedText: { color: "#FFFFFF" },
  calendarButton: { width: 36, height: 50, alignItems: "center", justifyContent: "center" },
  featureWrap: { paddingHorizontal: 14 },
  emptyHero: { marginHorizontal: 14, minHeight: 270, padding: 20, borderRadius: 26, backgroundColor: c.card, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyMascot: { width: 125, height: 105 },
  emptyTitle: { color: c.text, fontSize: 19, fontWeight: "900" },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginTop: 13, marginBottom: 21 },
  statTile: { flex: 1, minHeight: 82, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statIcon: { width: 29, height: 27 },
  statValue: { marginTop: -2, color: c.text, fontSize: 16, fontWeight: "900" },
  statLabel: { marginTop: 1, color: c.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  feedHeading: { marginHorizontal: 18, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  feedEyebrow: { color: c.coral, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  feedTitle: { marginTop: 2, color: c.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  addChallenge: { marginBottom: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15, backgroundColor: c.lavender },
  addChallengeText: { color: c.primaryDark, fontSize: 10, fontWeight: "900" },
  categories: { paddingHorizontal: 15, paddingVertical: 10, gap: 7, backgroundColor: c.background },
  chip: { minHeight: 39, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: c.border, borderRadius: 22, backgroundColor: c.card },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.muted, fontSize: 10, fontWeight: "800" },
  chipTextActive: { color: "#FFFFFF" },
  categoryIcon: { width: 29, height: 31 },
  emptyFeed: { paddingHorizontal: 30, paddingVertical: 28, alignItems: "center", gap: 10, backgroundColor: c.card },
  emptyCopy: { textAlign: "center" },
  resetButton: { minHeight: 42, marginTop: 5, paddingHorizontal: 16, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.primary },
  resetText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  footer: { paddingVertical: 24, color: c.muted, textAlign: "center", fontSize: 10 },
  fab: { position: "absolute", right: 17, bottom: 16, minHeight: 50, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 26, backgroundColor: c.primary, boxShadow: "0 4px 14px rgba(32, 72, 150, 0.24)" },
  fabText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
});
