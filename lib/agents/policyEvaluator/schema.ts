import { z } from "zod";
import { ClaimStatusSchema, RejectionReasonSchema } from "@/lib/types";

// ─── Line item decision (mirrors lib/types LineItemDecision but standalone) ───

export const LineItemDecisionItemSchema = z.object({
  description: z.string(),
  amount: z.number(),
  status: z.enum(["COVERED", "EXCLUDED"]),
  reason: z.string().optional(),
});

// ─── Final agent output — args for submit_policy_decision ────────────────────

export const PolicyEvaluatorOutputSchema = z.object({
  status: ClaimStatusSchema,
  approvedAmount: z.number().optional(),
  rejectionReasons: z.array(RejectionReasonSchema).optional(),
  lineItemsDecision: z.array(LineItemDecisionItemSchema).optional(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type PolicyEvaluatorOutput = z.infer<typeof PolicyEvaluatorOutputSchema>;
