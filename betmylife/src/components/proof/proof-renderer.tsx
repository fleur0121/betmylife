import type { ProofRequirement } from "@/mock/data";
import {
    AiQuizProof,
    BeforeAfterProof,
    CheckpointProof,
    FocusSessionProof,
    FriendWitnessProof,
    LiveCameraProof,
    TextArtifactProof,
    type ProofModuleResult,
} from "./proof-modules";

export function ProofRenderer({
  requirement,
  onComplete,
}: {
  requirement: ProofRequirement;
  onComplete: (result: ProofModuleResult) => void;
}) {
  switch (requirement.method) {
    case "live_camera":
      return <LiveCameraProof onComplete={onComplete} />;
    case "before_after":
      return <BeforeAfterProof onComplete={onComplete} />;
    case "focus_session":
      return (
        <FocusSessionProof requirement={requirement} onComplete={onComplete} />
      );
    case "ai_quiz":
      return <AiQuizProof onComplete={onComplete} />;
    case "text_artifact":
      return (
        <TextArtifactProof requirement={requirement} onComplete={onComplete} />
      );
    case "friend_witness":
      return <FriendWitnessProof onComplete={onComplete} />;
    case "checkpoint":
      return (
        <CheckpointProof requirement={requirement} onComplete={onComplete} />
      );
    default:
      return null;
  }
}
