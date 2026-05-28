import { z } from "zod";

// ─── Enums (values must match policy_terms.json / test_cases.json exactly) ───

export const ClaimCategorySchema = z.enum([
  "CONSULTATION",
  "DIAGNOSTIC",
  "PHARMACY",
  "DENTAL",
  "VISION",
  "ALTERNATIVE_MEDICINE",
]);
export type ClaimCategory = z.infer<typeof ClaimCategorySchema>;

export const DocumentTypeSchema = z.enum([
  "PRESCRIPTION",
  "HOSPITAL_BILL",
  "LAB_REPORT",
  "PHARMACY_BILL",
  "DENTAL_REPORT",
  "DIAGNOSTIC_REPORT",
  "DISCHARGE_SUMMARY",
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const ClaimStatusSchema = z.enum([
  "APPROVED",
  "PARTIAL",
  "REJECTED",
  "MANUAL_REVIEW",
  "HALTED",
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

export const DocumentQualitySchema = z.enum(["GOOD", "POOR", "UNREADABLE"]);
export type DocumentQuality = z.infer<typeof DocumentQualitySchema>;

export const RejectionReasonSchema = z.enum([
  "WRONG_DOCUMENT_TYPE",
  "UNREADABLE_DOCUMENT",
  "PATIENT_NAME_MISMATCH",
  "MISSING_REQUIRED_DOC",
  "WAITING_PERIOD",
  "EXCLUDED_CONDITION",
  "PRE_AUTH_MISSING",
  "PER_CLAIM_EXCEEDED",
  "SUB_LIMIT_EXCEEDED",
  "ANNUAL_LIMIT_EXCEEDED",
  "NOT_COVERED",
  "SUBMISSION_DEADLINE",
  "BELOW_MINIMUM_AMOUNT",
  "MEMBER_NOT_FOUND",
  "POLICY_INACTIVE",
  "FRAUD_SUSPECTED",
]);
export type RejectionReason = z.infer<typeof RejectionReasonSchema>;

// ─── Document Input (what arrives at the pipeline) ───────────────────────────

export const DocumentInputSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  actualType: DocumentTypeSchema.optional(),
  quality: DocumentQualitySchema.optional(),
  patientNameOnDoc: z.string().optional(),
  mimeType: z.string().optional(),
  // For test fixtures: pre-extracted content bypasses the LLM extractor
  content: z.record(z.string(), z.unknown()).optional(),
  // For real uploads: Cloudinary URL passed to Gemini as a remote fileData part
  cloudinaryUrl: z.string().url().optional(),
  cloudinaryPublicId: z.string().optional(),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

// ─── Claim Submission (pipeline entry point) ─────────────────────────────────

export const ClaimSubmissionSchema = z.object({
  memberId: z.string(),
  policyId: z.string(),
  claimCategory: ClaimCategorySchema,
  treatmentDate: z.string().date(),
  claimedAmount: z.number().positive(),
  hospitalName: z.string().optional(),
  submittedBy: z.string(),
  documents: z.array(DocumentInputSchema).min(1),
  // TC009: fraud check history
  claimsHistory: z
    .array(
      z.object({
        claimId: z.string(),
        date: z.string().date(),
        amount: z.number(),
        provider: z.string().optional(),
      })
    )
    .optional(),
  ytdClaimsAmount: z.number().min(0).optional(),
  // TC011: simulate component failure
  simulateComponentFailure: z.boolean().optional(),
  // Explicit submission date for eval harness; live submissions use server-side today
  submissionDate: z.string().date().optional(),
});
export type ClaimSubmission = z.infer<typeof ClaimSubmissionSchema>;

// ─── Extracted Document (output of the extractor agent) ──────────────────────

export const FieldConfidenceSchema = z.object({
  value: z.unknown().nullable(),
  confidence: z.number().min(0).max(1),
});
export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

export const ExtractedDocumentSchema = z.object({
  fileId: z.string(),
  documentType: DocumentTypeSchema,
  patientName: FieldConfidenceSchema.optional(),
  doctorName: FieldConfidenceSchema.optional(),
  doctorRegistration: FieldConfidenceSchema.optional(),
  hospitalName: FieldConfidenceSchema.optional(),
  date: FieldConfidenceSchema.optional(),
  diagnosis: FieldConfidenceSchema.optional(),
  treatment: FieldConfidenceSchema.optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number(),
        confidence: z.number().min(0).max(1),
      })
    )
    .optional(),
  totalAmount: FieldConfidenceSchema.optional(),
  medicines: z.array(z.string()).optional(),
  testsOrdered: z.array(z.string()).optional(),
  documentConfidence: z.number().min(0).max(1),
  flags: z.array(z.string()).optional(),
  rawContent: z.record(z.string(), z.unknown()).optional(),
});
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

// ─── Document Problem (document verifier output on failure) ──────────────────

export const DocumentProblemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("WRONG_DOCUMENT_TYPE"),
    uploadedTypes: z.array(DocumentTypeSchema),
    requiredTypes: z.array(DocumentTypeSchema),
    message: z.string(),
  }),
  z.object({
    type: z.literal("UNREADABLE_DOCUMENT"),
    documents: z.array(z.object({ fileId: z.string(), fileName: z.string() })),
    message: z.string(),
  }),
  z.object({
    type: z.literal("PATIENT_NAME_MISMATCH"),
    names: z.array(z.object({ fileId: z.string(), name: z.string() })),
    message: z.string(),
  }),
  z.object({
    type: z.literal("MISSING_REQUIRED_DOC"),
    missingTypes: z.array(DocumentTypeSchema),
    message: z.string(),
  }),
]);
export type DocumentProblem = z.infer<typeof DocumentProblemSchema>;

