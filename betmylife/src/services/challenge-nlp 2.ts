import { API_URL } from '@/constants/api';

export type ChallengeCategory = 'sleep' | 'exercise' | 'learning' | 'reading' |
  'household' | 'daily_routine' | 'creative' | 'social' | 'other';
export type Operator = 'eq' | 'gte' | 'lte' | 'gt' | 'lt';
export type ChallengeAction = {
  original: string;
  action: string | null;
  object: string | null;
  category: ChallengeCategory | null;
  subcategory: string | null;
  measurements: { original: string; metric: 'distance' | 'activity_duration' |
    'sleep_duration' | 'time_in_bed' | 'count' | 'regularity_tolerance';
    operator: Operator | null; value: number | null; unit: string | null }[];
  completion_condition: string | null;
  times: { original: string; kind: 'event' | 'deadline' | 'interval_start' |
    'interval_end' | 'period_start' | 'period_end'; operator: Operator | null;
    date_text: string | null; clock_time: string | null; date: string | null;
    weekday: string | null; timezone: string | null; day_offset: number | null;
    resolved_at: string | null }[];
  frequency: { original: string; count: number | null; per: 'day' | 'week' | 'month' | null } | null;
  challenge_period: { original: string; value: number | null; unit: 'day' | 'week' | 'month' | null } | null;
  conditions: { indoor_outdoor: 'indoor' | 'outdoor' | null; weather_requirement: string | null };
  clarification_questions: string[];
};
export type ChallengeNlpRequest = { text: string; submitted_at: string; timezone: string };
export type ChallengeNlpResult = {
  data: {
    schema_version: '1.0'; source_text: string;
    context: { submitted_at: string; timezone: string };
    actions: ChallengeAction[];
    user_reported: { difficulty: string | null; confidence_percent: number | null; confidence_original: string | null };
    clarification_questions: string[];
  };
  usage: Record<string, unknown>;
  model: string;
  cached: boolean;
};

// Invoked explicitly by Analyze or posting. Cache and call limits belong to the backend.
export async function analyzeChallenge(input: ChallengeNlpRequest): Promise<ChallengeNlpResult> {
  const url = `${API_URL}/challenge-analyze`;
  console.log('[challenge-nlp] requested', { url, ...input });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(typeof result.detail?.message === 'string' ? result.detail.message : `Analysis failed (${response.status}).`), {
        status: response.status,
        code: result.detail?.code,
        provider_status: result.detail?.provider_status,
      });
    }
    if (result.data?.schema_version !== '1.0' || !Array.isArray(result.data?.actions)) {
      throw new Error('The server returned an incomplete analysis.');
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('Analysis timed out. Try again explicitly.');
      console.error('[challenge-nlp] failed', { url, message: timeoutError.message });
      throw timeoutError;
    }
    console.error('[challenge-nlp] failed', { url, message: error instanceof Error ? error.message : 'Analysis request failed.', error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
