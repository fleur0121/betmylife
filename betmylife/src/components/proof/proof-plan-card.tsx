import { Card, Button, Pill, s } from '@/components/ui-kit';
import { Text } from '@/components/localized-text';
import type { ProofMethod, VerificationPlan } from '@/mock/data';
import { StyleSheet, View } from 'react-native';
import { palette as c } from '@/constants/design';
import { ProofPlanEditor } from './proof-plan-editor';
import { useState } from 'react';

const proofCopy: Record<ProofMethod, { title: string; icon: string; tone: 'purple' | 'green' | 'pink' | 'neutral' }> = {
  photo: { title: 'PHOTO PROOF', icon: '📸', tone: 'purple' },
  live_camera: { title: 'LIVE CAMERA', icon: '📷', tone: 'purple' },
  before_after: { title: 'BEFORE + AFTER', icon: '↔', tone: 'purple' },
  timer: { title: 'TIMER PROOF', icon: '⏱', tone: 'green' },
  focus_session: { title: 'FOCUS SESSION', icon: '🎯', tone: 'green' },
  ai_quiz: { title: 'AI QUIZ', icon: '🧠', tone: 'pink' },
  text_artifact: { title: 'TEXT ARTIFACT', icon: '📝', tone: 'neutral' },
  word_count: { title: 'WORD COUNT', icon: '🔢', tone: 'neutral' },
  friend_witness: { title: 'FRIEND WITNESS', icon: '👀', tone: 'pink' },
  checkpoint: { title: 'CHECKPOINTS', icon: '✓', tone: 'green' },
  location: { title: 'LOCATION', icon: '📍', tone: 'neutral' },
  duration: { title: 'DURATION', icon: '⏱', tone: 'green' },
  screen_time: { title: 'SCREEN TIME', icon: '📱', tone: 'neutral' },
  health_steps: { title: 'HEALTH STEPS', icon: '👟', tone: 'green' },
  health_sleep: { title: 'HEALTH SLEEP', icon: '🌙', tone: 'purple' },
  health_workout: { title: 'HEALTH WORKOUT', icon: '🏃', tone: 'green' },
  distance: { title: 'DISTANCE', icon: '📏', tone: 'green' },
  self_report: { title: 'SELF REPORT', icon: '✓', tone: 'pink' },
};

export function ProofPlanCard({
  plan,
  onConfirm,
  onChangePlan,
}: {
  plan: VerificationPlan;
  onConfirm: () => void;
  onChangePlan?: (plan: VerificationPlan) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card style={styles.card}>
      <Text style={styles.eyebrow}>AI PICKED THIS ✨</Text>
      <Text style={styles.recipeTitle}>{plan.title}</Text>
      <Text style={styles.summary}>{plan.summary}</Text>
      {plan.requirements.map((requirement) => {
        const copy = proofCopy[requirement.method];
        return (
          <View key={requirement.id} style={styles.requirement}>
            <Text style={styles.icon}>{copy.icon}</Text>
            <View style={s.flex}>
              <Pill tone={copy.tone}>{copy.title}</Pill>
              <Text style={styles.label}>{requirement.label}</Text>
              <Text style={styles.instructions}>{requirement.instructions}</Text>
              {requirement.config.minimumMinutes && (
                <Text style={s.caption}>GOAL {requirement.config.minimumMinutes} MIN</Text>
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.strength}>
        <Text style={s.caption}>PROOF STRENGTH</Text>
        <Text style={styles.dots}>
          {plan.verificationStrength === 'strong' ? '● ● ●' : plan.verificationStrength === 'medium' ? '● ● ○' : '● ○ ○'}
        </Text>
      </View>
      <Text style={s.muted}>{plan.explanation}</Text>
      <Text style={s.caption}>{plan.logic === 'all' ? 'All requirements must be completed.' : 'Complete any one requirement.'}</Text>
      {onChangePlan && (
        <Button
          secondary
          label={editing ? 'Close proof editor' : 'Change proof'}
          onPress={() => setEditing((value) => !value)}
        />
      )}
      {editing && onChangePlan && (
        <ProofPlanEditor plan={plan} onChange={onChangePlan} />
      )}
      <Button label="Use this plan" onPress={onConfirm} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, backgroundColor: c.lavenderLight },
  eyebrow: { fontSize: 11, fontWeight: '800', color: c.primaryDark, letterSpacing: 1 },
  summary: { color: c.text, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  recipeTitle: { color: c.primaryDark, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  requirement: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 14, backgroundColor: c.card },
  icon: { fontSize: 28, lineHeight: 36 },
  label: { marginTop: 8, color: c.text, fontSize: 14, fontWeight: '800' },
  instructions: { marginTop: 10, color: c.text, fontSize: 16, lineHeight: 23 },
  strength: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { color: c.primary, fontSize: 16, fontWeight: '900' },
});