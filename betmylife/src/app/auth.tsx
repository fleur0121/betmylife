import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { BrandAsset } from "@/components/brand-asset";
import { Text } from "@/components/localized-text";
import { Button, Card, Screen } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import { useAppState } from "@/state/app-state";
import { API_URL } from "@/constants/api";

export default function AuthScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"register" | "login">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { dispatch } = useAppState();

  async function submit() {
    setError("");
    if (username.length < 3 || password.length < 4) {
      setError("Usernameは3文字以上、Passwordは4文字以上で入力してください。");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "認証に失敗しました。");
      dispatch({ type: "login", userId: body.user_id });
      router.replace(body.profile_complete ? "/(tabs)" : "/profile-setup");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "接続できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="Predict My Life">
      <View style={styles.hero}>
        <BrandAsset name="mascotCheerful" style={styles.mascot} />
        <Text style={styles.eyebrow}>YOUR LIFE, YOUR ODDS</Text>
        <Text style={styles.title}>{mode === "register" ? "Make a little promise." : "Welcome back."}</Text>
        <Text style={styles.copy}>Predict your everyday wins with friends.</Text>
      </View>
      <Card>
        <Text style={styles.label}>USERNAME</Text>
        <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="user name" placeholderTextColor={c.muted} style={styles.input} />
        <Text style={styles.label}>PASSWORD</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="at least 4 characters" placeholderTextColor={c.muted} style={styles.input} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={loading ? "Connecting…" : mode === "register" ? "Create my account" : "Log in"} onPress={submit} disabled={loading} />
        {loading && <ActivityIndicator color={c.primary} style={styles.loader} />}
        <Pressable
          onPress={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}
          style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.switch}>{mode === "register" ? "Back to login" : "Create a new account"}</Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: 22, gap: 6 },
  mascot: { width: 130, height: 112 },
  eyebrow: { color: c.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: c.text, fontSize: 27, fontWeight: "900", textAlign: "center", letterSpacing: -0.8 },
  copy: { color: c.muted, fontSize: 12 },
  label: { color: c.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginTop: 8 },
  input: { color: c.text, borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 11, fontSize: 15, marginBottom: 10 },
  error: { color: "#C44D5D", fontSize: 11, marginBottom: 10 },
  loader: { marginTop: 10 },
  secondaryAction: { marginTop: 4, paddingVertical: 8 },
  switch: { color: c.primary, textAlign: "center", fontSize: 11, fontWeight: "800", marginTop: 16 },
});
