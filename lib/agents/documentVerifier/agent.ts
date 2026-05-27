import type { ClaimCategory, DocumentType, DocumentQuality, DocumentProblem, AgentTranscript } from "@/lib/types";
import { runAgent } from "@/lib/agents/runner";
import { MODELS } from "@/lib/llm/gemini";
import { DOCUMENT_VERIFIER_SYSTEM } from "@/lib/llm/prompts/documentVerifier";
import { verifierTools } from "./tools";
import { VerifierOutputSchema, type VerifierOutput } from "./schema";

// ─── Public input type ────────────────────────────────────────────────────────

export interface VerifierDocInput {
  fileId: string;
  fileName: string;
  actualType?: DocumentType;
  quality?: DocumentQuality;
  patientNameOnDoc?: string;
}

export interface VerifierInput {
  claimCategory: ClaimCategory;
  documents: VerifierDocInput[];
}

// ─── Public output type ───────────────────────────────────────────────────────

export type VerificationResult =
  | { ok: true; transcript: AgentTranscript }
  | { ok: false; problem: DocumentProblem; transcript: AgentTranscript };

// ─── Output converter ─────────────────────────────────────────────────────────

function toDocumentProblem(raw: VerifierOutput): DocumentProblem {
  switch (raw.problemType) {
    case "WRONG_DOCUMENT_TYPE":
      return {
        type: "WRONG_DOCUMENT_TYPE",
        uploadedTypes: (raw.uploadedTypes ?? []) as DocumentType[],
        requiredTypes: (raw.requiredTypes ?? []) as DocumentType[],
        message: raw.message,
      };
    case "MISSING_REQUIRED_DOC":
      return {
        type: "MISSING_REQUIRED_DOC",
        missingTypes: (raw.missingTypes ?? []) as DocumentType[],
        message: raw.message,
      };
    case "UNREADABLE_DOCUMENT":
      return {
        type: "UNREADABLE_DOCUMENT",
        documents: raw.unreadableDocuments ?? [],
        message: raw.message,
      };
    case "PATIENT_NAME_MISMATCH":
      return {
        type: "PATIENT_NAME_MISMATCH",
        names: raw.names ?? [],
        message: raw.message,
      };
    default:
      return {
        type: "MISSING_REQUIRED_DOC",
        missingTypes: [],
        message: raw.message,
      };
  }
}

// ─── runDocumentVerifier ──────────────────────────────────────────────────────

export async function runDocumentVerifier(
  input: VerifierInput
): Promise<VerificationResult> {
  const result = await runAgent<VerifierOutput>({
    agentName: "documentVerifier",
    systemPrompt: DOCUMENT_VERIFIER_SYSTEM,
    userPrompt: buildUserPrompt(input),
    tools: verifierTools,
    finalResponseSchema: VerifierOutputSchema,
    finalToolName: "submit_verification_result",
    maxTurns: 8,
    model: MODELS.flash,
  });

  // Runner-level failure (timeout, exception) — degrade gracefully
  if (!result.ok) {
    return {
      ok: false,
      problem: {
        type: "MISSING_REQUIRED_DOC",
        missingTypes: [],
        message: `Document verification could not complete: ${result.error}`,
      },
      transcript: result.transcript,
    };
  }

  const output = result.output;
  if (output.ok) {
    return { ok: true, transcript: result.transcript };
  }

  return {
    ok: false,
    problem: toDocumentProblem(output),
    transcript: result.transcript,
  };
}

// ─── User prompt builder ──────────────────────────────────────────────────────

function buildUserPrompt(input: VerifierInput): string {
  const docLines = input.documents
    .map(
      (d) =>
        `- "${d.fileName}" (id=${d.fileId}, type=${d.actualType ?? "unknown"}` +
        (d.quality ? `, quality=${d.quality}` : "") +
        (d.patientNameOnDoc ? `, patient_name="${d.patientNameOnDoc}"` : "") +
        ")"
    )
    .join("\n");

  return `Claim category: ${input.claimCategory}

Uploaded documents:
${docLines}

Verify that these documents satisfy the requirements for this claim category.`;
}