// ─── Line Item Decision ───────────────────────────────────────────────────────

export const LineItemDecisionSchema = z.object({
  description: z.string(),
  amount: z.number(),
  status: z.enum(["COVERED", "EXCLUDED", "PARTIAL"]),
  reason: z.string().optional(),
});
export type LineItemDecision = z.infer<typeof LineItemDecisionSchema>;

// ─── Financial Breakdown ──────────────────────────────────────────────────────

export const FinancialBreakdownSchema = z.object({
  gross: z.number(),
  networkDiscountPercent: z.number(),
  networkDiscountAmount: z.number(),
  afterDiscount: z.number(),
  copayPercent: z.number(),
  copayAmount: z.number(),
  payable: z.number(),
});
export type FinancialBreakdown = z.infer<typeof FinancialBreakdownSchema>;

// ─── Policy Decision ─────────────────────────────────────────────────────────

export const PolicyDecisionSchema = z.object({
  status: ClaimStatusSchema,
  approvedAmount: z.number().optional(),
  rejectionReasons: z.array(RejectionReasonSchema).optional(),
  lineItemsDecision: z.array(LineItemDecisionSchema).optional(),
  financialBreakdown: FinancialBreakdownSchema.optional(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ─── Agent Transcript (one per LLM agent, captured by runner.ts) ─────────────

export const ToolCallSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  result: z.unknown(),
  latencyMs: z.number(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const AgentTranscriptSchema = z.object({
  agentName: z.string(),
  model: z.string(),
  turns: z.number(),
  toolCalls: z.array(ToolCallSchema),
  finalOutput: z.unknown(),
  latencyMs: z.number(),
  degraded: z.boolean().default(false),
});
export type AgentTranscript = z.infer<typeof AgentTranscriptSchema>;

// ─── Decision Trace (full pipeline trace) ────────────────────────────────────

export const StageStatusSchema = z.enum(["PASS", "FAIL", "SKIPPED", "DEGRADED"]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const TraceStageSchema = z.object({
  name: z.string(),
  status: StageStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  agentTranscript: AgentTranscriptSchema.optional(),
  result: z.unknown(),
});
export type TraceStage = z.infer<typeof TraceStageSchema>;

export const ComponentFailureSchema = z.object({
  component: z.string(),
  error: z.string(),
  fallback: z.string(),
});
export type ComponentFailure = z.infer<typeof ComponentFailureSchema>;

export const DecisionTraceSchema = z.object({
  claimId: z.string(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  stages: z.array(TraceStageSchema),
  componentFailures: z.array(ComponentFailureSchema),
  confidence: z.object({
    documents: z.number().min(0).max(1),
    fraud: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
  }),
  decision: PolicyDecisionSchema.nullable(),
  documentProblem: DocumentProblemSchema.nullable().optional(),
});
export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const UserRoleSchema = z.enum(["MEMBER", "OPS"]);
export type UserRole = z.infer<typeof UserRoleSchema>;
