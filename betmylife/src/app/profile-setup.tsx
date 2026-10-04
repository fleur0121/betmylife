import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/localized-text";
import { Button, Card, Screen } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useAppState } from "@/state/app-state";
import { API_URL } from "@/constants/api";

const genders = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "other", label: "その他" },
] as const;

export default function ProfileSetup() {
  const { state } = useAppState();
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<(typeof genders)[number]["value"] | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    const numericAge = Number(age);
    if (!state.authUserId || !nickname.trim() || !Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120 || !gender) {
      setError("nickname、1〜120歳のage、性別を入力してください。");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/${state.authUserId}/profile/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), age: numericAge, gender }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Profileの保存に失敗しました。");
      router.replace("/(tabs)");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "接続できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Set up your profile">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ONE LAST LITTLE THING</Text>
        <Text style={styles.title}>Tell us about you.</Text>
        <Text style={styles.copy}>This helps your profile feel like yours.</Text>
      </View>
      <Card>
        <Text style={styles.label}>NICKNAME</Text>
        <TextInput value={nickname} onChangeText={setNickname} placeholder="What should we call you?" placeholderTextColor={c.muted} style={styles.input} />
        <Text style={styles.label}>AGE</Text>
        <TextInput value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Your age" placeholderTextColor={c.muted} style={styles.input} />
        <Text style={styles.label}>GENDER</Text>
        <View style={styles.genderRow}>
          {genders.map((item) => (
            <Pressable key={item.value} onPress={() => setGender(item.value)} style={[styles.gender, gender === item.value && styles.genderSelected]}>
              <Text style={[styles.genderText, gender === item.value && styles.genderTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={loading ? "Saving…" : "Continue"} onPress={submit} disabled={loading} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: 26, gap: 6 },
  eyebrow: { color: c.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: c.text, fontSize: 27, fontWeight: "900" },
  copy: { color: c.muted, fontSize: 12 },
  label: { color: c.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginTop: 8 },
  input: { color: c.text, borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 11, fontSize: 15, marginBottom: 10 },
  genderRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 20 },
  gender: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center", backgroundColor: c.cream, borderWidth: 1, borderColor: c.border },
  genderSelected: { backgroundColor: c.primary, borderColor: c.primary },
  genderText: { color: c.text, fontWeight: "800" },
  genderTextSelected: { color: "#FFFFFF" },
  error: { color: "#C44D5D", fontSize: 11, marginBottom: 10 },
});
