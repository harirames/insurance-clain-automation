import { z } from "zod";

import { getDocumentRequirements } from "@/lib/policy/loader";
import type { Tool } from "@/lib/agents/types";
import type { DocumentType } from "@/lib/types";
import {
  LookupRequiredTypesInputSchema,
  LookupRequiredTypesOutputSchema,
  CheckRequiredTypesInputSchema,
  CheckRequiredTypesOutputSchema,
  CheckQualityInputSchema,
  CheckQualityOutputSchema,
  CheckPatientNamesInputSchema,
  CheckPatientNamesOutputSchema,
  VerifierOutputSchema,
  type LookupRequiredTypesInput,
  type LookupRequiredTypesOutput,
  type CheckRequiredTypesInput,
  type CheckRequiredTypesOutput,
  type CheckQualityInput,
  type CheckQualityOutput,
  type CheckPatientNamesInput,
  type CheckPatientNamesOutput,
  type VerifierOutput,
} from "./schema";

// ─── lookup_required_types_for_category ──────────────────────────────────────

export const lookupRequiredTypesForCategory: Tool<
  LookupRequiredTypesInput,
  LookupRequiredTypesOutput
> = {
  name: "lookup_required_types_for_category",
  description:
    "Look up which document types are required and optional for a given claim category. Call this first to know what documents are needed.",
  inputSchema: LookupRequiredTypesInputSchema,
  outputSchema: LookupRequiredTypesOutputSchema,
  async run(input) {
    return getDocumentRequirements(input.claimCategory);
  },
};

// ─── check_required_document_types ───────────────────────────────────────────

export const checkRequiredDocumentTypes: Tool<
  CheckRequiredTypesInput,
  CheckRequiredTypesOutput
> = {
  name: "check_required_document_types",
  description:
    "Check which required document types are missing and which uploaded types are not allowed (not required or optional) for the claim category.",
  inputSchema: CheckRequiredTypesInputSchema,
  outputSchema: CheckRequiredTypesOutputSchema,
  async run(input) {
    const { required, optional } = getDocumentRequirements(input.claimCategory);
    const uploaded = new Set(input.uploadedTypes);
    const allowed = new Set<DocumentType>([...required, ...optional]);
    const missing = required.filter((r) => !uploaded.has(r));
    const extraNonOptional = input.uploadedTypes.filter((t) => !allowed.has(t));
    return { missing, extraNonOptional };
  },
};

// ─── check_document_quality ───────────────────────────────────────────────────

export const checkDocumentQuality: Tool<CheckQualityInput, CheckQualityOutput> = {
  name: "check_document_quality",
  description:
    "Identify documents marked as UNREADABLE that cannot be processed and must be re-uploaded.",
  inputSchema: CheckQualityInputSchema,
  outputSchema: CheckQualityOutputSchema,
  async run(input) {
    const unreadable = input.documents
      .filter((d) => d.quality === "UNREADABLE")
      .map((d) => ({ fileId: d.fileId, fileName: d.fileName }));
    return { unreadable };
  },
};

// ─── check_patient_name_consistency ──────────────────────────────────────────

export const checkPatientNameConsistency: Tool<
  CheckPatientNamesInput,
  CheckPatientNamesOutput
> = {
  name: "check_patient_name_consistency",
  description:
    "Check whether all documents carrying a patient name have the same name. Returns matched: false and all (fileId, name) pairs when there is a mismatch.",
  inputSchema: CheckPatientNamesInputSchema,
  outputSchema: CheckPatientNamesOutputSchema,
  async run(input) {
    const named = input.documents
      .filter((d) => d.patientNameOnDoc != null && d.patientNameOnDoc !== "")
      .map((d) => ({ fileId: d.fileId, name: d.patientNameOnDoc! }));

    const uniqueNames = new Set(named.map((n) => n.name));
    return {
      matched: uniqueNames.size <= 1,
      distinctNames: named,
    };
  },
};

// ─── submit_verification_result (terminating tool) ───────────────────────────
// Included in the registry so it appears in Gemini's function declarations.
// The runner intercepts this call before executing run(); it is never invoked.

export const submitVerificationResult: Tool<VerifierOutput, { accepted: boolean }> = {
  name: "submit_verification_result",
  description:
    "Submit your final verification result. Call this exactly once after running all relevant checks. Set ok: true if all checks pass. Set ok: false with a specific problemType and a message that names the actual file names and document types from the tool results.",
  inputSchema: VerifierOutputSchema,
  outputSchema: z.object({ accepted: z.boolean() }),
  async run(_input) {
    return { accepted: true };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const verifierTools = {
  [lookupRequiredTypesForCategory.name]: lookupRequiredTypesForCategory,
  [checkRequiredDocumentTypes.name]: checkRequiredDocumentTypes,
  [checkDocumentQuality.name]: checkDocumentQuality,
  [checkPatientNameConsistency.name]: checkPatientNameConsistency,
  [submitVerificationResult.name]: submitVerificationResult,
};
