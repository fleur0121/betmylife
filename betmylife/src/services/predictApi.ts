// predictApi.ts
// Calls the Predict My Life ML API (main.py) from the Expo app.
//
// Setup:
//   1. Put this file in src/lib/predictApi.ts (or wherever your utils live)
//   2. Add to .env:   EXPO_PUBLIC_ML_API_URL=http://localhost:8000
//      (localhost works in Nox after `adb reverse tcp:8000 tcp:8000`;
//       otherwise use your PC's IP, e.g. http://192.168.1.23:8000)
//   3. Restart Expo: npx expo start -c

const API_URL = process.env.EXPO_PUBLIC_ML_API_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 8000;

// ---------- Types (match main.py) ----------

export type GoalType = "amount" | "deadline" | "start_time" | "task";

export interface RecordCount {
  attempts: number;
  successes: number;
}

/** Past results, counted from Supabase (finished challenges only). All optional. */
export interface History {
  user_overall?: RecordCount;        // this user, all categories
  user_category?: RecordCount;       // this user, this category
  user_subgoal?: RecordCount;        // this user, this category + goal_type
  community_category?: RecordCount;  // all users, this category
  community_subgoal?: RecordCount;   // all users, this category + goal_type
  current_streak?: number;           // successes in a row in this category
  usual_value?: number | null;       // user's usual level (steps, minutes or clock hour)
}

export interface PredictRequest {
  category: string;                  // "wake_up", "study", "cook", "steps", "exercise", "sleep", or a new one
  is_new_category?: boolean;
  goal_type?: GoalType;              // omit to let the API infer it
  target_hour?: number;              // 0-23, deadline (or start) hour
  goal_value?: number;               // e.g. 10000 (steps), 2 (hours)
  goal_unit?: "steps" | "minutes" | "hours";
  deadline_date?: string;            // "YYYY-MM-DD" - the day the challenge HAPPENS
  day_of_week?: number;              // 0 = Mon ... 6 = Sun (overrides deadline_date)
  difficulty?: number;               // 1-5, self-rated; omit to auto-calculate
  user_confidence?: number;          // 0-1 (80% -> 0.8)
  history?: History;
}

export interface PredictResponse {
  success_probability: number;       // 0-1
  yes_odds: number;
  no_odds: number;
  model_version: string;
  prediction_source: "trained_category" | "community_category" | "user_traits_only";
  category: string;
  category_known: boolean;
  goal_type: GoalType;
  difficulty_used: number;
  difficulty_source: "user" | "auto" | "default";
  breakdown: {
    starting_rate: number;
    starting_from: string;
    adjustment_today: number;
    adjustment_confidence: number;
  };
}

// ---------- Helpers ----------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok) {
      // FastAPI validation errors come back as 422 with a "detail" field
      const body = await res.text();
      throw new Error(`ML API ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`ML API timed out - is it running at ${API_URL}?`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Local date as "YYYY-MM-DD" (toISOString() would use UTC and can give the wrong day). */
export function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- API calls ----------

export function predict(req: PredictRequest): Promise<PredictResponse> {
  return request<PredictResponse>("/predict", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function checkHealth(): Promise<{ status: string; model_version: string }> {
  return request("/health");
}

export function getCategories(): Promise<{
  known_categories: string[];
  category_success_rate: Record<string, number>;
  goal_types: GoalType[];
}> {
  return request("/categories");
}
