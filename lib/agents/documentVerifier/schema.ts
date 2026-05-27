import { z } from "zod";
import { DocumentTypeSchema, ClaimCategorySchema, DocumentQualitySchema } from "@/lib/types";

// ─── Tool: lookup_required_types_for_category ─────────────────────────────────

export const LookupRequiredTypesInputSchema = z.object({
  claimCategory: ClaimCategorySchema,
});
export type LookupRequiredTypesInput = z.infer<typeof LookupRequiredTypesInputSchema>;

export const LookupRequiredTypesOutputSchema = z.object({
  required: z.array(DocumentTypeSchema),
  optional: z.array(DocumentTypeSchema),
});
export type LookupRequiredTypesOutput = z.infer<typeof LookupRequiredTypesOutputSchema>;

// ─── Tool: check_required_document_types ─────────────────────────────────────

export const CheckRequiredTypesInputSchema = z.object({
  claimCategory: ClaimCategorySchema,
  uploadedTypes: z.array(DocumentTypeSchema),
});
export type CheckRequiredTypesInput = z.infer<typeof CheckRequiredTypesInputSchema>;

export const CheckRequiredTypesOutputSchema = z.object({
  missing: z.array(DocumentTypeSchema),
  extraNonOptional: z.array(DocumentTypeSchema),
});
export type CheckRequiredTypesOutput = z.infer<typeof CheckRequiredTypesOutputSchema>;

// ─── Tool: check_document_quality ────────────────────────────────────────────

export const CheckQualityItemSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  quality: DocumentQualitySchema.optional(),
});

export const CheckQualityInputSchema = z.object({
  documents: z.array(CheckQualityItemSchema),
});
export type CheckQualityInput = z.infer<typeof CheckQualityInputSchema>;

export const CheckQualityOutputSchema = z.object({
  unreadable: z.array(z.object({ fileId: z.string(), fileName: z.string() })),
});
export type CheckQualityOutput = z.infer<typeof CheckQualityOutputSchema>;

// ─── Tool: check_patient_name_consistency ────────────────────────────────────

export const CheckPatientNamesItemSchema = z.object({
  fileId: z.string(),
  patientNameOnDoc: z.string().optional().nullable(),
});

export const CheckPatientNamesInputSchema = z.object({
  documents: z.array(CheckPatientNamesItemSchema),
});
export type CheckPatientNamesInput = z.infer<typeof CheckPatientNamesInputSchema>;

export const CheckPatientNamesOutputSchema = z.object({
  matched: z.boolean(),
  distinctNames: z.array(z.object({ fileId: z.string(), name: z.string() })),
});
export type CheckPatientNamesOutput = z.infer<typeof CheckPatientNamesOutputSchema>;

// ─── Final agent output (submitted via submit_verification_result tool) ───────

export const VerifierOutputSchema = z.object({
  ok: z.boolean(),
  problemType: z
    .enum([
      "WRONG_DOCUMENT_TYPE",
      "UNREADABLE_DOCUMENT",
      "PATIENT_NAME_MISMATCH",
      "MISSING_REQUIRED_DOC",
    ])
    .optional(),
  uploadedTypes: z.array(z.string()).optional(),
  requiredTypes: z.array(z.string()).optional(),
  missingTypes: z.array(z.string()).optional(),
  unreadableDocuments: z
    .array(z.object({ fileId: z.string(), fileName: z.string() }))
    .optional(),
  names: z.array(z.object({ fileId: z.string(), name: z.string() })).optional(),
  message: z.string(),
});
export type VerifierOutput = z.infer<typeof VerifierOutputSchema>;
