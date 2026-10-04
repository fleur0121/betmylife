import { useLocalSearchParams, router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, PageHeading, Screen, s } from "@/components/ui-kit";
import { Text } from "@/components/localized-text";
import { ProofRenderer } from "@/components/proof/proof-renderer";
import type { ProofRequirement } from "@/mock/data";
import { useAppState } from "@/state/app-state";
import { getChallengePointChange } from "@/utils/points";
import type { ChallengeOutcome } from "@/utils/predictions";
import { palette as c } from "@/constants/design";
import { BrandAsset } from "@/components/brand-asset";

export default function ChallengeProofScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useAppState();
  const challenge = state.challenges.find((item) => item.id === id);
  const requirements = challenge?.proofPlan?.requirements ?? [];
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [proofMethodsUsed, setProofMethodsUsed] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<ChallengeOutcome | null>(null);
  const finished = useRef(false);
  if (!challenge) return <Screen title="Challenge proof" back><Card><Text style={s.muted}>This challenge could not be found.</Text><Button label="Back home" onPress={() => router.replace("/(tabs)")} /></Card></Screen>;
  const rulePointChange = getChallengePointChange(challenge.difficulty, outcome ?? challenge.result ?? "success");
  const settledReason = (outcome ?? challenge.result) === "failed" ? "challenge_failure" : "challenge_success";
  const pointChange = state.transactions.find((item) => item.challengeId === challenge.id && item.reason === settledReason)?.amount ?? rulePointChange;
  const nextResult = (passed: boolean, method?: string) => {
    if (finished.current || challenge.pointsSettled || challenge.result) return;
    const next = [...results, passed];
    const nextMethods = passed && method ? [...proofMethodsUsed, method] : proofMethodsUsed;
    const finalStep = step >= requirements.length - 1;
    if (!finalStep && (challenge.proofPlan?.logic !== "any" || !passed)) {
      setResults(next);
      setProofMethodsUsed(nextMethods);
      setStep((value) => value + 1);
      return;
    }
    const success = challenge.proofPlan?.logic === "any" ? next.some(Boolean) : next.every(Boolean);
    const result: ChallengeOutcome = success ? "success" : "failed";
    finished.current = true;
    setResults(next);
    setProofMethodsUsed(nextMethods);
    setOutcome(result);
    dispatch({
      type: "settle-challenge",
      challengeId: challenge.id,
      outcome: result,
      resolvedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      proofMethodsUsed: nextMethods,
      aiProofVerified: success && nextMethods.includes("ai_quiz"),
    });
  };
  const settledOutcome = outcome ?? challenge.result;
  return (
    <Screen title="Challenge proof" back>
      <PageHeading eyebrow="YOUR PROMISE · YOUR PROOF" title={settledOutcome ? (settledOutcome === "success" ? "YOU DID IT ✦" : "NOT THIS TIME") : challenge.title} subtitle={settledOutcome ? (settledOutcome === "success" ? "Challenge complete" : "Challenge missed · every try still counts") : challenge.proofPlan?.summary ?? "Submit your proof to record the challenge result."} />
      {settledOutcome ? (
        <Card style={styles.resultCard}>
          <View style={styles.resultHeading}>
            <BrandAsset name={settledOutcome === "success" ? "iconSuccess" : "iconFailed"} style={styles.resultIcon} />
            <Text style={styles.resultEyebrow}>{settledOutcome === "success" ? "CHALLENGE COMPLETE" : "CHALLENGE MISSED"}</Text>
          </View>
          <View style={styles.resultArt}>
            <BrandAsset
              name={settledOutcome === "success" ? "statePointsEarned" : "stateChallengeFailed"}
              style={styles.resultMascot}
              label={settledOutcome === "success" ? "Points earned" : "Challenge missed"}
            />
            {settledOutcome === "failed" && <BrandAsset name="stickerKeepGoing" style={styles.keepGoing} label="Keep going" />}
          </View>
          <Text style={styles.difficulty}>DIFFICULTY  ·  {"★".repeat(Math.max(1, Math.min(5, challenge.difficulty || 3)))}{"☆".repeat(5 - Math.max(1, Math.min(5, challenge.difficulty || 3)))}</Text>
          <Text style={[styles.amount, { color: pointChange >= 0 ? c.primary : c.red }]}>{pointChange > 0 ? "+" : ""}{pointChange} PT</Text>
          <Text style={s.caption}>NEW BALANCE</Text>
          <Text style={styles.balance}>{state.pointsBalance.toLocaleString()} PT</Text>
          <Text style={styles.resultNote}>Prediction stakes settle separately using their locked odds.</Text>
          <Button label="Back to challenges" onPress={() => router.replace("/(tabs)")} />
        </Card>
      ) : requirements.length > 0 ? (
        <>
          <View style={styles.stepLabel}><Text style={styles.resultEyebrow}>PROOF RECIPE</Text><Text style={s.caption}>{step + 1} / {requirements.length}</Text></View>
          <ProofRenderer requirement={requirements[step] as ProofRequirement} onComplete={(result) => nextResult(result.passed, requirements[step]?.method)} />
          <Text style={styles.helper}>Your saved Proof Recipe determines whether this challenge succeeds.</Text>
        </>
      ) : (
        <Card>
          <Text style={s.sectionTitle}>SELF CHECK-IN ✦</Text>
          <Text style={s.muted}>This challenge has no saved Proof Recipe, so this demo uses your check-in as its result.</Text>
          <View style={styles.actions}>
            <Button label="I completed it ✓" onPress={() => nextResult(true)} />
            <Button secondary label="I missed this one" onPress={() => nextResult(false)} />
          </View>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  resultCard: { alignItems: "center", gap: 8, paddingVertical: 24 },
  resultHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultIcon: { width: 24, height: 24 },
  resultArt: { width: "100%", minHeight: 130, alignItems: "center", justifyContent: "center" },
  resultMascot: { width: 150, height: 130 },
  keepGoing: { position: "absolute", width: 76, height: 48, right: 0, bottom: 0 },
  resultEyebrow: { color: c.primaryDark, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  difficulty: { color: c.muted, fontSize: 10, fontWeight: "800", marginTop: 10 },
  amount: { fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  balance: { color: c.text, fontSize: 21, fontWeight: "900" },
  resultNote: { color: c.muted, textAlign: "center", fontSize: 10, marginVertical: 12 },
  stepLabel: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  helper: { color: c.muted, fontSize: 10, textAlign: "center", marginTop: 10 },
  actions: { width: "100%", gap: 9, marginTop: 12 },
});
