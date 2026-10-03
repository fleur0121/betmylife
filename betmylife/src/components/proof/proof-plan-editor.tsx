import { Button, Card, Segments, s } from '@/components/ui-kit';
import { Text } from '@/components/localized-text';
import type { ProofMethod, ProofRequirement, VerificationPlan } from '@/mock/data';
import { View } from 'react-native';

const methods: { method: ProofMethod; label: string }[] = [
  { method: 'photo', label: '📸 Photo' },
  { method: 'timer', label: '⏱ Timer' },
  { method: 'location', label: '📍 Location' },
  { method: 'screen_time', label: '📱 Screen Time' },
  { method: 'health_steps', label: '👟 Health Steps' },
  { method: 'health_sleep', label: '🌙 Health Sleep' },
  { method: 'health_workout', label: '🏃 Health Workout' },
  { method: 'self_report', label: '✓ Self Report' },
];

function createRequirement(method: ProofMethod): ProofRequirement {
  return {
    id: `manual-${method}-${Date.now()}`,
    method,
    label: methods.find((item) => item.method === method)?.label ?? method,
    instructions: 'Complete this proof requirement before the deadline.',
    required: true,
    config: method === 'photo' ? { minimumPhotos: 1 } : {},
  };
}

export function ProofPlanEditor({
  plan,
  onChange,
}: {
  plan: VerificationPlan;
  onChange: (plan: VerificationPlan) => void;
}) {
  const available = new Set(plan.requirements.map((requirement) => requirement.method));
  return (
    <Card>
      <Text style={s.sectionTitle}>Change proof</Text>
      <Text style={s.muted}>Add or remove the ways you want to verify this challenge.</Text>
      <Segments
        options={['all', 'any'] as const}
        value={plan.logic}
        onChange={(logic) => onChange({ ...plan, logic })}
      />
      <View style={{ gap: 8 }}>
        {methods.map(({ method, label }) => (
          <Button
            key={method}
            secondary={available.has(method)}
            label={available.has(method) ? `Remove ${label}` : `Add ${label}`}
            onPress={() => {
              const requirements = available.has(method)
                ? plan.requirements.filter((requirement) => requirement.method !== method)
                : [...plan.requirements, createRequirement(method)];
              onChange({ ...plan, requirements: requirements.length ? requirements : [createRequirement('self_report')] });
            }}
          />
        ))}
      </View>
    </Card>
  );
}
