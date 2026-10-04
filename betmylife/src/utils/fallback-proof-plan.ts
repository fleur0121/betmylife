import type {
  AppCapabilities,
  ProofMethod,
  ProofRequirement,
  VerificationPlan,
} from '@/mock/data';

export const DEMO_PROOF_MODE = true;
export const demoCapabilities: AppCapabilities = {
  photo: true,
  liveCamera: true,
  beforeAfter: true,
  timer: true,
  focusSession: true,
  aiQuiz: true,
  textArtifact: true,
  wordCount: true,
  friendWitness: true,
  checkpoint: true,
  location: true,
  screenTime: true,
  healthSteps: true,
  healthSleep: true,
  healthWorkout: true,
};
export const liveCapabilities: AppCapabilities = {
  photo: true,
  liveCamera: true,
  beforeAfter: true,
  timer: true,
  focusSession: true,
  aiQuiz: false,
  textArtifact: true,
  wordCount: true,
  friendWitness: true,
  checkpoint: true,
  location: false,
  screenTime: false,
  healthSteps: false,
  healthSleep: false,
  healthWorkout: false,
};

type ProofInput = {
  title: string;
  category: string;
  difficulty: number;
  confidence: number;
  deadline: string;
};

function requirement(
  id: string,
  method: ProofMethod,
  label: string,
  instructions: string,
  config: ProofRequirement['config'] = {},
): ProofRequirement {
  return { id, method, label, instructions, required: true, config };
}

function strength(methods: ProofMethod[]) {
  if (methods.some((method) => method.startsWith('health') || method === 'screen_time')) return 'strong' as const;
  if (methods.length > 1 || methods.some((method) => method !== 'self_report')) return 'medium' as const;
  return 'basic' as const;
}

function supports(method: ProofMethod, capabilities: AppCapabilities) {
  if (method === 'photo' || method === 'timer') return capabilities[method];
  if (method === 'live_camera') return capabilities.liveCamera;
  if (method === 'before_after') return capabilities.beforeAfter;
  if (method === 'focus_session') return capabilities.focusSession;
  if (method === 'ai_quiz') return capabilities.aiQuiz;
  if (method === 'text_artifact') return capabilities.textArtifact;
  if (method === 'word_count') return capabilities.wordCount;
  if (method === 'friend_witness') return capabilities.friendWitness;
  if (method === 'checkpoint') return capabilities.checkpoint;
  if (method === 'duration') return capabilities.timer;
  if (method === 'location') return capabilities.location;
  if (method === 'screen_time') return capabilities.screenTime;
  if (method === 'health_steps') return capabilities.healthSteps;
  if (method === 'health_sleep') return capabilities.healthSleep;
  if (method === 'health_workout' || method === 'distance') return capabilities.healthWorkout;
  return true;
}

function plan(
  category: string,
  title: string,
  summary: string,
  requirements: ProofRequirement[],
  explanation: string,
  capabilities: AppCapabilities,
): VerificationPlan {
  const supported = requirements.filter((item) => supports(item.method, capabilities));
  const finalRequirements = supported.length
    ? supported
    : [requirement('quick-check', 'self_report', 'Quick Check', 'Confirm whether you completed this challenge.')];
  return {
    category,
    title,
    summary,
    logic: 'all',
    requirements: finalRequirements,
    explanation: finalRequirements.length === requirements.length
      ? explanation
      : 'A simple fallback is included because some proof methods are unavailable.',
    verificationStrength: strength(finalRequirements.map((item) => item.method)),
    fallbackAllowed: true,
  };
}

