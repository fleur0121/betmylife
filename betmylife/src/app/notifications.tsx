import { Button, Card, Screen, s } from "@/components/ui-kit";
import { Text } from "@/components/localized-text";
import { API_URL } from "@/constants/api";
import { useAppState } from "@/state/app-state";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View } from "react-native";

type FriendRequest = {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_username: string;
};

export default function Notifications() {
  const { state, dispatch } = useAppState();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    if (!state.authUserId) return;
    try {
      const response = await fetch(`${API_URL}/users/${state.authUserId}/friend-requests`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not load friend requests.");
      setRequests(body);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load friend requests.");
    }
  }, [state.authUserId]);

  useFocusEffect(useCallback(() => {
    void loadRequests();
  }, [loadRequests]));

  async function respond(requestId: string, decision: "accept" | "decline") {
    if (!state.authUserId) return;
    const response = await fetch(`${API_URL}/users/${state.authUserId}/friend-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.detail ?? "Could not respond to friend request.");
      return;
    }
    if (decision === "accept") {
      const following = await fetch(`${API_URL}/users/${state.authUserId}/following`).then((result) => result.json());
      dispatch({ type: "set-following-ids", ids: following.followed_ids ?? [] });
    }
    setRequests((items) => items.filter((item) => item.id !== requestId));
  }

  return (
    <Screen title="Notifications" back>
      <Card>
        <Text style={s.sectionTitle}>Friend requests</Text>
        {!!error && <Text accessibilityRole="alert" style={{ color: "#C44D5D" }}>{error}</Text>}
        {!requests.length && <Text style={s.muted}>No pending friend requests.</Text>}
        <View style={{ gap: 12 }}>
          {requests.map((request) => (
            <View key={request.id} style={{ gap: 8 }}>
              <Text style={s.bold}>{request.requester_name} @{request.requester_username}</Text>
              <View style={s.row}>
                <Button label="Accept" onPress={() => void respond(request.id, "accept")} />
                <Button secondary label="Decline" onPress={() => void respond(request.id, "decline")} />
              </View>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
