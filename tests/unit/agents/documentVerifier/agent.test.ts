import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock gemini before importing anything that touches it
vi.mock("@/lib/llm/gemini", () => ({
  generateWithTools: vi.fn(),
  MODELS: { flash: "gemini-2.5-flash", pro: "gemini-2.5-pro" },
}));

import { generateWithTools } from "@/lib/llm/gemini";
import { runDocumentVerifier } from "@/lib/agents/documentVerifier/agent";

const mockLLM = generateWithTools as ReturnType<typeof vi.fn>;

// Helper: build a mock model response that calls one function
function modelTurn(
  name: string,
  args: Record<string, unknown>
) {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ functionCall: { name, args } }],
        },
      },
    ],
  };
}

describe("documentVerifier agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── TC001: wrong document type ────────────────────────────────────────────

  it("TC001: detects missing HOSPITAL_BILL and reports WRONG_DOCUMENT_TYPE", async () => {
    // Turn 1: model calls lookup_required_types_for_category
    // Turn 2: model calls check_required_document_types
    // Turn 3: model calls check_document_quality
    // Turn 4: model calls check_patient_name_consistency
    // Turn 5: model calls submit_verification_result
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("lookup_required_types_for_category", { claimCategory: "CONSULTATION" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_required_document_types", {
          claimCategory: "CONSULTATION",
          uploadedTypes: ["PRESCRIPTION", "PRESCRIPTION"],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_quality", {
          documents: [
            { fileId: "F001", fileName: "dr_sharma_prescription.jpg" },
            { fileId: "F002", fileName: "another_prescription.jpg" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_patient_name_consistency", {
          documents: [
            { fileId: "F001" },
            { fileId: "F002" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_verification_result", {
          ok: false,
          problemType: "WRONG_DOCUMENT_TYPE",
          uploadedTypes: ["PRESCRIPTION"],
          requiredTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
          message:
            "You uploaded 'dr_sharma_prescription.jpg' (PRESCRIPTION) and 'another_prescription.jpg' (PRESCRIPTION), but a HOSPITAL_BILL is also required for CONSULTATION claims.",
        })
      );

    const result = await runDocumentVerifier({
      claimCategory: "CONSULTATION",
      documents: [
        { fileId: "F001", fileName: "dr_sharma_prescription.jpg", actualType: "PRESCRIPTION" },
        { fileId: "F002", fileName: "another_prescription.jpg", actualType: "PRESCRIPTION" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.type).toBe("WRONG_DOCUMENT_TYPE");
      expect(result.problem.message).toContain("HOSPITAL_BILL");
      expect(result.problem.message).toContain("PRESCRIPTION");
    }

    // Transcript must show check_required_document_types was called
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_required_document_types");
    expect(toolNames).toContain("submit_verification_result");
  });

  // ─── TC002: unreadable document ───────────────────────────────────────────

  it("TC002: detects unreadable pharmacy bill and reports UNREADABLE_DOCUMENT", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("lookup_required_types_for_category", { claimCategory: "PHARMACY" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_required_document_types", {
          claimCategory: "PHARMACY",
          uploadedTypes: ["PRESCRIPTION", "PHARMACY_BILL"],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_quality", {
          documents: [
            { fileId: "F003", fileName: "prescription.jpg", quality: "GOOD" },
            { fileId: "F004", fileName: "blurry_bill.jpg", quality: "UNREADABLE" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_patient_name_consistency", {
          documents: [{ fileId: "F003" }, { fileId: "F004" }],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_verification_result", {
          ok: false,
          problemType: "UNREADABLE_DOCUMENT",
          unreadableDocuments: [{ fileId: "F004", fileName: "blurry_bill.jpg" }],
          message:
            "The file 'blurry_bill.jpg' (id=F004) is unreadable. Please re-upload a clear image of the pharmacy bill.",
        })
      );

    const result = await runDocumentVerifier({
      claimCategory: "PHARMACY",
      documents: [
        { fileId: "F003", fileName: "prescription.jpg", actualType: "PRESCRIPTION", quality: "GOOD" },
        {
          fileId: "F004",
          fileName: "blurry_bill.jpg",
          actualType: "PHARMACY_BILL",
          quality: "UNREADABLE",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.type).toBe("UNREADABLE_DOCUMENT");
      expect(result.problem.message).toContain("blurry_bill.jpg");
      if (result.problem.type === "UNREADABLE_DOCUMENT") {
        expect(result.problem.documents[0].fileId).toBe("F004");
        expect(result.problem.documents[0].fileName).toBe("blurry_bill.jpg");
      }
    }

    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_document_quality");
  });

  // ─── TC003: patient name mismatch ─────────────────────────────────────────

  it("TC003: detects patient name mismatch and surfaces both names", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("lookup_required_types_for_category", { claimCategory: "CONSULTATION" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_required_document_types", {
          claimCategory: "CONSULTATION",
          uploadedTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_quality", {
          documents: [
            { fileId: "F005", fileName: "prescription_rajesh.jpg" },
            { fileId: "F006", fileName: "bill_arjun.jpg" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_patient_name_consistency", {
          documents: [
            { fileId: "F005", patientNameOnDoc: "Rajesh Kumar" },
            { fileId: "F006", patientNameOnDoc: "Arjun Mehta" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_verification_result", {
          ok: false,
          problemType: "PATIENT_NAME_MISMATCH",
          names: [
            { fileId: "F005", name: "Rajesh Kumar" },
            { fileId: "F006", name: "Arjun Mehta" },
          ],
          message:
            "Patient names do not match across documents: 'prescription_rajesh.jpg' shows 'Rajesh Kumar' and 'bill_arjun.jpg' shows 'Arjun Mehta'. All documents must belong to the same patient.",
        })
      );

    const result = await runDocumentVerifier({
      claimCategory: "CONSULTATION",
      documents: [
        {
          fileId: "F005",
          fileName: "prescription_rajesh.jpg",
          actualType: "PRESCRIPTION",
          patientNameOnDoc: "Rajesh Kumar",
        },
        {
          fileId: "F006",
          fileName: "bill_arjun.jpg",
          actualType: "HOSPITAL_BILL",
          patientNameOnDoc: "Arjun Mehta",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.type).toBe("PATIENT_NAME_MISMATCH");
      expect(result.problem.message).toContain("Rajesh Kumar");
      expect(result.problem.message).toContain("Arjun Mehta");
      if (result.problem.type === "PATIENT_NAME_MISMATCH") {
        const names = result.problem.names.map((n) => n.name);
        expect(names).toContain("Rajesh Kumar");
        expect(names).toContain("Arjun Mehta");
      }
    }

    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_patient_name_consistency");
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it("returns ok: true when all checks pass", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("lookup_required_types_for_category", { claimCategory: "CONSULTATION" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_required_document_types", {
          claimCategory: "CONSULTATION",
          uploadedTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_quality", {
          documents: [
            { fileId: "F007", fileName: "prescription.jpg", quality: "GOOD" },
            { fileId: "F008", fileName: "bill.jpg", quality: "GOOD" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_patient_name_consistency", {
          documents: [
            { fileId: "F007", patientNameOnDoc: "Rajesh Kumar" },
            { fileId: "F008", patientNameOnDoc: "Rajesh Kumar" },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_verification_result", {
          ok: true,
          message: "All document checks passed.",
        })
      );

    const result = await runDocumentVerifier({
      claimCategory: "CONSULTATION",
      documents: [
        { fileId: "F007", fileName: "prescription.jpg", actualType: "PRESCRIPTION", quality: "GOOD" },
        { fileId: "F008", fileName: "bill.jpg", actualType: "HOSPITAL_BILL", quality: "GOOD" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.transcript.degraded).toBe(false);
  });

  // ─── Graceful degradation ─────────────────────────────────────────────────

  it("returns ok: false with a degradation message when LLM fails", async () => {
    mockLLM.mockRejectedValue(new Error("GEMINI_API_KEY is not set"));

    const result = await runDocumentVerifier({
      claimCategory: "CONSULTATION",
      documents: [
        { fileId: "F001", fileName: "doc.jpg", actualType: "PRESCRIPTION" },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.message).toContain("Document verification could not complete");
    }
    expect(result.transcript.degraded).toBe(true);
  });
});
