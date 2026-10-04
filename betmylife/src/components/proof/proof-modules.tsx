import { Text } from "@/components/localized-text";
import { Button, Card, ProgressBar, Segments, s } from "@/components/ui-kit";
import { palette as c } from "@/constants/design";
import type { ProofRequirement } from "@/mock/data";
import { friendDirectory } from "@/mock/friends";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { AppState, Image, StyleSheet, TextInput, View } from "react-native";

export type ProofModuleResult = {
  passed: boolean;
  source: "demo" | "user";
  explanation?: string;
};

export function LiveCameraProof({
  onComplete,
}: {
  onComplete: (result: ProofModuleResult) => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  async function capture() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;
    setUri(result.assets[0].uri);
    onComplete({
      passed: true,
      source: "user",
      explanation: "A new in-app capture was submitted.",
    });
  }
  return (
    <Card>
      <Text style={s.sectionTitle}>LIVE CHECK-IN 📷</Text>
      <Text style={s.muted}>Capture new evidence inside the app.</Text>
      {uri && <Image source={{ uri }} style={styles.preview} />}
      <Button
        label={uri ? "Retake live check-in" : "Take live check-in"}
        onPress={() => void capture()}
      />
    </Card>
  );
}

export function BeforeAfterProof({
  onComplete,
}: {
  onComplete: (result: ProofModuleResult) => void;
}) {
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  async function capture(kind: "before" | "after") {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    if (kind === "before") setBefore(uri);
    else {
      setAfter(uri);
      if (before)
        onComplete({
          passed: true,
          source: "user",
          explanation: "Before and after captures are ready for comparison.",
        });
    }
  }
  return (
    <Card>
      <Text style={s.sectionTitle}>THE TRANSFORMATION ↔</Text>
      <View style={styles.images}>
        <View style={s.flex}>
          <Text style={s.caption}>BEFORE</Text>
          {before && <Image source={{ uri: before }} style={styles.preview} />}
        </View>
        <View style={s.flex}>
          <Text style={s.caption}>AFTER</Text>
          {after && <Image source={{ uri: after }} style={styles.preview} />}
        </View>
      </View>
      <Button
        secondary={!before}
        label={before ? "Take after photo" : "Take before photo"}
        onPress={() => void capture(before ? "after" : "before")}
      />
    </Card>
  );
}

export function FocusSessionProof({
  requirement,
  onComplete,
}: {
  requirement: ProofRequirement;
  onComplete: (result: ProofModuleResult) => void;
}) {
  const target = requirement.config.minimumMinutes ?? 1;
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (next) => {
      if (next !== "active") setRunning(false);
    });
    return () => listener.remove();
  }, []);
  const completed = seconds >= target * 60;
  return (
    <Card>
      <Text style={s.sectionTitle}>FOCUS SESSION 🎯</Text>
      <Text style={s.muted}>
        Stay in the app while you focus. Backgrounding pauses the session.
      </Text>
      <Text style={styles.timer}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </Text>
      <ProgressBar value={Math.min(100, (seconds / (target * 60)) * 100)} />
      <Text style={s.caption}>
        Goal: {target} MIN · Interruptions pause progress
      </Text>
      {!completed && (
        <Button
          label={running ? "Pause" : "Start focus"}
          onPress={() => setRunning((value) => !value)}
        />
      )}
      {__DEV__ && !completed && (
        <Button
          secondary
          label="Complete demo session"
          onPress={() => {
            setSeconds(target * 60);
            setRunning(false);
          }}
        />
      )}
      {completed && (
        <Button
          label="Focus session complete ✓"
          onPress={() => onComplete({ passed: true, source: "user" })}
        />
      )}
    </Card>
  );
}

