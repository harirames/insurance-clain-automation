import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm/gemini", () => ({
  generateWithTools: vi.fn(),
  MODELS: { flash: "gemini-2.5-flash", pro: "gemini-2.5-pro" },
}));

import { generateWithTools } from "@/lib/llm/gemini";
import { runFraudDetector } from "@/lib/agents/fraudDetector/agent";
import type { FraudDetectorInput } from "@/lib/agents/fraudDetector/agent";

const mockLLM = generateWithTools as ReturnType<typeof vi.fn>;

function modelTurn(name: string, args: Record<string, unknown>) {
  return {
    candidates: [
      { content: { role: "model", parts: [{ functionCall: { name, args } }] } },
    ],
  };
}

// ─── TC009 fixture ────────────────────────────────────────────────────────────

const TC009_HISTORY = [
  { claimId: "CLM_0081", date: "2024-10-30", amount: 1200, provider: "City Clinic A" },
  { claimId: "CLM_0082", date: "2024-10-30", amount: 1800, provider: "City Clinic B" },
  { claimId: "CLM_0083", date: "2024-10-30", amount: 2100, provider: "Wellness Center" },
];

const TC009_INPUT: FraudDetectorInput = {
  memberId: "EMP008",
  claimCategory: "CONSULTATION",
  treatmentDate: "2024-10-30",
  claimedAmount: 4800,
  claimsHistory: TC009_HISTORY,
  extractedDocuments: [
    { fileId: "F017", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
    { fileId: "F018", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
  ],
};

describe("fraudDetector agent", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── TC009: same-day claims fraud signal ─────────────────────────────────

  it("TC009: flags same-day claims, requires manual review, signals include count:3 limit:2", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("count_same_day_claims", {
          memberId: "EMP008",
          treatmentDate: "2024-10-30",
          claimsHistory: TC009_HISTORY,
        })
      )
      .mockResolvedValueOnce(
        modelTurn("count_monthly_claims", {
          memberId: "EMP008",
          treatmentDate: "2024-10-30",
          claimsHistory: TC009_HISTORY,
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_high_value_threshold", { claimedAmount: 4800 })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_alteration_flags", {
          extractedDocuments: [
            { fileId: "F017", flags: [] },
            { fileId: "F018", flags: [] },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_fraud_assessment", {
          score: 0.85,
          requiresManualReview: true,
          rationale:
            "Member EMP008 has submitted 3 claims on 2024-10-30, exceeding the same-day limit of 2. This pattern warrants manual review.",
          signals: [
            {
              type: "SAME_DAY_CLAIMS",
              detail: "3 claims on 2024-10-30 exceeds the limit of 2.",
              count: 3,
              limit: 2,
            },
          ],
        })
      );

    const result = await runFraudDetector(TC009_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assessment.requiresManualReview).toBe(true);
      expect(result.assessment.score).toBeGreaterThan(0.7);

      const sameDaySignal = result.assessment.signals.find(
        (s) => s.type === "SAME_DAY_CLAIMS"
      );
      expect(sameDaySignal).toBeDefined();
      expect(sameDaySignal?.count).toBe(3);
      expect(sameDaySignal?.limit).toBe(2);
    }

    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("count_same_day_claims");
    expect(toolNames).toContain("submit_fraud_assessment");

    // Transcript must show tool calls ran before final answer
    const sameDayCallIndex = toolNames.indexOf("count_same_day_claims");
    const submitIndex = toolNames.indexOf("submit_fraud_assessment");
    expect(sameDayCallIndex).toBeLessThan(submitIndex);
  });

  // ─── Clean claim — no fraud signals ──────────────────────────────────────

  it("returns requiresManualReview: false for a clean claim with no prior history", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("count_same_day_claims", {
          memberId: "EMP001",
          treatmentDate: "2024-11-01",
          claimsHistory: [],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("count_monthly_claims", {
          memberId: "EMP001",
          treatmentDate: "2024-11-01",
          claimsHistory: [],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_high_value_threshold", { claimedAmount: 1500 })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_alteration_flags", {
          extractedDocuments: [{ fileId: "F001", flags: [] }],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_fraud_assessment", {
          score: 0.05,
          requiresManualReview: false,
          rationale: "No fraud signals detected. All checks passed.",
          signals: [],
        })
      );

    const result = await runFraudDetector({
      memberId: "EMP001",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-01",
      claimedAmount: 1500,
      claimsHistory: [],
      extractedDocuments: [
        { fileId: "F001", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assessment.requiresManualReview).toBe(false);
      expect(result.assessment.score).toBeLessThan(0.3);
    }
  });

  // ─── Document alteration signal ───────────────────────────────────────────

  it("flags document alteration and sets requiresManualReview: true", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("count_same_day_claims", {
          memberId: "EMP001",
          treatmentDate: "2024-11-01",
          claimsHistory: [],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("count_monthly_claims", {
          memberId: "EMP001",
          treatmentDate: "2024-11-01",
          claimsHistory: [],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("check_high_value_threshold", { claimedAmount: 2000 })
      )
      .mockResolvedValueOnce(
        modelTurn("check_document_alteration_flags", {
          extractedDocuments: [
            { fileId: "F001", flags: ["DOCUMENT_ALTERATION"] },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_fraud_assessment", {
          score: 0.6,
          requiresManualReview: true,
          rationale:
            "Document F001 carries a DOCUMENT_ALTERATION flag from the extractor. Manual review required.",
          signals: [
            {
              type: "DOCUMENT_ALTERATION",
              detail: "File F001 flagged for possible alteration.",
            },
          ],
        })
      );

    const result = await runFraudDetector({
      memberId: "EMP001",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-01",
      claimedAmount: 2000,
      claimsHistory: [],
      extractedDocuments: [
        {
          fileId: "F001",
          documentType: "PRESCRIPTION",
          documentConfidence: 0.5,
          flags: ["DOCUMENT_ALTERATION"],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assessment.requiresManualReview).toBe(true);
      const altSignal = result.assessment.signals.find(
        (s) => s.type === "DOCUMENT_ALTERATION"
      );
      expect(altSignal).toBeDefined();
    }

    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_document_alteration_flags");
  });

  // ─── Graceful degradation ─────────────────────────────────────────────────

  it("returns ok: false with transcript.degraded: true when LLM throws", async () => {
    mockLLM.mockRejectedValue(new Error("LLM timeout"));

    const result = await runFraudDetector(TC009_INPUT);

    expect(result.ok).toBe(false);
    expect(result.transcript.degraded).toBe(true);
  });
});