export function getFallbackProofPlan(
  input: ProofInput,
  capabilities: AppCapabilities = DEMO_PROOF_MODE ? demoCapabilities : liveCapabilities,
): VerificationPlan {
  const title = input.title.toLowerCase();
  const durationMatch = title.match(/(\d+)\s*(minutes?|mins?|hours?|hrs?)/);
  const minutes = durationMatch
    ? Number(durationMatch[1]) * (/hours?|hrs?/.test(durationMatch[2]) ? 60 : 1)
    : undefined;

  if (/wake|wake up|起き/.test(title) && /before|7|朝/.test(title)) {
    return plan('routine', 'THE LIVE CHECK', 'Capture a live morning check-in before the deadline.', [
      requirement('live-check-in', 'live_camera', 'Morning Check-In', 'Take a new live check-in photo before the deadline.', { requireLiveCapture: true }),
    ], 'A live timestamped capture verifies that the user interacted before the deadline.', capabilities);
  }
  if (/clean|organize|整理|掃除/.test(title)) {
    return plan('transformation', 'THE TRANSFORMATION', 'Show the change from before to after.', [
      requirement('before-after', 'before_after', 'Before & After', 'Take one photo before and one after the transformation.', { minimumPhotos: 2, requireLiveCapture: true }),
    ], 'Comparing two images makes visible transformation more meaningful than self-report.', capabilities);
  }
  const wordTarget = title.match(/(\d[\d,]*)\s*words?/);
  if (/write|essay|journal|notes|文章|エッセイ/.test(title) && wordTarget) {
    const words = Number(wordTarget[1].replace(',', ''));
    return plan('writing', 'ARTIFACT VERIFIED', 'Submit your writing and reach the target word count.', [
      requirement('text-artifact', 'text_artifact', 'Writing Artifact', 'Paste the writing you completed.', {}),
      requirement('word-count', 'word_count', 'Word Count', `Reach at least ${words} words.`, { minimumWordCount: words }),
    ], 'The submitted artifact and an objective word count verify the writing goal.', capabilities);
  }
  if (/meet|lunch with|coffee with|昼食|会う/.test(title)) {
    return plan('social', 'FRIEND CONFIRMED', 'Ask a friend to confirm the shared activity.', [
      requirement('friend-witness', 'friend_witness', 'Friend Witness', 'Choose a friend to confirm this challenge.', { witnessCount: 1 }),
      requirement('live-social-check', 'live_camera', 'Live Social Check', 'Take a new photo during the activity.', { requireLiveCapture: true }),
    ], 'Social challenges are stronger when a friend confirms the shared activity.', capabilities);
  }
  if (/water|drink|times today|times this week|checkpoint|水|回/.test(title)) {
    const count = Number(title.match(/(\d+)\s*times?/)?.[1] ?? 4);
    return plan('habit', 'CHECKPOINT RUN', `Complete ${count} checkpoints during the challenge.`, [
      requirement('checkpoints', 'checkpoint', 'Habit Checkpoints', 'Check in each time you complete the habit.', { checkpointCount: count }),
    ], 'Repeated checkpoints fit a habit that happens more than once.', capabilities);
  }

  if (/instagram|tiktok|youtube|screen\s*time|app usage/.test(title)) {
    return plan('digital_wellbeing', 'SCREEN TIME CHECK', 'Keep app usage below your daily limit.', [
      requirement('screen-time', 'screen_time', 'App Screen Time', 'Verify today\'s usage stays below the limit.', {
        appName: title.match(/instagram|tiktok|youtube/)?.[0],
        maximumMinutes: minutes ?? 60,
      }),
    ], 'App usage data directly measures this challenge.', capabilities);
  }
  if (/\bsteps?\b|歩/.test(title)) {
    const value = Number(title.match(/(\d[\d,]*)\s*steps?/)?.[1]?.replace(',', '') ?? 10000);
    return plan('fitness', 'CHECKPOINT RUN', `Reach at least ${value.toLocaleString()} recorded steps today.`, [
      requirement('steps', 'health_steps', 'Step Count', 'Reach the step goal recorded by your health data.', { minimumSteps: value }),
    ], 'Health step data directly measures this goal.', capabilities);
  }
  if (/sleep|寝|睡眠/.test(title)) {
    const sleepMinutes = minutes ?? 480;
    return plan('sleep', 'REST WELL', `Record at least ${sleepMinutes / 60} hours of sleep.`, [
      requirement('sleep', 'health_sleep', 'Sleep Duration', 'Record the required sleep duration.', { minimumSleepMinutes: sleepMinutes }),
    ], 'Sleep data is more reliable than screen time for measuring rest.', capabilities);
  }
  const distance = title.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?|miles?)/);
  if (/run|走/.test(title) && distance) {
    const meters = Number(distance[1]) * (/miles?/.test(distance[2]) ? 1609.34 : 1000);
    return plan('fitness', 'DISTANCE VERIFIED', `Complete a ${distance[1]} ${distance[2]} run.`, [
      requirement('run-distance', 'distance', 'Run Distance', 'Verify the distance recorded by your workout data.', {
        minimumDistanceMeters: meters,
        workoutType: 'running',
      }),
    ], 'Workout distance directly measures this running goal.', capabilities);
  }
  const timerGoal = /study|read|learn|workout|exercise|meditat|勉強|読書|運動/.test(title);
  if (minutes && timerGoal) {
    return plan(input.category.toLowerCase(), 'KNOW IT TO PROVE IT', `Complete a ${minutes} minute focused session and pass a quick knowledge check.`, [
      requirement('focus-session', 'focus_session', 'Focus Session', 'Complete the focused session before the deadline.', { minimumMinutes: minutes }),
      requirement('knowledge-check', 'ai_quiz', 'Knowledge Check', 'Pass a short challenge-specific quiz after the session.', { quizQuestionCount: 3, quizPassingScore: 2 }),
    ], 'Focused time plus a lightweight knowledge check is stronger than elapsed time alone.', capabilities);
  }
  if (minutes && /gym|library|ジム|図書館/.test(title)) {
    const library = /library|図書館/.test(title);
    return plan(input.category.toLowerCase(), 'SHOW UP & STAY', `Stay at your selected ${library ? 'library' : 'gym'} for ${minutes} minutes.`, [
      requirement('place', 'location', library ? 'Library Check-In' : 'Gym Check-In', 'Verify that you are at the selected place.', { radiusMeters: 150 }),
      requirement('duration', library ? 'focus_session' : 'duration', library ? 'Study Focus Session' : 'Stay Duration', `Complete ${minutes} minutes there.`, { minimumMinutes: minutes }),
    ], 'Both place and duration are relevant to this challenge.', capabilities);
  }
  if (/cook|cooking|meal|dinner|clean|organize|make|build|gym|assignment|homework|project|料理|掃除/.test(title)) {
    return plan(input.category.toLowerCase(), 'SHOW IT LIVE', 'Capture what you accomplished inside the app.', [
      requirement('live-progress', 'live_camera', 'Live Progress Capture', 'Take a new photo of what you accomplished.', { minimumPhotos: 1, requireLiveCapture: true }),
    ], 'A photo is a useful way to show visible progress.', capabilities);
  }
  return plan(input.category.toLowerCase(), 'QUICK CHECK', 'Confirm whether you completed this challenge.', [
    requirement('self-report', 'self_report', 'Quick Check', 'Confirm whether you completed this challenge.'),
  ], 'Self report is used only when no supported method reasonably measures the goal.', capabilities);
}