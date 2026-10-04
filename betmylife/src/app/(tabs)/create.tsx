/**
 * チャレンジ作成画面。タイトル、カテゴリ、難易度、自信度、期限を入力する。
 * フォームの値は画面内の状態で管理し、タイトルを検証してから共有状態へ新しいチャレンジを追加する。
 * 作成後は完了表示からHomeへ移動できる。期限は選択式、AI確率と倍率は現在の仮値。
 */
import { BrandAsset } from "@/components/brand-asset";
import { Text } from "@/components/localized-text";
import {
  Button,
  Card,
  PageHeading,
  Screen,
  Segments,
  s,
} from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useLanguage } from "@/i18n/language";
import type { Category, Visibility } from "@/mock/data";
import { saveChallenge } from "@/services/challenge-service";
import {
  analyzeChallenge,
  type ChallengeNlpRequest,
  type ChallengeNlpResult,
} from "@/services/challenge-nlp";
import { useAppState } from "@/state/app-state";
import { parseChallengeDeadline } from "@/utils/predictions";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
export default function Create() {
  const { locale, t } = useLanguage();
  const { state, dispatch } = useAppState();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("Study");
  const [difficulty, setDifficulty] = useState(3);
  const [confidence, setConfidence] = useState(73);
  const [deadline, setDeadline] = useState("Tomorrow");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("19:00");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [analysis, setAnalysis] = useState<ChallengeNlpResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const analysisContext = useRef<{ key: string; request: ChallengeNlpRequest } | null>(null);
  const currentTitle = useRef(title);
  const analysisInFlight = useRef(false);
  const confidenceTrackWidth = useRef(1);

  function updateConfidence(locationX: number) {
    if (!Number.isFinite(locationX)) return;
    const next = Math.round(
      (locationX / Math.max(confidenceTrackWidth.current, 1)) * 100,
    );
    setConfidence(Math.max(0, Math.min(100, next)));
  }

  async function analyzeInput(): Promise<ChallengeNlpResult | null> {
    if (analysisInFlight.current || !title.trim()) return null;
    const text = title;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) {
      setAnalysisError("Your timezone could not be determined.");
      return null;
    }
    const now = new Date();
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
    const key = JSON.stringify([text, timezone, localDate]);
    if (analysisContext.current?.key !== key) {
      analysisContext.current = { key, request: { text, timezone, submitted_at: now.toISOString() } };
    }
    currentTitle.current = text;
    analysisInFlight.current = true;
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);
    try {
      const result = await analyzeChallenge(analysisContext.current.request);
      console.log("[challenge-nlp] analyzed", JSON.stringify(result, null, 2));
      if (currentTitle.current === text) setAnalysis(result);
      return result;
    } catch (error) {
      if (currentTitle.current === text) setAnalysisError(error instanceof Error ? error.message : "Analysis failed. Please try again.");
      return null;
    } finally {
      analysisInFlight.current = false;
      setAnalyzing(false);
    }
  }

  function getResolvedDeadline() {
    if (deadline !== "Custom") {
      return `${deadline} · ${deadline === "Today" ? "11:59 PM" : "7:00 AM"}`;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(customDate) ||
      !/^\d{2}:\d{2}$/.test(customTime)
    ) {
      return null;
    }
    return `${customDate} · ${customTime}`;
  }

  async function createChallenge() {
    if (analysisInFlight.current) return;
    if (title.trim().length < 5) {
      setError("Give your challenge a little more detail (at least 5 characters).");
      return;
    }
    const resolvedDeadline = getResolvedDeadline();
    if (!resolvedDeadline) {
      setError("Enter a valid date and time for your deadline.");
      return;
    }
    // Posting explicitly triggers analysis; failures are shown but do not discard the post.
    const postedAnalysis = await analyzeInput();
    const deadlineAt = parseChallengeDeadline(resolvedDeadline)?.toISOString();
    if (!state.authUserId || !deadlineAt) {
      setError("You must be logged in to post a challenge.");
      return;
    }
    let savedChallenge;
    try {
      savedChallenge = await saveChallenge({
        userId: state.authUserId,
        title,
        category,
        difficulty,
        confidence,
        visibility,
        deadlineAt,
        deadlineLabel: resolvedDeadline,
        analysis: postedAnalysis ?? analysis,
        userInput: {
          schema_version: 1,
          title,
          category,
          difficulty,
          confidence,
          visibility,
          deadline_at: deadlineAt,
          deadline_label: resolvedDeadline,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your challenge.");
      return;
    }
    dispatch({
      type: "create",
      challenge: {
        id: savedChallenge.id,
        user: "Fuka",
        avatar: "🌷",
        color: c.lavender,
        title: title.trim(),
        category,
        difficulty,
        confidence,
        deadline: resolvedDeadline,
        deadlineAt: parseChallengeDeadline(resolvedDeadline)?.toISOString(),
        probability: 68,
        yesOdds: "1.47",
        noOdds: "3.13",
        friends: 0,
        visibility,
        titleJa: locale === "ja" ? title.trim() : undefined,
      },
    });
    setCreated(true);
    setTitle("");
    currentTitle.current = "";
    setAnalysis(null);
    analysisContext.current = null;
    setError("");
  }
  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen title="New challenge">
        <PageHeading
          title="Share your next goal"
          subtitle="Set a goal, choose a deadline, and let friends predict."
        />
        {created ? (
          <Card>
            <BrandAsset
              name="stateChallengeSuccess"
              style={styles.successArt}
              label="Challenge success"
            />
            <Text style={[s.sectionTitle, { textAlign: "center" }]}>
              You’re on the board!
            </Text>
            <Text style={s.muted}>
              Your challenge is saved and ready for the feed. Let your friends believe
              in you.
            </Text>
            {!!analysisError && <Text accessibilityRole="alert" translate={false} style={{ color: c.red }}>Your challenge was posted, but analysis failed: {analysisError}</Text>}
            <Button
              label="See my challenge →"
              onPress={() => {
                setCreated(false);
                router.navigate("/");
              }}
            />
            <Button
              secondary
              label="Create another"
              onPress={() => setCreated(false)}
            />
          </Card>
        ) : (
          <>
            <Card>
              <View style={s.row}>
                <View style={styles.authorAvatar}>
                  <BrandAsset
                    name="mascotCheerful"
                    style={styles.authorMascot}
                  />
                </View>
                <View>
                  <Text translate={false} style={s.bold}>
                    Fuka
                  </Text>
                  <Text style={s.caption}>Visible to your friends</Text>
                </View>
              </View>
              <TextInput
                editable={!analyzing}
                accessibilityLabel={t("Challenge title")}
                placeholder={t("e.g. Read for 20 minutes")}
                placeholderTextColor={c.muted}
                value={title}
                onChangeText={(text) => {
                  currentTitle.current = text;
                  setTitle(text);
                  setAnalysis(null);
                  setAnalysisError("");
                  analysisContext.current = null;
                  setError("");
                }}
                maxLength={1000}
                multiline
                style={styles.input}
              />
              <Text style={[s.caption, { textAlign: "right" }]}>
                {title.length}/1000
              </Text>
              <View style={styles.encouragement}>
                <BrandAsset name="stickerYouGotThis" style={styles.encouragementArt} />
                <Text style={[s.caption, s.flex]}>A clear goal is a great first step. You’ve got this!</Text>
              </View>
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: c.red }}>
                  {error}
                </Text>
              )}
              <Button secondary disabled={analyzing || !title.trim()} label={analyzing ? "Analyzing…" : "Analyze"} onPress={() => void analyzeInput()} />
              {!!analysisError && <Text accessibilityRole="alert" style={{ color: c.red }}>{analysisError}</Text>}
              {analysis && <Text style={s.caption}>Analysis complete.</Text>}
              {analysis && [...analysis.data.clarification_questions, ...analysis.data.actions.flatMap((action) => action.clarification_questions)].map((question, index) => (
                <Text key={`${index}-${question}`} translate={false} style={s.caption}>{question}</Text>
              ))}
              <Text style={s.sectionTitle}>Pick a category</Text>
              <View style={styles.categoryChoices}>
                {(
                  [
                    ["Study", "iconStudy", c.sky],
                    ["Fitness", "iconFitness", c.peach],
                    ["Lifestyle", "iconLifestyle", c.mint],
                  ] as const
                ).map(([name, asset, color]) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === name }}
                    onPress={() => {
                      setCategory(name);
                    }}
                    style={({ pressed }) => [
                      styles.categoryCard,
                      { backgroundColor: color },
                      category === name && styles.categorySelected,
                      pressed && s.pressed,
                    ]}
                  >
                    <BrandAsset name={asset} style={styles.categoryArt} />
                    <Text
                      style={[
                        styles.categoryLabel,
                        category === name && styles.categoryLabelActive,
                      ]}
                    >
                      {name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.sectionTitle}>Who can see this?</Text>
              <Segments
                options={["Public", "Friends only"] as const}
                value={visibility === "public" ? "Public" : "Friends only"}
                onChange={(value) =>
                  setVisibility(value === "Public" ? "public" : "friends")
                }
              />
              <Text style={s.caption}>
                {visibility === "public"
                  ? "Anyone can discover this challenge."
                  : "Only your friends can see this challenge."}
              </Text>
            </Card>
            <Card>
              <View style={s.between}>
                <Text style={s.sectionTitle}>How big is the stretch?</Text>
                <Text style={s.caption}>{difficulty}/5</Text>
              </View>
              <View style={s.row}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={t(`Difficulty ${value} of 5`)}
                    accessibilityState={{ selected: difficulty === value }}
                    onPress={() => {
                      setDifficulty(value);
                    }}
                    style={({ pressed }) => [
                      styles.level,
                      value <= difficulty && { backgroundColor: c.primary },
                      pressed && s.pressed,
                    ]}
                  >
                    <Text
                      style={{
                        color: value <= difficulty ? c.card : c.muted,
                        fontWeight: "800",
                      }}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={s.between}>
                <Text style={s.caption}>Easy win</Text>
                <Text style={s.caption}>Big ambition</Text>
              </View>
            </Card>
            <Card>
              <Text style={s.sectionTitle}>How confident are you?</Text>
              <View style={styles.confidenceHeader}>
                <Text style={s.caption}>0%</Text>
                <Text accessibilityLiveRegion="polite" style={styles.percent}>
                  {confidence}%
                </Text>
                <Text style={s.caption}>100%</Text>
              </View>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel={t("Confidence")}
                accessibilityValue={{ min: 0, max: 100, now: confidence }}
                onLayout={(event) => {
                  confidenceTrackWidth.current = event.nativeEvent.layout.width;
                }
                }
                onStartShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => true}
                onMoveShouldSetResponder={() => true}
                onMoveShouldSetResponderCapture={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={(event) =>
                  updateConfidence(event.nativeEvent.locationX)
                }
                onResponderMove={(event) =>
                  updateConfidence(event.nativeEvent.locationX)
                }
                style={styles.confidenceTrack}
              >
                <View style={[styles.confidenceFill, { width: `${confidence}%` }]} />
                <View
                  style={[styles.confidenceThumb, { left: `${confidence}%` }]}
                />
              </View>
              <Text style={[s.caption, { textAlign: "center" }]}>
                Trust your gut. There’s no wrong answer.
              </Text>
            </Card>
            <Card>
              <Text style={s.sectionTitle}>Set your finish line</Text>
              <Segments
                options={["Today", "Tomorrow", "In 3 days", "Custom"]}
                value={deadline}
                onChange={(value) => {
                  setDeadline(value);
                }}
              />
              {deadline === "Custom" ? (
                <View style={styles.customDeadline}>
                  <TextInput
                    accessibilityLabel={t("Deadline date")}
                    placeholder={t("YYYY-MM-DD")}
                    placeholderTextColor={c.muted}
                    value={customDate}
                    onChangeText={(value) => {
                      setCustomDate(value);
                    }}
                    keyboardType="numbers-and-punctuation"
                    style={styles.deadlineInput}
                  />
                  <TextInput
                    accessibilityLabel={t("Deadline time")}
                    placeholder={t("HH:MM")}
                    placeholderTextColor={c.muted}
                    value={customTime}
                    onChangeText={(value) => {
                      setCustomTime(value);
                    }}
                    keyboardType="numbers-and-punctuation"
                    style={styles.deadlineInput}
                  />
                </View>
              ) : (
                <Text style={s.caption}>
                  ◷ {getResolvedDeadline()} · local time
                </Text>
              )}
            </Card>
            <Button
              label={analyzing ? "Posting…" : "Post challenge"}
              disabled={analyzing || !title.trim()}
              onPress={() => void createChallenge()}
            />
            <Text style={[s.caption, { textAlign: "center" }]}>Visible to your friends</Text>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  successArt: { alignSelf: "center", width: 152, height: 118 },
  authorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: c.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  authorMascot: { width: 44, height: 44 },
  categoryChoices: { flexDirection: "row", gap: 8 },
  categoryCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  categorySelected: { borderColor: c.primary },
  categoryArt: { width: 44, height: 44 },
  categoryLabel: {
    marginTop: -2,
    color: c.text,
    fontSize: 10,
    fontWeight: "800",
  },
  categoryLabelActive: { color: c.primaryDark },
  input: {
    minHeight: 132,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 17,
    lineHeight: 25,
    color: c.text,
    textAlignVertical: "top",
  },
  encouragement: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  encouragementArt: { width: 38, height: 38 },
  level: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: c.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  confidenceHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  confidenceTrack: {
    height: 32,
    justifyContent: "center",
    position: "relative",
  },
  confidenceFill: { height: 9, borderRadius: 8, backgroundColor: c.primary },
  confidenceThumb: {
    position: "absolute",
    top: 8,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 10,
    backgroundColor: c.primaryDark,
    borderWidth: 3,
    borderColor: c.card,
  },
  customDeadline: { flexDirection: "row", gap: 8 },
  deadlineInput: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    backgroundColor: c.background,
    color: c.text,
    fontSize: 15,
  },
  percent: { fontSize: 40, fontWeight: "800", color: c.primary },
});
