import type { ProofRequirement } from '@/mock/data';
import {
  AiQuizProof,
  BeforeAfterProof,
  CheckpointProof,
  FocusSessionProof,
  FriendWitnessProof,
  LiveCameraProof,
  SelfReportProof,
  TextArtifactProof,
  type ProofModuleResult,
} from './proof-modules';

export function ProofRenderer({
  requirement,
  onComplete,
}: {
  requirement: ProofRequirement;
  onComplete: (result: ProofModuleResult) => void;
}) {
  switch (requirement.method) {
    case 'live_camera':
    case 'photo':
      return <LiveCameraProof onComplete={onComplete} />;
    case 'before_after':
      return <BeforeAfterProof onComplete={onComplete} />;
    case 'focus_session':
    case 'timer':
    case 'duration':
      return <FocusSessionProof requirement={requirement} onComplete={onComplete} />;
    case 'ai_quiz':
      return <AiQuizProof onComplete={onComplete} />;
    case 'text_artifact':
    case 'word_count':
      return <TextArtifactProof requirement={requirement} onComplete={onComplete} />;
    case 'friend_witness':
      return <FriendWitnessProof onComplete={onComplete} />;
    case 'checkpoint':
      return <CheckpointProof requirement={requirement} onComplete={onComplete} />;
    default:
      return <SelfReportProof onComplete={onComplete} />;
  }
}
