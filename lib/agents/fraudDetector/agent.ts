import type { AgentTranscript, ExtractedDocument } from "@/lib/types";
import { runAgent } from "@/lib/agents/runner";
import { MODELS } from "@/lib/llm/gemini";
import { FRAUD_DETECTOR_SYSTEM, buildFraudDetectorUserPrompt } from "@/lib/llm/prompts/fraudDetector";
import { fraudDetectorTools } from "./tools";
import { FraudAssessmentOutputSchema, type FraudAssessmentOutput } from "./schema";

// ─── Public input type ────────────────────────────────────────────────────────

export interface FraudDetectorInput {
  memberId: string;
  claimCategory: string;
  treatmentDate: string;
  claimedAmount: number;
  hospitalName?: string;
  claimsHistory: Array<{
    claimId: string;
    date: string;
    amount: number;
    provider?: string;
  }>;
  extractedDocuments: ExtractedDocument[];
}

// ─── Public output type ───────────────────────────────────────────────────────

export type FraudDetectorResult =
  | { ok: true; assessment: FraudAssessmentOutput; transcript: AgentTranscript }
  | { ok: false; error: string; transcript: AgentTranscript };

// ─── runFraudDetector ─────────────────────────────────────────────────────────

export async function runFraudDetector(
  input: FraudDetectorInput
): Promise<FraudDetectorResult> {
  // Collect document flags from extracted documents for the prompt
  const documentFlags = input.extractedDocuments.flatMap((d) => d.flags ?? []);

  const result = await runAgent<FraudAssessmentOutput>({
    agentName: "fraudDetector",
    systemPrompt: FRAUD_DETECTOR_SYSTEM,
    userPrompt: buildFraudDetectorUserPrompt({
      memberId: input.memberId,
      treatmentDate: input.treatmentDate,
      claimedAmount: input.claimedAmount,
      claimCategory: input.claimCategory,
      hospitalName: input.hospitalName,
      claimsHistory: input.claimsHistory,
      documentFlags: documentFlags.length > 0 ? documentFlags : undefined,
    }),
    tools: fraudDetectorTools,
    finalResponseSchema: FraudAssessmentOutputSchema,
    finalToolName: "submit_fraud_assessment",
    maxTurns: 8,
    model: MODELS.flash,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, transcript: result.transcript };
  }

  return { ok: true, assessment: result.output, transcript: result.transcript };
}
