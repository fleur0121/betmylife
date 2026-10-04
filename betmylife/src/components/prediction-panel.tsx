import { useEffect, useState } from "react";
import {
  Modal,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandAsset } from "@/components/brand-asset";
import { Text } from "@/components/localized-text";
import { palette as c } from "@/constants/design";
import type { Challenge, PredictionChoice } from "@/mock/data";
import { useAppState } from "@/state/app-state";
import {
  calculatePotentialProfit,
  calculatePotentialReturn,
  createStakedPrediction,
  isChallengeExpired,
  isPredictionLocked,
  getPredictionLockAt,
  PREDICTION_STAKE_PRESETS,
  validateStake,
} from "@/utils/predictions";
import { s } from "./ui-kit";

type PredictionPanelProps = {
  challenge: Challenge;
  variant?: "feed" | "featured";
};

export function PredictionPanel({ challenge, variant = "feed" }: PredictionPanelProps) {
  const { state, dispatch } = useAppState();
  const insets = useSafeAreaInsets();
  const [choice, setChoice] = useState<PredictionChoice | null>(null);
  const [stake, setStake] = useState<number>(PREDICTION_STAKE_PRESETS[0]);
  const [visible, setVisible] = useState(false);
  const ownChallenge = challenge.ownerId === state.authUserId;
  const relatedPredictions = Object.values(state.stakedPredictions).filter(
    (prediction) => prediction.challengeId === challenge.id && prediction.userId === state.authUserId,
  );
  const currentPrediction = relatedPredictions.find((prediction) => prediction.status === "active");
  const editing = currentPrediction !== undefined;
  const settledPrediction = relatedPredictions.find((prediction) => prediction.status === "won" || prediction.status === "lost");
  const savedLockAt = currentPrediction?.lockAt ?? relatedPredictions[relatedPredictions.length - 1]?.lockAt;
  const lockAt = savedLockAt ?? getPredictionLockAt(challenge) ?? undefined;
  const lockAtMs = lockAt ? new Date(lockAt).getTime() : Number.NaN;
  const [now, setNow] = useState(() => Date.now());
  const windowClosed = !Number.isFinite(lockAtMs) || now >= lockAtMs;
  const expired = isChallengeExpired(challenge, new Date(now));
  const locked = currentPrediction
    ? isPredictionLocked(currentPrediction, challenge, new Date(now))
    : windowClosed;
  const balanceForBet = state.pointsBalance + (currentPrediction?.stake ?? 0);
  const odds = choice === "yes" ? Number(challenge.yesOdds) : Number(challenge.noOdds);
  const stakeValidation = validateStake(stake, balanceForBet);
  const potentialReturn = Number.isFinite(odds) ? calculatePotentialReturn(stake, odds) : 0;
  const potentialProfit = Number.isFinite(odds) ? calculatePotentialProfit(stake, odds) : 0;

  useEffect(() => {
    const remaining = lockAtMs - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(timer);
  }, [lockAtMs]);

  function open(choiceToMake: PredictionChoice, initialStake: number = PREDICTION_STAKE_PRESETS[0]) {
    setChoice(choiceToMake);
    setStake(initialStake);
    setVisible(true);
  }

  function confirmPrediction(predictionId: string) {
    if (!choice || !stakeValidation.valid || expired || windowClosed || ownChallenge || locked) return;
    if (!state.authUserId) return;
    const prediction = createStakedPrediction({
      id: predictionId,
      challenge,
      userId: state.authUserId,
      choice,
      stake,
      createdAt: currentPrediction?.createdAt,
      lockAt: currentPrediction?.lockAt ?? lockAt,
    });
    dispatch({ type: "place-prediction", prediction });
    setVisible(false);
  }

  function cancelPrediction() {
    if (!currentPrediction || locked || expired) return;
    const cancel = () => dispatch({ type: "cancel-prediction", challengeId: challenge.id });
    if (Platform.OS === "web") {
      if (globalThis.confirm("Cancel this bet and return your stake to your balance?")) cancel();
      return;
    }
    Alert.alert("Cancel your bet?", "Your stake will be returned to your balance.", [
      { text: "Keep bet", style: "cancel" },
      { text: "Cancel bet", style: "destructive", onPress: cancel },
    ]);
  }

  const panelStyle = variant === "featured" ? styles.featuredPanel : styles.feedPanel;
  const choiceColors = choice === "yes"
    ? { strong: c.green, text: "YES" }
    : { strong: c.coral, text: "NO" };

  if (ownChallenge) {
    return (
      <View style={[styles.ownPanel, panelStyle]}>
        <Text style={styles.ownEyebrow}>YOUR CHALLENGE</Text>
        <Text style={styles.ownCopy}>Friends can predict how you’ll do.</Text>
        <View style={styles.ownOdds}>
          <Text style={styles.ownOddsHeading}>YOUR CHALLENGE ODDS</Text>
          <View style={styles.ownOddsRow}>
            <View style={styles.ownOddsItem}>
              <Text style={styles.ownOddsYesLabel}>YES</Text>
              <Text style={styles.ownOddsValue}>×{Number(challenge.yesOdds).toFixed(2)}</Text>
            </View>
            <View style={styles.ownOddsDivider} />
            <View style={styles.ownOddsItem}>
              <Text style={styles.ownOddsNoLabel}>NO</Text>
              <Text style={styles.ownOddsValue}>×{Number(challenge.noOdds).toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (settledPrediction) {
    return (
      <View style={[styles.lockedPanel, panelStyle]}>
        <View style={styles.lockedHeading}>
          <Text style={styles.lockedEyebrow}>PREDICTION SETTLED</Text>
        </View>
        <View style={styles.lockedMain}>
          <View>
            <Text style={styles.lockedChoice}>{settledPrediction.choice.toUpperCase()}</Text>
            <Text style={styles.lockedMeta}>{settledPrediction.stake} PT · ×{settledPrediction.lockedOdds.toFixed(2)}</Text>
          </View>
          <BrandAsset name={settledPrediction.status === "won" ? "stickerYouCalledIt" : "mascotSupportive"} style={styles.lockedMascot} />
        </View>
        <View style={styles.lockedReturn}>
          <Text style={styles.lockedReturnLabel}>{settledPrediction.status === "won" ? "RETURN" : "LOSS"}</Text>
          <Text style={styles.lockedReturnValue}>{settledPrediction.status === "won" ? `${settledPrediction.payout ?? 0} PT` : `-${settledPrediction.stake} PT`}</Text>
        </View>
      </View>
    );
  }

  if (currentPrediction && locked) {
    return (
      <View style={[styles.lockedPanel, panelStyle]}>
        <View style={styles.lockedHeading}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockedEyebrow}>LOCKED IN</Text>
          <View style={styles.lockedChip}><Text style={styles.lockedChipText}>NO EDITS</Text></View>
        </View>
        <View style={styles.lockedMain}>
          <View>
            <Text style={styles.lockedChoice}>{currentPrediction.choice.toUpperCase()}</Text>
            <Text style={styles.lockedMeta}>{currentPrediction.stake} PT · ×{currentPrediction.lockedOdds.toFixed(2)}</Text>
          </View>
          <BrandAsset name="mascotPrediction" style={styles.lockedMascot} />
        </View>
        <View style={styles.lockedReturn}>
          <Text style={styles.lockedReturnLabel}>POTENTIAL RETURN</Text>
          <Text style={styles.lockedReturnValue}>{currentPrediction.potentialReturn} PT</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      {currentPrediction ? (
        <View style={[styles.currentBet, variant === "featured" && styles.currentBetFeatured]}>
          <View style={styles.currentBetTop}>
            <View>
              <Text style={styles.ownEyebrow}>YOUR CURRENT PICK</Text>
              <Text style={styles.currentBetValue}>{currentPrediction.choice.toUpperCase()} · {currentPrediction.stake} PT</Text>
            </View>
            <Text style={styles.currentOdds}>×{currentPrediction.lockedOdds.toFixed(2)}</Text>
          </View>
          <Text style={styles.editDeadline}>CHANGE OR CANCEL UNTIL 1 HOUR BEFORE DEADLINE</Text>
          <View style={styles.editActions}>
            <Pressable
              accessibilityRole="button"
              disabled={expired || windowClosed}
              onPress={() => open(currentPrediction.choice, currentPrediction.stake)}
              style={({ pressed }) => [styles.editButton, styles.editButtonPrimary, (expired || windowClosed) && styles.disabled, pressed && s.pressed]}
            >
              <Text style={styles.editButtonPrimaryText}>CHANGE BET</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={expired || windowClosed}
              onPress={cancelPrediction}
              style={({ pressed }) => [styles.editButton, styles.editButtonCancel, (expired || windowClosed) && styles.disabled, pressed && s.pressed]}
            >
              <Text style={styles.editButtonCancelText}>CANCEL BET</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {variant === "featured" && <Text style={styles.featuredPrompt}>MAKE YOUR CALL ✦</Text>}
          <View style={[styles.choices, variant === "featured" && styles.featuredChoices]}>
            {(["yes", "no"] as const).map((option) => {
              const yes = option === "yes";
              const selectedOdds = yes ? challenge.yesOdds : challenge.noOdds;
              const tint = yes ? c.mint : c.pink;
              const strong = yes ? c.green : c.coral;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${option}, odds ${selectedOdds}`}
                  disabled={expired || windowClosed || !!settledPrediction}
                  onPress={() => open(option)}
                  style={({ pressed }) => [
                    styles.choiceButton,
                    { backgroundColor: variant === "featured" ? "rgba(255,255,255,0.97)" : tint, borderColor: variant === "featured" ? "transparent" : strong },
                    (expired || windowClosed || !!settledPrediction) && styles.disabled,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={[styles.choiceLabel, { color: strong }]}>{yes ? "YES" : "NO"}</Text>
                  <Text style={[styles.choiceOdds, { color: strong }]}>×{selectedOdds}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.chooseHint, variant === "featured" && styles.featuredHint]}>
            {expired ? "PREDICTIONS CLOSED" : windowClosed ? "PREDICTIONS LOCKED" : settledPrediction ? "PREDICTION SETTLED" : "PICK A SIDE · STAKE POINTS NEXT"}
          </Text>
        </>
      )}

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close stake sheet" onPress={() => setVisible(false)} style={styles.backdrop} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              <View style={styles.sheetHero}>
                <View style={styles.sheetTitleWrap}>
                  <Text style={styles.sheetEyebrow}>{editing ? "TUNE YOUR CALL ✦" : "LOCK IT IN ✦"}</Text>
                  <Text style={styles.sheetTitle}>PUT YOUR POINTS{"\n"}WHERE YOUR PREDICTION IS</Text>
                </View>
                <BrandAsset name="mascotPrediction" style={styles.sheetMascot} />
                <BrandAsset name="decoSparkleBlue" style={styles.sheetSparkle} />
              </View>

              <View style={styles.pickedCard}>
                <View style={styles.pickedChoiceWrap}>
                  <Text style={styles.sectionEyebrow}>{editing ? "CHANGE YOUR CALL" : "YOU PICKED"}</Text>
                  {editing ? (
                    <View style={styles.sheetChoiceTabs}>
                      {(["yes", "no"] as const).map((option) => {
                        const selected = choice === option;
                        const color = option === "yes" ? c.green : c.coral;
                        return (
                          <Pressable
                            key={option}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => setChoice(option)}
                            style={[styles.sheetChoiceTab, selected && { backgroundColor: color, borderColor: color }]}
                          >
                            <Text style={[styles.sheetChoiceTabText, selected && styles.sheetChoiceTabTextSelected]}>{option.toUpperCase()}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.pickedChoice, { color: choiceColors.strong }]}>{choiceColors.text}</Text>
                  )}
                </View>
                <View style={styles.oddsPill}>
                  <Text style={styles.oddsLabel}>{editing ? "NEW ODDS" : "ODDS AT LOCK"}</Text>
                  <Text style={styles.oddsValue}>×{Number.isFinite(odds) ? odds.toFixed(2) : "—"}</Text>
                </View>
              </View>

              <View style={styles.stakeHeading}>
                <Text style={styles.sectionEyebrow}>HOW MUCH?</Text>
                <View style={styles.balancePill}>
                  <BrandAsset name="iconPoints" style={styles.balanceIcon} />
                  <Text style={styles.balanceText}>
                    <Text>{editing ? "BALANCE AFTER RELEASE  " : "YOUR BALANCE  "}</Text>
                    <Text translate={false}>{balanceForBet.toLocaleString()} PT</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.presets}>
                {PREDICTION_STAKE_PRESETS.map((preset) => {
                  const disabled = !validateStake(preset, balanceForBet).valid;
                  const selected = stake === preset;
                  return (
                    <Pressable
                      key={preset}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled }}
                      disabled={disabled}
                      onPress={() => setStake(preset)}
                      style={({ pressed }) => [
                        styles.preset,
                        selected && styles.presetSelected,
                        disabled && styles.presetDisabled,
                        pressed && s.pressed,
                      ]}
                    >
                      <Text style={[styles.presetValue, selected && styles.presetValueSelected]}>{preset}</Text>
                      <Text style={[styles.presetUnit, selected && styles.presetValueSelected]}>PT</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.stakeSummary}>
                <View style={styles.summaryStake}>
                  <Text style={styles.summaryLabel}>YOUR STAKE</Text>
                  <Text style={styles.summaryStakeValue}>{stake} PT</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryOutcomes}>
                  <Text style={styles.summaryLabel}>IF YOU’RE RIGHT</Text>
                  <View style={styles.returnLine}>
                    <Text style={styles.summaryTiny}>RETURN</Text>
                    <Text style={styles.returnValue}>{potentialReturn} PT</Text>
                  </View>
                  <View style={styles.returnLine}>
                    <Text style={styles.summaryTiny}>PROFIT</Text>
                    <Text style={styles.profitValue}>+{potentialProfit} PT</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.disclaimer}>{editing ? "You can still change this bet until one hour before the deadline." : "Points are for fun. Your stake leaves your balance when you lock it in."}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={!stakeValidation.valid || !choice || expired || windowClosed || locked}
                onPress={() => confirmPrediction(`prediction-${challenge.id}-${Date.now()}`)}
                style={({ pressed }) => [styles.confirmButton, (!stakeValidation.valid || !choice || expired || windowClosed || locked) && styles.confirmDisabled, pressed && s.pressed]}
              >
                <Text style={styles.confirmText}>
                  <Text>{editing ? "UPDATE BET TO " : "LOCK IN "}</Text>
                  <Text translate={false}>{stake} PT</Text>
                  <Text> ON </Text>
                  <Text translate={false}>{choice?.toUpperCase() ?? "—"} ✦</Text>
                </Text>
                <Text style={styles.confirmArrow}>→</Text>
              </Pressable>
              {!stakeValidation.valid && balanceForBet < 10 && (
                <Text style={styles.lowBalance}>You need at least 10 PT to make a prediction.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: "row", gap: 8 },
  featuredChoices: { marginTop: 8 },
  choiceButton: { minHeight: 48, flex: 1, paddingHorizontal: 13, borderWidth: 2, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  choiceLabel: { fontSize: 13, fontWeight: "900", letterSpacing: 0.4 },
  choiceOdds: { fontSize: 12, fontWeight: "900" },
  chooseHint: { marginTop: 7, color: c.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.7, textAlign: "center" },
  featuredPrompt: { marginTop: 10, color: "#DCE7FF", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  featuredHint: { color: "#DCE7FF" },
  disabled: { opacity: 0.55 },
  ownPanel: { padding: 12, borderRadius: 16, backgroundColor: c.lavenderLight },
  ownOdds: { marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: c.lavender },
  ownOddsHeading: { color: c.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  ownOddsRow: { flexDirection: "row", alignItems: "center", marginTop: 7 },
  ownOddsItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 3 },
  ownOddsDivider: { width: 1, height: 22, marginHorizontal: 10, backgroundColor: c.lavender },
  ownOddsYesLabel: { color: c.green, fontSize: 10, fontWeight: "900" },
  ownOddsNoLabel: { color: c.coral, fontSize: 10, fontWeight: "900" },
  ownOddsValue: { color: c.text, fontSize: 15, fontWeight: "900" },
  feedPanel: {},
  featuredPanel: { marginTop: 9, backgroundColor: "rgba(255,255,255,0.96)" },
  ownEyebrow: { color: c.primaryDark, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  ownCopy: { marginTop: 3, color: c.text, fontSize: 12, fontWeight: "600" },
  lockedPanel: { padding: 12, borderRadius: 17, backgroundColor: c.lavenderLight, borderWidth: 1, borderColor: c.lavender },
  currentBet: { marginTop: 8, padding: 12, borderRadius: 17, backgroundColor: c.lavenderLight, borderWidth: 1, borderColor: c.lavender },
  currentBetFeatured: { backgroundColor: "rgba(255,255,255,0.96)", borderColor: "rgba(255,255,255,0.6)" },
  currentBetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  currentBetValue: { marginTop: 3, color: c.text, fontSize: 17, fontWeight: "900" },
  currentOdds: { color: c.primaryDark, fontSize: 20, fontWeight: "900" },
  editDeadline: { marginTop: 7, color: c.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.35 },
  editActions: { flexDirection: "row", gap: 7, marginTop: 9 },
  editButton: { minHeight: 38, flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  editButtonPrimary: { backgroundColor: c.primary },
  editButtonPrimaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  editButtonCancel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: c.border },
  editButtonCancelText: { color: c.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  lockedHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockIcon: { fontSize: 13 },
  lockedEyebrow: { color: c.primaryDark, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  lockedChip: { marginLeft: "auto", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, backgroundColor: "#FFFFFF" },
  lockedChipText: { color: c.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  lockedMain: { minHeight: 57, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lockedChoice: { color: c.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  lockedMeta: { color: c.primaryDark, fontSize: 11, fontWeight: "800" },
  lockedMascot: { width: 68, height: 60 },
  lockedReturn: { paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E3DAF9", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lockedReturnLabel: { color: c.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  lockedReturnValue: { color: c.primary, fontSize: 17, fontWeight: "900" },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 22, 43, 0.46)" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { maxHeight: "94%", minHeight: "76%", paddingTop: 10, paddingHorizontal: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: c.background, overflow: "hidden" },
  handle: { alignSelf: "center", width: 38, height: 4, marginBottom: 12, borderRadius: 3, backgroundColor: "#D5D1CB" },
  sheetContent: { gap: 13, paddingBottom: 14 },
  sheetHero: { minHeight: 94, flexDirection: "row", alignItems: "center", justifyContent: "space-between", overflow: "hidden", padding: 15, borderRadius: 22, backgroundColor: c.lavender },
  sheetTitleWrap: { flexShrink: 1 },
  sheetEyebrow: { marginBottom: 5, color: c.primaryDark, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  sheetTitle: { color: c.text, fontSize: 18, lineHeight: 21, fontWeight: "900", letterSpacing: -0.45 },
  sheetMascot: { width: 82, height: 78, marginRight: -2 },
  sheetSparkle: { position: "absolute", right: 78, top: 12, width: 24, height: 24 },
  pickedCard: { minHeight: 68, paddingHorizontal: 15, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 18, backgroundColor: "#FFFFFF" },
  sectionEyebrow: { color: c.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.75 },
  pickedChoice: { marginTop: 2, fontSize: 25, lineHeight: 28, fontWeight: "900", letterSpacing: -0.6 },
  pickedChoiceWrap: { flex: 1, gap: 5 },
  sheetChoiceTabs: { flexDirection: "row", gap: 5 },
  sheetChoiceTab: { minWidth: 48, paddingHorizontal: 9, paddingVertical: 6, alignItems: "center", borderWidth: 1, borderColor: c.border, borderRadius: 11, backgroundColor: c.background },
  sheetChoiceTabText: { color: c.muted, fontSize: 10, fontWeight: "900" },
  sheetChoiceTabTextSelected: { color: "#FFFFFF" },
  oddsPill: { minWidth: 92, paddingHorizontal: 11, paddingVertical: 8, alignItems: "center", borderRadius: 14, backgroundColor: c.sky },
  oddsLabel: { color: c.primaryDark, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  oddsValue: { marginTop: 2, color: c.primaryDark, fontSize: 17, fontWeight: "900" },
  stakeHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: c.cream },
  balanceIcon: { width: 18, height: 18 },
  balanceText: { color: c.text, fontSize: 8, fontWeight: "900", letterSpacing: 0.2 },
  presets: { flexDirection: "row", gap: 8 },
  preset: { height: 58, flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.border, borderRadius: 16, backgroundColor: "#FFFFFF" },
  presetSelected: { borderColor: c.primary, backgroundColor: c.primary },
  presetDisabled: { opacity: 0.35 },
  presetValue: { color: c.text, fontSize: 19, lineHeight: 21, fontWeight: "900" },
  presetUnit: { marginTop: 1, color: c.muted, fontSize: 8, fontWeight: "900" },
  presetValueSelected: { color: "#FFFFFF" },
  stakeSummary: { minHeight: 106, padding: 14, flexDirection: "row", alignItems: "center", borderRadius: 20, backgroundColor: "#FFFFFF" },
  summaryStake: { flex: 0.8, gap: 7 },
  summaryDivider: { width: 1, height: 67, marginHorizontal: 12, backgroundColor: c.border },
  summaryOutcomes: { flex: 1.2, gap: 5 },
  summaryLabel: { color: c.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  summaryStakeValue: { color: c.text, fontSize: 25, fontWeight: "900", letterSpacing: -0.6 },
  returnLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTiny: { color: c.muted, fontSize: 8, fontWeight: "800" },
  returnValue: { color: c.primaryDark, fontSize: 15, fontWeight: "900" },
  profitValue: { color: c.green, fontSize: 13, fontWeight: "900" },
  disclaimer: { color: c.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  confirmButton: { minHeight: 56, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 18, backgroundColor: c.primary },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 0.4 },
  confirmArrow: { color: c.yellow, fontSize: 20, lineHeight: 23, fontWeight: "900" },
  lowBalance: { color: c.coral, fontSize: 10, fontWeight: "700", textAlign: "center" },
});
