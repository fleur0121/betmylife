import { BADGE_BY_ID } from "@/achievements/badges";
import { Text } from "@/components/localized-text";
import { palette as c } from "@/constants/design";
import { useAppState } from "@/state/app-state";
import { Image } from "expo-image";
import { Modal, Pressable, StyleSheet, View } from "react-native";

export function AchievementToast() {
  const { state, dispatch } = useAppState();
  const badgeId = state.badgeNotifications[0];
  const badge = badgeId ? BADGE_BY_ID[badgeId] : undefined;
  return (
    <Modal
      animationType="fade"
      transparent
      visible={Boolean(badge)}
      onRequestClose={() => badgeId && dispatch({ type: "dismiss-badge-notification", badgeId })}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {badge && <Image source={badge.image} contentFit="contain" style={styles.art} />}
          <Text style={styles.eyebrow}>🏆 BADGE UNLOCKED</Text>
          <Text style={styles.name}>{badge?.name}</Text>
          <Text style={styles.description}>{badge?.description}</Text>
          <Text style={styles.reward}>+{badge?.rewardPoints} PT</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => badgeId && dispatch({ type: "dismiss-badge-notification", badgeId })}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.buttonText}>Nice!</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 24, backgroundColor: "rgba(23,26,39,0.42)", alignItems: "center", justifyContent: "center" },
  card: { width: "100%", maxWidth: 340, borderRadius: 26, padding: 22, alignItems: "center", backgroundColor: c.card },
  art: { width: 128, height: 128, marginBottom: 8 },
  eyebrow: { color: c.primaryDark, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  name: { color: c.text, fontSize: 23, fontWeight: "900", textAlign: "center", marginTop: 7 },
  description: { color: c.muted, textAlign: "center", fontSize: 13, marginTop: 4 },
  reward: { color: c.primaryDark, fontSize: 21, fontWeight: "900", marginTop: 12 },
  button: { width: "100%", minHeight: 46, marginTop: 16, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.primary },
  buttonText: { color: "#FFFFFF", fontWeight: "900" },
});
