/**
 * チャレンジ作成画面。タイトル、カテゴリ、難易度、自信度、期限を入力する。
 * フォームの値は画面内の状態で管理し、タイトルを検証してから共有状態へ新しいチャレンジを追加する。
 * 作成後は完了表示からHomeへ移動できる。期限はデモ用の選択肢、AI確率と倍率は固定のモック値。
 */
import { Text } from "@/components/localized-text";
import {
    Avatar,
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
import { useAppState } from "@/state/app-state";
import { router } from "expo-router";
import { useState } from "react";
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
  const [category, setCategory] = useState<Category>("Lifestyle");
  const [difficulty, setDifficulty] = useState(3);
  const [confidence, setConfidence] = useState(80);
  const [deadline, setDeadline] = useState("Tomorrow");
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("public");
  function createChallenge() {
    if (title.trim().length < 5) {
      setError(
        "Give your challenge a little more detail (at least 5 characters).",
      );
      return;
    }
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
        deadline: `${deadline} · ${deadline === "Today" ? "11:59 PM" : "7:00 AM"}`,
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
            <Text style={{ fontSize: 45, textAlign: "center" }}>🎉</Text>
            <Text style={[s.sectionTitle, { textAlign: "center" }]}>
              You’re on the board!
            </Text>
            <Text style={s.muted}>
              Your challenge is live in the mock feed. Let your friends believe
              in you.
            </Text>
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
                <Avatar emoji="🌷" size={40} />
                <View>
                  <Text translate={false} style={s.bold}>
                    Fuka
                  </Text>
                  <Text style={s.caption}>Visible to your friends</Text>
                </View>
              </View>
              <TextInput
                accessibilityLabel={t("Challenge title")}
                placeholder={t("e.g. Wake up before 7 AM tomorrow")}
                placeholderTextColor={c.muted}
                value={title}
                onChangeText={(text) => {
                  setTitle(text);
                  setError("");
                }}
                maxLength={100}
                multiline
                style={styles.input}
              />
              <Text style={[s.caption, { textAlign: "right" }]}>
                {title.length}/100
              </Text>
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: c.red }}>
                  {error}
                </Text>
              )}
              <Text style={s.sectionTitle}>Pick a category</Text>
              <Segments
                options={["Study", "Fitness", "Lifestyle"] as const}
                value={category}
                onChange={setCategory}
              />
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
            </Card>
            <Card>
              <Text style={s.sectionTitle}>How confident are you?</Text>
              <View style={styles.confidence}>
                <Button
                  label="−"
                  secondary
                  disabled={confidence === 0}
                  onPress={() =>
                    setConfidence((value) => Math.max(0, value - 10))
                  }
                />
                <Text accessibilityLiveRegion="polite" style={styles.percent}>
                  {confidence}%
                </Text>
                <Button
                  label="+"
                  secondary
                  disabled={confidence === 100}
                  onPress={() =>
                    setConfidence((value) => Math.min(100, value + 10))
                  }
                />
              </View>
              <Text style={[s.caption, { textAlign: "center" }]}>
                Trust your gut. There’s no wrong answer.
              </Text>
            </Card>
            <Card>
              <Text style={s.sectionTitle}>Set your finish line</Text>
              <Segments
                options={["Today", "Tomorrow", "In 3 days"]}
                value={deadline}
                onChange={setDeadline}
              />
              <Text style={s.caption}>
                ◷ {deadline} at {deadline === "Today" ? "11:59 PM" : "7:00 AM"}{" "}
                · local time
              </Text>
            </Card>
            <Button label="Create Challenge  ✦" onPress={createChallenge} />
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
  confidence: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  percent: { fontSize: 40, fontWeight: "800", color: c.primary },
});
