import { API_URL } from "@/constants/api";
import type { ChallengeOutcome } from "@/utils/predictions";

export async function recordChallengeResult(
      userId: string,
      challengeId: string,
      outcome: ChallengeOutcome,
) {
      const response = await fetch(
            `${API_URL}/users/${userId}/challenges/${challengeId}/result`,
            {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ outcome }),
            },
      );
      const body = await response.json();
      if (!response.ok) {
            throw new Error(body.detail ?? `Result sync failed (${response.status}).`);
      }
      return body as { observation_id: string; created: boolean };
}