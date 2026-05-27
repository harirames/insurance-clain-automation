import { z } from "zod";

// ─── Shared claim history item ────────────────────────────────────────────────

export const ClaimHistoryItemSchema = z.object({
  claimId: z.string(),
  date: z.string().date(),
  amount: z.number(),
  provider: z.string().optional(),
});
export type ClaimHistoryItem = z.infer<typeof ClaimHistoryItemSchema>;

// ─── Tool: count_same_day_claims ─────────────────────────────────────────────

export const CountSameDayClaimsInputSchema = z.object({
  memberId: z.string(),
  treatmentDate: z.string().date(),
  claimsHistory: z.array(ClaimHistoryItemSchema),
});
export type CountSameDayClaimsInput = z.infer<typeof CountSameDayClaimsInputSchema>;

export const CountSameDayClaimsOutputSchema = z.object({
  count: z.number(),
  limit: z.number(),
  exceeded: z.boolean(),
  sameDayClaims: z.array(ClaimHistoryItemSchema),
});
export type CountSameDayClaimsOutput = z.infer<typeof CountSameDayClaimsOutputSchema>;

// ─── Tool: count_monthly_claims ───────────────────────────────────────────────

export const CountMonthlyClaimsInputSchema = z.object({
  memberId: z.string(),
  treatmentDate: z.string().date(),
  claimsHistory: z.array(ClaimHistoryItemSchema),
});
export type CountMonthlyClaimsInput = z.infer<typeof CountMonthlyClaimsInputSchema>;

export const CountMonthlyClaimsOutputSchema = z.object({
  count: z.number(),
  limit: z.number(),
  exceeded: z.boolean(),
});
export type CountMonthlyClaimsOutput = z.infer<typeof CountMonthlyClaimsOutputSchema>;

// ─── Tool: check_high_value_threshold ────────────────────────────────────────

export const CheckHighValueThresholdInputSchema = z.object({
  claimedAmount: z.number(),
});
export type CheckHighValueThresholdInput = z.infer<typeof CheckHighValueThresholdInputSchema>;

export const CheckHighValueThresholdOutputSchema = z.object({
  threshold: z.number(),
  exceeded: z.boolean(),
  autoReviewThreshold: z.number(),
  autoReviewTriggered: z.boolean(),
});
export type CheckHighValueThresholdOutput = z.infer<typeof CheckHighValueThresholdOutputSchema>;

// ─── Tool: check_document_alteration_flags ────────────────────────────────────

export const AlteredDocItemSchema = z.object({
  fileId: z.string(),
  reason: z.string(),
});

export const CheckDocumentAlterationFlagsInputSchema = z.object({
  extractedDocuments: z.array(
    z.object({
      fileId: z.string(),
      flags: z.array(z.string()).optional(),
    })
  ),
});
export type CheckDocumentAlterationFlagsInput = z.infer<
  typeof CheckDocumentAlterationFlagsInputSchema
>;

export const CheckDocumentAlterationFlagsOutputSchema = z.object({
  alteredDocuments: z.array(AlteredDocItemSchema),
});
export type CheckDocumentAlterationFlagsOutput = z.infer<
  typeof CheckDocumentAlterationFlagsOutputSchema
>;

// ─── Fraud signal (individual signal record) ──────────────────────────────────

export const FraudSignalSchema = z.object({
  type: z.string(),
  detail: z.string(),
  count: z.number().optional(),
  limit: z.number().optional(),
});
export type FraudSignal = z.infer<typeof FraudSignalSchema>;

// ─── Final agent output (args for submit_fraud_assessment) ────────────────────

export const FraudAssessmentOutputSchema = z.object({
  score: z.number().min(0).max(1),
  signals: z.array(FraudSignalSchema),
  requiresManualReview: z.boolean(),
  rationale: z.string(),
});
export type FraudAssessmentOutput = z.infer<typeof FraudAssessmentOutputSchema>;
