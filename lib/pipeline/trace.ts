import type {
  TraceStage,
  StageStatus,
  AgentTranscript,
  DecisionTrace,
  ComponentFailure,
  PolicyDecision,
  DocumentProblem,
} from "@/lib/types";

// ─── Stage builder helpers ────────────────────────────────────────────────────

export function makeStage(
  name: string,
  status: StageStatus,
  startedAt: Date,
  endedAt: Date,
  result: unknown,
  agentTranscript?: AgentTranscript
): TraceStage {
  return {
    name,
    status,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    agentTranscript,
    result,
  };
}

// ─── Confidence helpers ───────────────────────────────────────────────────────

/**
 * Compute documents confidence from the document verifier and extractor results.
 * Start at 1.0; deduct for degraded extractor or poor document quality.
 */
export function computeDocumentConfidence(
  extractedDocuments: Array<{ documentConfidence: number }>
): number {
  if (extractedDocuments.length === 0) return 0.5;
  const avg =
    extractedDocuments.reduce((sum, d) => sum + d.documentConfidence, 0) /
    extractedDocuments.length;
  return Math.max(0.1, Math.round(avg * 100) / 100);
}

/**
 * Compute fraud confidence from the fraud assessment score.
 * Higher score = lower confidence in a clean decision.
 */
export function computeFraudConfidence(fraudScore: number): number {
  return Math.max(0.1, Math.round((1 - fraudScore) * 100) / 100);
}

/**
 * Overall confidence = weighted average, penalised for each degraded component.
 */
export function computeOverallConfidence(
  documentConfidence: number,
  fraudConfidence: number,
  degradedStages: number
): number {
  const base = (documentConfidence * 0.6 + fraudConfidence * 0.4);
  const penalty = degradedStages * 0.15;
  return Math.max(0.1, Math.round((base - penalty) * 100) / 100);
}

// ─── DecisionTrace assembler ──────────────────────────────────────────────────

export interface TraceInput {
  claimId: string;
  startedAt: Date;
  endedAt: Date;
  stages: TraceStage[];
  componentFailures: ComponentFailure[];
  documentConfidence: number;
  fraudConfidence: number;
  decision: PolicyDecision | null;
  documentProblem?: DocumentProblem | null;
}

export function buildTrace(input: TraceInput): DecisionTrace {
  const degradedCount = input.stages.filter((s) => s.status === "DEGRADED").length;

  return {
    claimId: input.claimId,
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    stages: input.stages,
    componentFailures: input.componentFailures,
    confidence: {
      documents: input.documentConfidence,
      fraud: input.fraudConfidence,
      overall: computeOverallConfidence(
        input.documentConfidence,
        input.fraudConfidence,
        degradedCount
      ),
    },
    decision: input.decision,
    documentProblem: input.documentProblem ?? null,
  };
}