const quizQuestions = [
  {
    question: "What is the best way to review a new idea?",
    options: ["Explain it in your own words", "Ignore it", "Guess randomly"],
    answer: 0,
  },
  {
    question: "What helps retain a concept?",
    options: ["Active recall", "Never revisiting it", "Only highlighting"],
    answer: 0,
  },
  {
    question: "What should a useful study note contain?",
    options: ["A clear idea", "Only decoration", "No context"],
    answer: 0,
  },
];
export function AiQuizProof({
  onComplete,
}: {
  onComplete: (result: ProofModuleResult) => void;
}) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const question = quizQuestions[index];
  function answer(value: number) {
    const nextScore = score + (value === question.answer ? 1 : 0);
    if (index === quizQuestions.length - 1) {
      onComplete({
        passed: nextScore >= 2,
        source: "demo",
        explanation: `${nextScore} / ${quizQuestions.length} correct.`,
      });
      return;
    }
    setScore(nextScore);
    setIndex((value) => value + 1);
  }
  return (
    <Card>
      <Text style={s.sectionTitle}>KNOW IT TO PROVE IT 🧠</Text>
      <Text style={s.bold}>
        {index + 1} / {quizQuestions.length} · {question.question}
      </Text>
      <View style={{ gap: 8 }}>
        {question.options.map((option, optionIndex) => (
          <Button
            key={option}
            secondary
            label={option}
            onPress={() => answer(optionIndex)}
          />
        ))}
      </View>
    </Card>
  );
}

export function TextArtifactProof({
  requirement,
  onComplete,
}: {
  requirement: ProofRequirement;
  onComplete: (result: ProofModuleResult) => void;
}) {
  const [value, setValue] = useState("");
  const count = value.trim() ? value.trim().split(/\s+/).length : 0;
  const target = requirement.config.minimumWordCount ?? 1;
  return (
    <Card>
      <Text style={s.sectionTitle}>TEXT ARTIFACT 📝</Text>
      <TextInput
        multiline
        value={value}
        onChangeText={setValue}
        placeholder="Paste your writing here"
        placeholderTextColor={c.muted}
        style={styles.input}
      />
      <Text style={s.caption}>
        {count} / {target} words
      </Text>
      <Button
        disabled={count < target}
        label="Submit writing"
        onPress={() => onComplete({ passed: count >= target, source: "user" })}
      />
    </Card>
  );
}

export function FriendWitnessProof({
  onComplete,
}: {
  onComplete: (result: ProofModuleResult) => void;
}) {
  const friends = friendDirectory.filter((friend) => friend.name !== "Fuka");
  const [selected, setSelected] = useState(friends[0]?.id ?? "");
  return (
    <Card>
      <Text style={s.sectionTitle}>FRIEND CONFIRMED 👀</Text>
      <Text style={s.muted}>Choose a friend to confirm this challenge.</Text>
      <Segments
        options={friends.map((friend) => friend.id)}
        value={selected}
        onChange={setSelected}
      />
      <Button
        label="Send verify request"
        onPress={() =>
          onComplete({
            passed: true,
            source: "demo",
            explanation: "A mock friend confirmed the challenge.",
          })
        }
      />
    </Card>
  );
}

export function CheckpointProof({
  requirement,
  onComplete,
}: {
  requirement: ProofRequirement;
  onComplete: (result: ProofModuleResult) => void;
}) {
  const target = requirement.config.checkpointCount ?? 4;
  const [completed, setCompleted] = useState(0);
  function checkIn() {
    const next = Math.min(target, completed + 1);
    setCompleted(next);
    if (next === target) onComplete({ passed: true, source: "user" });
  }
  return (
    <Card>
      <Text style={s.sectionTitle}>CHECKPOINT RUN ✓</Text>
      <Text style={s.muted}>
        {completed} / {target} checkpoints completed
      </Text>
      <ProgressBar value={(completed / target) * 100} />
      {completed < target ? (
        <Button label="Complete checkpoint" onPress={checkIn} />
      ) : (
        <Text style={s.bold}>ALL CHECKPOINTS COMPLETE ✦</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  images: { flexDirection: "row", gap: 10 },
  preview: { width: "100%", height: 130, borderRadius: 12, marginTop: 6 },
  timer: {
    color: c.primaryDark,
    fontSize: 42,
    fontWeight: "900",
    textAlign: "center",
  },
  input: {
    minHeight: 140,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    color: c.text,
    textAlignVertical: "top",
  },
});
