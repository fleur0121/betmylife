/**
 * Home pairs a branded daily prediction with the filterable friends feed.
 * Featured votes and feed votes both update the existing local mock state.
 */
import { BrandAsset } from "@/components/brand-asset";
import { ChallengeCard } from "@/components/challenge-card";
import { FeaturedChallengeCard } from "@/components/featured-challenge-card";
import { FeedTabs } from "@/components/feed-tabs";
import { Text } from "@/components/localized-text";
import { ScreenHeader } from "@/components/screen-header";
import { s } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { API_URL } from "@/constants/api";
import { useLanguage } from "@/i18n/language";
import type { Challenge } from "@/mock/data";
import { friendDirectory } from "@/mock/friends";
import { getChallenges } from "@/services/challenge-service";
import { useAppState } from "@/state/app-state";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
    FlatList,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const categories = [
  { label: "All", icon: null },
  { label: "Study", icon: "iconStudy" },
  { label: "Fitness", icon: "iconFitness" },
  { label: "Lifestyle", icon: "iconLifestyle" },
] as const;

function sameDate(left: Date, right: Date) {
  return left.toDateString() === right.toDateString();
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const days: (Date | null)[] = Array.from(
    { length: first.getDay() },
    () => null,
  );
  for (let day = 1; day <= count; day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return days;
}

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
  const { state, dispatch } = useAppState();
  const { locale, t } = useLanguage();
  const [filter, setFilter] = useState("Public");
  const [category, setCategory] = useState("All");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [profilePoints, setProfilePoints] = useState<number | null>(null);
  const list = useRef<FlatList<Challenge>>(null);
  useEffect(() => {
    if (!state.authUserId) return;
    let cancelled = false;
    getChallenges(state.authUserId)
      .then((items) => {
        if (cancelled) return;
        dispatch({
          type: "replace-challenges",
          challenges: items.map((item) => ({
            id: item.id,
            user: "Fuka",
            avatar: "🌷",
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
        setLoadError("");
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load challenges.");
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, state.authUserId]);
  useEffect(() => {
    if (!state.authUserId) return;
    let cancelled = false;
    fetch(`${API_URL}/users/${state.authUserId}/profile`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail ?? "Could not load profile.");
        return body as { points: number };
      })
      .then((profile) => {
        if (!cancelled) setProfilePoints(profile.points);
      })
      .catch(() => {
        if (!cancelled) setProfilePoints(null);
      });
    return () => {
      cancelled = true;
    };
  }, [state.authUserId]);
  const predictionCount = Object.keys(state.stakedPredictions).length;
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
  const dateStrip = Array.from({ length: 21 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index - 10);
    return date;
  });
  const weekday = (date: Date) =>
    date.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
      weekday: "short",
    });
  const monthLabel = calendarMonth.toLocaleDateString(
    locale === "ja" ? "ja-JP" : "en-US",
    { year: "numeric", month: "long" },
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
                    style={({ pressed }) => [
                      styles.friendsLink,
                      pressed && s.pressed,
                    ]}
                  >
                    <SymbolView
                      name={{
                        ios: "person.2",
                        android: "people",
                        web: "people",
                      }}
                      size={15}
                      tintColor={c.primary}
                    />
                    <Text style={styles.friendsLinkText}>Your circle</Text>
                  </Pressable>
                </View>
                <View style={styles.dateControls}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateRow}
                  >
                    {dateStrip.map((date) => (
                      <Pressable
                        key={date.toISOString()}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: sameDate(selectedDate, date),
                        }}
                        onPress={() => setSelectedDate(date)}
                        style={({ pressed }) => [
                          styles.dateItem,
                          sameDate(selectedDate, date) && styles.dateSelected,
                          pressed && s.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dateDay,
                            sameDate(selectedDate, date) &&
                              styles.dateSelectedText,
                          ]}
                        >
                          {weekday(date)}
                        </Text>
                        <Text
                          style={[
                            styles.dateNumber,
                            sameDate(selectedDate, date) &&
                              styles.dateSelectedText,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("Open calendar")}
                    onPress={() => {
                      setCalendarMonth(selectedDate);
                      setCalendarVisible(true);
                    }}
                    style={({ pressed }) => [
                      styles.calendarButton,
                      pressed && s.pressed,
                    ]}
                  >
                    <SymbolView
                      name={{
                        ios: "calendar",
                        android: "calendar_month",
                        web: "calendar_month",
                      }}
                      size={22}
                      tintColor={c.text}
                    />
                  </Pressable>
                </View>
              </View>
              <Modal
                visible={calendarVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setCalendarVisible(false)}
              >
                <View style={styles.modalBackdrop}>
                  <View style={styles.calendarCard}>
                    <View style={styles.calendarHeader}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("Previous month")}
                        onPress={() =>
                          setCalendarMonth(
                            new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth() - 1,
                              1,
                            ),
                          )
                        }
                        style={styles.monthButton}
                      >
                        <Text style={styles.monthArrow}>‹</Text>
                      </Pressable>
                      <Text style={styles.monthTitle}>{monthLabel}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("Next month")}
                        onPress={() =>
                          setCalendarMonth(
                            new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth() + 1,
                              1,
                            ),
                          )
                        }
                        style={styles.monthButton}
                      >
                        <Text style={styles.monthArrow}>›</Text>
                      </Pressable>
                    </View>
                    <View style={styles.calendarGrid}>
                      {calendarDays(calendarMonth).map((date, index) =>
                        date ? (
                          <Pressable
                            key={date.toISOString()}
                            accessibilityRole="button"
                            onPress={() => {
                              setSelectedDate(date);
                              setCalendarVisible(false);
                            }}
                            style={[
                              styles.calendarDay,
                              sameDate(selectedDate, date) &&
                                styles.calendarDaySelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarDayText,
                                sameDate(selectedDate, date) &&
                                  styles.calendarDayTextSelected,
                              ]}
                            >
                              {date.getDate()}
                            </Text>
                          </Pressable>
                        ) : (
                          <View
                            key={`empty-${index}`}
                            style={styles.calendarDay}
                          />
                        ),
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCalendarVisible(false)}
                      style={styles.closeCalendar}
                    >
                      <Text style={styles.closeCalendarText}>{t("Close")}</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
              {featured ? (
                <View style={styles.featureWrap}>
                  <FeaturedChallengeCard challenge={featured} />
                </View>
              ) : (
                <View style={styles.emptyHero}>
                  <BrandAsset
                    name="stateNoChallenges"
                    style={styles.emptyMascot}
                    label="No challenges yet"
                  />
                  <Text style={styles.emptyTitle}>No challenges yet</Text>
                  <Text style={s.muted}>
                    Start with one small promise today.
                  </Text>
                </View>
              )}
              <View style={styles.statsRow}>
                <StatTile
                  asset="iconStreak"
                  value={String(state.challenges.length)}
                  label="MY CHALLENGES"
                  color={c.peach}
                />
                <StatTile
                  asset="iconPoints"
                  value={(profilePoints ?? state.wallet).toLocaleString()}
                  label="POINTS"
                  color={c.cream}
                />
                <StatTile
                  asset="iconPrediction"
                  value={String(predictionCount)}
                  label="PREDICTIONS"
                  color={c.lavender}
                />
              </View>
              <View style={styles.feedHeading}>
                <View>
                  <Text style={styles.feedEyebrow}>YOUR CIRCLE</Text>
                  <Text style={styles.feedTitle}>Friends’ Challenges</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/create")}
                  style={({ pressed }) => [
                    styles.addChallenge,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={styles.addChallengeText}>＋ Create</Text>
                </Pressable>
              </View>
              {!!loadError && <Text accessibilityRole="alert" style={{ color: c.red }}>{loadError}</Text>}
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
                      list.current?.scrollToOffset({
                        offset: 0,
                        animated: false,
                      });
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      category === label && styles.chipActive,
                      pressed && s.pressed,
                    ]}
                  >
                    {icon && (
                      <BrandAsset name={icon} style={styles.categoryIcon} />
                    )}
                    <Text
                      style={[
                        styles.chipText,
                        category === label && styles.chipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyFeed}>
              <BrandAsset
                name={
                  filter === "Friends"
                    ? "stateNoFriends"
                    : filter === "My picks"
                      ? "stateNoPredictions"
                      : "stateNoChallenges"
                }
                style={styles.emptyMascot}
              />
              <Text style={s.sectionTitle}>
                {filter === "My picks"
                  ? "No predictions yet"
                  : filter === "Friends"
                    ? "No friends here yet"
                    : "No challenges in this category"}
              </Text>
              <Text style={[s.muted, styles.emptyCopy]}>
                {filter === "My picks"
                  ? "Choose YES or NO to save your first prediction."
                  : "Try another filter or invite a friend to join you."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFilter("Public");
                  setCategory("All");
                }}
                style={({ pressed }) => [
                  styles.resetButton,
                  pressed && s.pressed,
                ]}
              >
                <Text style={styles.resetText}>Show all challenges</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={
            feed.length ? (
              <Text style={styles.footer}>
                You’re all caught up · Predictions are just for fun
              </Text>
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
            size={22}
            tintColor="#FFFFFF"
          />
          <Text style={styles.fabText}>Post</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  feed: { paddingBottom: 108, backgroundColor: c.background },
  dateSection: {
    paddingTop: 13,
    paddingBottom: 15,
    paddingHorizontal: 17,
    backgroundColor: c.background,
  },
  dateHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  weekLabel: {
    color: c.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  friendsLink: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  friendsLinkText: { color: c.primary, fontSize: 10, fontWeight: "800" },
  dateControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateRow: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingRight: 2,
  },
  dateItem: {
    width: 54,
    minHeight: 55,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: c.card,
  },
  dateSelected: { backgroundColor: c.primary },
  dateDay: { color: c.muted, fontSize: 9, fontWeight: "700" },
  dateNumber: { color: c.text, fontSize: 15, fontWeight: "900" },
  dateSelectedText: { color: "#FFFFFF" },
  calendarButton: {
    width: 38,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(40,35,60,0.38)",
  },
  calendarCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: c.card,
    gap: 16,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.lavenderLight,
  },
  monthArrow: { color: c.primaryDark, fontSize: 28, lineHeight: 30 },
  monthTitle: { color: c.text, fontSize: 17, fontWeight: "900" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  calendarDay: {
    width: "13.4%",
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDaySelected: { backgroundColor: c.primary },
  calendarDayText: { color: c.text, fontSize: 14, fontWeight: "700" },
  calendarDayTextSelected: { color: c.card },
  closeCalendar: {
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.lavenderLight,
  },
  closeCalendarText: { color: c.primaryDark, fontSize: 13, fontWeight: "800" },
  featureWrap: { paddingHorizontal: 14 },
  emptyHero: {
    marginHorizontal: 14,
    minHeight: 270,
    padding: 20,
    borderRadius: 26,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyMascot: { width: 125, height: 105 },
  emptyTitle: { color: c.text, fontSize: 19, fontWeight: "900" },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    marginTop: 13,
    marginBottom: 21,
  },
  statTile: {
    flex: 1,
    minHeight: 82,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statIcon: { width: 29, height: 27 },
  statValue: { marginTop: -2, color: c.text, fontSize: 16, fontWeight: "900" },
  statLabel: {
    marginTop: 1,
    color: c.muted,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  feedHeading: {
    marginHorizontal: 18,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  feedEyebrow: {
    color: c.coral,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  feedTitle: {
    marginTop: 2,
    color: c.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  addChallenge: {
    marginBottom: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: c.lavender,
  },
  addChallengeText: { color: c.primaryDark, fontSize: 10, fontWeight: "900" },
  categories: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 7,
    backgroundColor: c.background,
  },
  chip: {
    minHeight: 39,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 22,
    backgroundColor: c.card,
  },
  chipActive: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.muted, fontSize: 10, fontWeight: "800" },
  chipTextActive: { color: "#FFFFFF" },
  categoryIcon: { width: 29, height: 31 },
  emptyFeed: {
    paddingHorizontal: 30,
    paddingVertical: 28,
    alignItems: "center",
    gap: 10,
    backgroundColor: c.card,
  },
  emptyCopy: { textAlign: "center" },
  resetButton: {
    minHeight: 42,
    marginTop: 5,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
  },
  resetText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  footer: {
    paddingVertical: 24,
    color: c.muted,
    textAlign: "center",
    fontSize: 10,
  },
  fab: {
    position: "absolute",
    right: 17,
    bottom: 16,
    minHeight: 50,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 26,
    backgroundColor: c.primary,
    boxShadow: "0 4px 14px rgba(32, 72, 150, 0.24)",
  },
  fabText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
});
