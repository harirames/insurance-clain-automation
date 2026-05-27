import { z } from "zod";
import type { Tool } from "@/lib/agents/types";
import { getFraudThresholds } from "@/lib/policy/loader";
import {
  CountSameDayClaimsInputSchema,
  CountSameDayClaimsOutputSchema,
  CountMonthlyClaimsInputSchema,
  CountMonthlyClaimsOutputSchema,
  CheckHighValueThresholdInputSchema,
  CheckHighValueThresholdOutputSchema,
  CheckDocumentAlterationFlagsInputSchema,
  CheckDocumentAlterationFlagsOutputSchema,
  FraudAssessmentOutputSchema,
  type CountSameDayClaimsInput,
  type CountSameDayClaimsOutput,
  type CountMonthlyClaimsInput,
  type CountMonthlyClaimsOutput,
  type CheckHighValueThresholdInput,
  type CheckHighValueThresholdOutput,
  type CheckDocumentAlterationFlagsInput,
  type CheckDocumentAlterationFlagsOutput,
  type FraudAssessmentOutput,
} from "./schema";

// ─── Alteration flag keywords ─────────────────────────────────────────────────

const ALTERATION_FLAG_KEYWORDS = [
  "DOCUMENT_ALTERATION",
  "ALTERED",
  "TAMPERED",
  "SUSPICIOUS",
  "FORGERY",
];

// ─── count_same_day_claims ────────────────────────────────────────────────────

export const countSameDayClaimsTool: Tool<CountSameDayClaimsInput, CountSameDayClaimsOutput> = {
  name: "count_same_day_claims",
  description:
    "Count how many claims from this member's history share the same treatment date as this claim. Returns count, limit, and exceeded flag. Triggers manual review if exceeded.",
  inputSchema: CountSameDayClaimsInputSchema,
  outputSchema: CountSameDayClaimsOutputSchema,
  async run(input) {
    const thresholds = getFraudThresholds();
    const limit = thresholds.same_day_claims_limit;

    const sameDayClaims = input.claimsHistory.filter(
      (c) => c.date === input.treatmentDate
    );
    const count = sameDayClaims.length;

    return {
      count,
      limit,
      exceeded: count >= limit,
      sameDayClaims,
    };
  },
};

// ─── count_monthly_claims ─────────────────────────────────────────────────────

export const countMonthlyClaimsTool: Tool<CountMonthlyClaimsInput, CountMonthlyClaimsOutput> = {
  name: "count_monthly_claims",
  description:
    "Count how many claims from this member's history fall in the same calendar month as the treatment date. Returns count, limit, and exceeded flag.",
  inputSchema: CountMonthlyClaimsInputSchema,
  outputSchema: CountMonthlyClaimsOutputSchema,
  async run(input) {
    const thresholds = getFraudThresholds();
    const limit = thresholds.monthly_claims_limit;

    // Same year-month (YYYY-MM prefix match)
    const yearMonth = input.treatmentDate.slice(0, 7);
    const monthlyClaims = input.claimsHistory.filter((c) =>
      c.date.startsWith(yearMonth)
    );
    const count = monthlyClaims.length;

    return {
      count,
      limit,
      exceeded: count >= limit,
    };
  },
};

// ─── check_high_value_threshold ───────────────────────────────────────────────

export const checkHighValueThresholdTool: Tool<
  CheckHighValueThresholdInput,
  CheckHighValueThresholdOutput
> = {
  name: "check_high_value_threshold",
  description:
    "Check whether the claimed amount exceeds the high-value threshold that triggers fraud scrutiny, or the auto-manual-review threshold.",
  inputSchema: CheckHighValueThresholdInputSchema,
  outputSchema: CheckHighValueThresholdOutputSchema,
  async run(input) {
    const thresholds = getFraudThresholds();
    const threshold = thresholds.high_value_claim_threshold;
    const autoReviewThreshold = thresholds.auto_manual_review_above;

    return {
      threshold,
      exceeded: input.claimedAmount > threshold,
      autoReviewThreshold,
      autoReviewTriggered: input.claimedAmount >= autoReviewThreshold,
    };
  },
};

// ─── check_document_alteration_flags ─────────────────────────────────────────

export const checkDocumentAlterationFlagsTool: Tool<
  CheckDocumentAlterationFlagsInput,
  CheckDocumentAlterationFlagsOutput
> = {
  name: "check_document_alteration_flags",
  description:
    "Inspect the extractor's confidence flags on each document for signs of alteration, tampering, or forgery. Returns a list of documents with concerning flags.",
  inputSchema: CheckDocumentAlterationFlagsInputSchema,
  outputSchema: CheckDocumentAlterationFlagsOutputSchema,
  async run(input) {
    const alteredDocuments = input.extractedDocuments
      .filter((doc) =>
        (doc.flags ?? []).some((flag) =>
          ALTERATION_FLAG_KEYWORDS.some((kw) =>
            flag.toUpperCase().includes(kw)
          )
        )
      )
      .map((doc) => {
        const matchedFlags = (doc.flags ?? []).filter((flag) =>
          ALTERATION_FLAG_KEYWORDS.some((kw) => flag.toUpperCase().includes(kw))
        );
        return {
          fileId: doc.fileId,
          reason: matchedFlags.join(", "),
        };
      });

    return { alteredDocuments };
  },
};

// ─── submit_fraud_assessment (terminating tool) ───────────────────────────────

export const submitFraudAssessmentTool: Tool<FraudAssessmentOutput, { accepted: boolean }> = {
  name: "submit_fraud_assessment",
  description:
    "Submit your final fraud assessment. Call this exactly once after gathering all signals. If any signal tool returned exceeded: true, requiresManualReview MUST be true. score should reflect cumulative fraud risk (0.0 = clean, 1.0 = high fraud risk).",
  inputSchema: FraudAssessmentOutputSchema,
  outputSchema: z.object({ accepted: z.boolean() }),
  async run(_input) {
    return { accepted: true };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const fraudDetectorTools = {
  [countSameDayClaimsTool.name]: countSameDayClaimsTool,
  [countMonthlyClaimsTool.name]: countMonthlyClaimsTool,
  [checkHighValueThresholdTool.name]: checkHighValueThresholdTool,
  [checkDocumentAlterationFlagsTool.name]: checkDocumentAlterationFlagsTool,
  [submitFraudAssessmentTool.name]: submitFraudAssessmentTool,
};
