import type {
  PolicyDecision,
  DocumentProblem,
  ExtractedDocument,
} from "@/lib/types";
import type { VerificationResult } from "@/lib/agents/documentVerifier/agent";
import type { PolicyEvaluatorResult } from "@/lib/agents/policyEvaluator/agent";
import type { FraudDetectorResult } from "@/lib/agents/fraudDetector/agent";
import { getFraudThresholds } from "@/lib/policy/loader";

// ─── Composer inputs ──────────────────────────────────────────────────────────

export interface ComposerInput {
  claimedAmount: number;
  verifierResult: VerificationResult;
  evaluatorResult: PolicyEvaluatorResult | null;
  fraudResult: FraudDetectorResult | null;
  extractedDocuments: ExtractedDocument[];
  degradedComponents: string[];
}

// ─── Composer output ──────────────────────────────────────────────────────────

export interface ComposerOutput {
  decision: PolicyDecision | null;
  documentProblem: DocumentProblem | null;
  /** Notes appended to the decision rationale (e.g. degradation warnings) */
  notes: string[];
}

// ─── composeDecision ──────────────────────────────────────────────────────────

export function composeDecision(input: ComposerInput): ComposerOutput {
  const notes: string[] = [];

  // Step 1: document verifier halts pipeline if documents are bad
  if (!input.verifierResult.ok) {
    return {
      decision: null,
      documentProblem: input.verifierResult.problem,
      notes: [],
    };
  }

  // Add degradation notes
  if (input.degradedComponents.length > 0) {
    notes.push(
      `Manual review recommended: the following pipeline components produced degraded results and were skipped: ${input.degradedComponents.join(", ")}.`
    );
  }

  // Step 2: if evaluator failed completely, degrade to MANUAL_REVIEW
  if (!input.evaluatorResult || !input.evaluatorResult.ok) {
    const fallbackDecision: PolicyDecision = {
      status: "MANUAL_REVIEW",
      rationale:
        "Policy evaluation could not complete due to a component failure. Manual review required." +
        (notes.length > 0 ? " " + notes.join(" ") : ""),
      confidence: 0.3,
    };
    return { decision: fallbackDecision, documentProblem: null, notes };
  }

  const policyDecision = input.evaluatorResult.decision;
  const fraudThresholds = getFraudThresholds();
  const autoReviewThreshold = fraudThresholds.auto_manual_review_above;

  // Step 3: check if fraud detector requires manual review
  const fraudRequiresReview =
    input.fraudResult?.ok === true &&
    input.fraudResult.assessment.requiresManualReview === true;

  // Step 4: check auto-manual-review amount threshold
  const amountRequiresReview = input.claimedAmount >= autoReviewThreshold;

  // Step 5: compose final status
  if (fraudRequiresReview || amountRequiresReview) {
    const reasons: string[] = [];
    if (fraudRequiresReview && input.fraudResult?.ok) {
      const signals = input.fraudResult.assessment.signals
        .map((s) => s.detail)
        .filter(Boolean);
      if (signals.length > 0) reasons.push(...signals);
    }
    if (amountRequiresReview) {
      reasons.push(
        `Claimed amount ₹${input.claimedAmount} meets or exceeds the auto-review threshold of ₹${autoReviewThreshold}.`
      );
    }

    const fraudScore =
      input.fraudResult?.ok === true ? input.fraudResult.assessment.score : 0;
    const fraudRationale =
      input.fraudResult?.ok === true
        ? input.fraudResult.assessment.rationale
        : "Fraud assessment unavailable.";

    const manualDecision: PolicyDecision = {
      status: "MANUAL_REVIEW",
      approvedAmount: policyDecision.approvedAmount,
      rejectionReasons: policyDecision.rejectionReasons,
      lineItemsDecision: policyDecision.lineItemsDecision,
      financialBreakdown: policyDecision.financialBreakdown,
      rationale: [
        policyDecision.rationale,
        `Routed to manual review — fraud signals: ${fraudRationale}`,
        ...notes,
      ]
        .filter(Boolean)
        .join(" "),
      confidence: Math.min(
        policyDecision.confidence,
        Math.max(0.3, 1 - fraudScore)
      ),
    };
    return { decision: manualDecision, documentProblem: null, notes };
  }

  // Step 6: use policy evaluator's decision directly, append degradation notes
  const finalDecision: PolicyDecision = {
    ...policyDecision,
    rationale:
      notes.length > 0
        ? `${policyDecision.rationale} ${notes.join(" ")}`
        : policyDecision.rationale,
  };

  return { decision: finalDecision, documentProblem: null, notes };
}
