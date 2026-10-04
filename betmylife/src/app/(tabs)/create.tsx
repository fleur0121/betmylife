/**
 * チャレンジ作成画面。タイトル、カテゴリ、難易度、自信度、期限を入力する。
 * フォームの値は画面内の状態で管理し、タイトルを検証してから共有状態へ新しいチャレンジを追加する。
 * 作成後は完了表示からHomeへ移動できる。期限はデモ用の選択肢、AI確率と倍率は固定のモック値。
 */
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
import { ProofPlanCard } from "@/components/proof/proof-plan-card";
import { BrandAsset } from "@/components/brand-asset";
import { useLanguage } from "@/i18n/language";
import type { Category, VerificationPlan, Visibility } from "@/mock/data";
import { demoCapabilities, getFallbackProofPlan } from "@/utils/fallback-proof-plan";
import { parseChallengeDeadline } from "@/utils/predictions";
import { generateProofPlan } from "@/services/proof-service";
import { analyzeChallenge, type ChallengeNlpRequest, type ChallengeNlpResult } from "@/services/challenge-nlp";
import { CHALLENGE_POINT_RULES } from "@/utils/points";
import { useAppState } from "@/state/app-state";
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
  const { dispatch } = useAppState();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("Study");
  const [difficulty, setDifficulty] = useState(3);
  const [confidence, setConfidence] = useState(73);
  const [confidenceWidth, setConfidenceWidth] = useState(1);
  const [deadline, setDeadline] = useState("Tomorrow");
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("19:00");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [proofPlan, setProofPlan] = useState<VerificationPlan | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState("");
  const [showPointsGuide, setShowPointsGuide] = useState(false);
  const [analysis, setAnalysis] = useState<ChallengeNlpResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const analysisContext = useRef<{ key: string; request: ChallengeNlpRequest } | null>(null);
  const currentTitle = useRef(title);
  const analysisInFlight = useRef(false);

  async function analyzeInput() {
    if (analysisInFlight.current || !title.trim()) return;
    const text = title;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) {
      setAnalysisError("Your timezone could not be determined.");
      return;
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
    } catch (error) {
      if (currentTitle.current === text) setAnalysisError(error instanceof Error ? error.message : "Analysis failed. Please try again.");
    } finally {
      analysisInFlight.current = false;
      setAnalyzing(false);
    }
  }

  function getResolvedDeadline() {
    if (deadline !== "Custom") {
      return `${deadline} · ${deadline === "Today" ? "11:59 PM" : "7:00 AM"}`;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate) || !/^\d{2}:\d{2}$/.test(customTime)) {
      return null;
    }
    return `${customDate} · ${customTime}`;
  }

  async function chooseProof() {
    if (title.trim().length < 5) {
      setError(
        "Give your challenge a little more detail (at least 5 characters).",
      );
      return;
    }
    const resolvedDeadline = getResolvedDeadline();
    if (!resolvedDeadline) {
      setError("Enter a valid date and time for your deadline.");
      return;
    }
    setProofLoading(true);
    setProofError("");
    try {
      const input = {
          title: title.trim(),
          category,
          difficulty,
          confidence,
          deadline: resolvedDeadline,
        capabilities: demoCapabilities,
      };
      try {
        setProofPlan(await generateProofPlan(input));
      } catch {
        setProofPlan(getFallbackProofPlan(input));
      }
    } catch {
      setProofError("We could not choose a proof yet. Please try again.");
    } finally {
      setProofLoading(false);
    }
  }

  async function createChallenge() {
    if (!proofPlan || analysisInFlight.current) return;
    const resolvedDeadline = getResolvedDeadline();
    if (!resolvedDeadline) return;
    // Posting explicitly triggers analysis; failures are shown but do not discard the post.
    await analyzeInput();
    dispatch({
      type: "create",
      challenge: {
        id: `local-${Date.now()}`,
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
        proofPlan,
      },
    });
    setCreated(true);
    setTitle("");
    currentTitle.current = "";
    setAnalysis(null);
    analysisContext.current = null;
    setError("");
    setProofPlan(null);
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
            <BrandAsset name="stateChallengeSuccess" style={styles.successArt} label="Challenge success" />
            <Text style={[s.sectionTitle, { textAlign: "center" }]}>
              You’re on the board!
            </Text>
            <Text style={s.muted}>
              Your challenge is live in the mock feed. Let your friends believe
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
                <View style={styles.authorAvatar}><BrandAsset name="mascotCheerful" style={styles.authorMascot} /></View>
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
                  setProofPlan(null);
                }}
                maxLength={1000}
                multiline
                style={styles.input}
              />
              <Text style={[s.caption, { textAlign: "right" }]}>
                {title.length}/1000
              </Text>
              <Button secondary disabled={analyzing || !title.trim()} label={analyzing ? "Analyzing…" : "Analyze"} onPress={() => void analyzeInput()} />
              {!!analysisError && <Text accessibilityRole="alert" style={{ color: c.red }}>{analysisError}</Text>}
              {analysis && <Text style={s.caption}>Analysis complete.</Text>}
              {analysis && [...analysis.data.clarification_questions, ...analysis.data.actions.flatMap((action) => action.clarification_questions)].map((question, index) => (
                <Text key={`${index}-${question}`} translate={false} style={s.caption}>{question}</Text>
              ))}
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: c.red }}>
                  {error}
                </Text>
              )}
              <Text style={s.sectionTitle}>Pick a category</Text>
              <View style={styles.categoryChoices}>
                {([
                  ["Study", "iconStudy", c.sky],
                  ["Fitness", "iconFitness", c.peach],
                  ["Lifestyle", "iconLifestyle", c.mint],
                ] as const).map(([name, asset, color]) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === name }}
                    onPress={() => setCategory(name)}
                    style={({ pressed }) => [styles.categoryCard, { backgroundColor: color }, category === name && styles.categorySelected, pressed && s.pressed]}
                  >
                    <BrandAsset name={asset} style={styles.categoryArt} />
                    <Text style={[styles.categoryLabel, category === name && styles.categoryLabelActive]}>{name}</Text>
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
                    onPress={() => setDifficulty(value)}
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
              <View style={styles.atStake}>
                <Text style={styles.atStakeEyebrow}>POINTS AT STAKE ✦</Text>
                <View style={styles.stakeOutcomes}>
                  <View style={styles.stakeOutcome}><Text style={styles.stakeLabel}>COMPLETE IT</Text><Text style={styles.stakeGain}>+{CHALLENGE_POINT_RULES[difficulty as keyof typeof CHALLENGE_POINT_RULES].success} PT</Text></View>
                  <View style={styles.stakeDivider} />
                  <View style={styles.stakeOutcome}><Text style={styles.stakeLabel}>MISS IT</Text><Text style={styles.stakeLoss}>{CHALLENGE_POINT_RULES[difficulty as keyof typeof CHALLENGE_POINT_RULES].failure} PT</Text></View>
                </View>
                <Text style={styles.stakeFootnote}>Higher difficulty means a bigger reward and more at risk.</Text>
              </View>
            </Card>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPointsGuide }} onPress={() => setShowPointsGuide(!showPointsGuide)}>
              <Text style={styles.pointsGuideToggle}>✦ HOW POINTS WORK {showPointsGuide ? "−" : "+"}</Text>
            </Pressable>
            {showPointsGuide && <Card style={styles.pointsGuide}>
              <Text style={s.sectionTitle}>HOW POINTS WORK ✦</Text>
              <View style={styles.guideHead}><Text style={styles.guideColumn}>DIFFICULTY</Text><Text style={styles.guideColumn}>COMPLETE</Text><Text style={styles.guideColumn}>MISS</Text></View>
              {[1, 2, 3, 4, 5].map((level) => <View key={level} style={styles.guideRow}><Text style={styles.guideCell}>{"★".repeat(level)}{"☆".repeat(5 - level)}</Text><Text style={[styles.guideCell, { color: c.primary }]}>+{CHALLENGE_POINT_RULES[level as keyof typeof CHALLENGE_POINT_RULES].success} PT</Text><Text style={[styles.guideCell, { color: c.red }]}>{CHALLENGE_POINT_RULES[level as keyof typeof CHALLENGE_POINT_RULES].failure} PT</Text></View>)}
              <Text style={s.caption}>Correct prediction: stake × locked odds. Wrong prediction: lose the stake.</Text>
              <Text style={s.caption}>Spend PT on frames, badges, backgrounds and titles. Points have no cash value.</Text>
            </Card>}
            <Card>
              <Text style={s.sectionTitle}>How confident are you?</Text>
                <View style={styles.confidenceHeader}>
                  <Text style={s.caption}>0%</Text>
                  <Text accessibilityLiveRegion="polite" style={styles.percent}>
                    {confidence}%
                  </Text>
                  <Text style={s.caption}>100%</Text>
                </View>
                <Pressable
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("Confidence")}
                  accessibilityValue={{ min: 0, max: 100, now: confidence }}
                  onLayout={(event) => setConfidenceWidth(event.nativeEvent.layout.width)}
                  onStartShouldSetResponder={() => true}
                  onResponderMove={(event) => {
                    const next = Math.round((event.nativeEvent.locationX / confidenceWidth) * 100);
                    setConfidence(Math.max(0, Math.min(100, next)));
                  }}
                  onPress={(event) => {
                    const next = Math.round((event.nativeEvent.locationX / confidenceWidth) * 100);
                    setConfidence(Math.max(0, Math.min(100, next)));
                  }}
                  style={({ pressed }) => [styles.confidenceTrack, pressed && s.pressed]}
                >
                  <View style={[styles.confidenceFill, { width: `${confidence}%` }]} />
                  <View style={[styles.confidenceThumb, { left: `${confidence}%` }]} />
                </Pressable>
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
                  setProofPlan(null);
                }}
              />
              {deadline === "Custom" ? (
                <View style={styles.customDeadline}>
                  <TextInput
                    accessibilityLabel={t("Deadline date")}
                    placeholder={t("YYYY-MM-DD")}
                    placeholderTextColor={c.muted}
                    value={customDate}
                    onChangeText={(value) => { setCustomDate(value); setProofPlan(null); }}
                    keyboardType="numbers-and-punctuation"
                    style={styles.deadlineInput}
                  />
                  <TextInput
                    accessibilityLabel={t("Deadline time")}
                    placeholder={t("HH:MM")}
                    placeholderTextColor={c.muted}
                    value={customTime}
                    onChangeText={(value) => { setCustomTime(value); setProofPlan(null); }}
                    keyboardType="numbers-and-punctuation"
                    style={styles.deadlineInput}
                  />
                </View>
              ) : (
                <Text style={s.caption}>◷ {getResolvedDeadline()} · local time</Text>
              )}
            </Card>
            {proofLoading && (
              <Card style={styles.loadingCard}>
                <BrandAsset name="statePredicting" style={styles.loadingArt} label="Choosing your proof plan" />
                <View style={s.flex}>
                  <Text style={s.sectionTitle}>Choosing your best proof…</Text>
                  <Text style={s.muted}>Matching your goal to a simple way to verify it.</Text>
                </View>
              </Card>
            )}
            {!!proofError && (
              <Text accessibilityRole="alert" style={{ color: c.red }}>
                {proofError}
              </Text>
            )}
            {proofPlan && !proofLoading && !analyzing && (
              <ProofPlanCard
                plan={proofPlan}
                onConfirm={() => void createChallenge()}
                onChangePlan={setProofPlan}
              />
            )}
            {!proofPlan && !proofLoading && (
              <Button
                label="Choose My Proof  ✦"
                onPress={() => void chooseProof()}
              />
            )}
            <Text style={[s.caption, { textAlign: "center" }]}>
              Visible to your friends · Demo data resets on reload
            </Text>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  successArt: { alignSelf: "center", width: 152, height: 118 },
  loadingCard: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 12 },
  atStake: { marginTop: 15, borderRadius: 17, backgroundColor: c.lavenderLight, padding: 12, borderWidth: 1, borderColor: "#E8E1FF" },
  atStakeEyebrow: { color: c.primaryDark, fontSize: 9, letterSpacing: 0.8, fontWeight: "900" },
  stakeOutcomes: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  stakeOutcome: { flex: 1, gap: 2 },
  stakeDivider: { width: 1, height: 31, backgroundColor: "#D6CCF5", marginHorizontal: 12 },
  stakeLabel: { color: c.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  stakeGain: { color: c.primary, fontSize: 21, fontWeight: "900" },
  stakeLoss: { color: c.red, fontSize: 21, fontWeight: "900" },
  stakeFootnote: { color: c.muted, fontSize: 9, marginTop: 5 },
  pointsGuideToggle: { alignSelf: "center", color: c.primaryDark, fontSize: 10, fontWeight: "900", padding: 10 },
  pointsGuide: { gap: 8 },
  guideHead: { flexDirection: "row", paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: c.border },
  guideRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  guideColumn: { flex: 1, color: c.muted, fontSize: 8, fontWeight: "900", textAlign: "center" },
  guideCell: { flex: 1, color: c.text, fontSize: 9, fontWeight: "800", textAlign: "center" },
  loadingArt: { width: 72, height: 64 },
  authorAvatar: { width: 42, height: 42, borderRadius: 24, overflow: "hidden", backgroundColor: c.lavender, alignItems: "center", justifyContent: "center" },
  authorMascot: { width: 44, height: 44 },
  categoryChoices: { flexDirection: "row", gap: 8 },
  categoryCard: { flex: 1, minHeight: 88, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  categorySelected: { borderColor: c.primary },
  categoryArt: { width: 44, height: 44 },
  categoryLabel: { marginTop: -2, color: c.text, fontSize: 10, fontWeight: "800" },
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
  level: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: c.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  confidenceHeader: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confidenceTrack: { height: 32, justifyContent: "center", position: "relative" },
  confidenceFill: { height: 9, borderRadius: 8, backgroundColor: c.primary },
  confidenceThumb: { position: "absolute", top: 8, width: 16, height: 16, marginLeft: -8, borderRadius: 10, backgroundColor: c.primaryDark, borderWidth: 3, borderColor: c.card },
  customDeadline: { flexDirection: "row", gap: 8 },
  deadlineInput: { flex: 1, minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.background, color: c.text, fontSize: 15 },
  percent: { fontSize: 40, fontWeight: "800", color: c.primary },
});
