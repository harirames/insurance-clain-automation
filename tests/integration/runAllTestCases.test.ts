/**
 * Phase 7 — Integration test harness for all 12 test cases
 *
 * Runs the full pipeline with real LLM agents mocked at the boundary,
 * exercising every decision path defined in test_cases.json.
 *
 * Each TC maps to a precisely named describe block matching the case_id.
 * Assertions are keyed on the "expected" object from test_cases.json.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import testCasesRaw from "../../test_cases.json";

// ── Mock all LLM-backed agents (deterministic boundary) ───────────────────────
vi.mock("@/lib/agents/documentVerifier/agent", () => ({
  runDocumentVerifier: vi.fn(),
}));
vi.mock("@/lib/agents/extractor/agent", () => ({
  runExtractor: vi.fn(),
}));
vi.mock("@/lib/agents/policyEvaluator/agent", () => ({
  runPolicyEvaluator: vi.fn(),
}));
vi.mock("@/lib/agents/fraudDetector/agent", () => ({
  runFraudDetector: vi.fn(),
}));

import { runDocumentVerifier } from "@/lib/agents/documentVerifier/agent";
import { runExtractor } from "@/lib/agents/extractor/agent";
import { runPolicyEvaluator } from "@/lib/agents/policyEvaluator/agent";
import { runFraudDetector } from "@/lib/agents/fraudDetector/agent";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import type { ClaimSubmission, AgentTranscript } from "@/lib/types";

const mockVerifier = runDocumentVerifier as ReturnType<typeof vi.fn>;
const mockExtractor = runExtractor as ReturnType<typeof vi.fn>;
const mockEvaluator = runPolicyEvaluator as ReturnType<typeof vi.fn>;
const mockFraud = runFraudDetector as ReturnType<typeof vi.fn>;

// ── Test case loader ──────────────────────────────────────────────────────────

interface TestCase {
  case_id: string;
  case_name: string;
  description: string;
  input: Record<string, unknown>;
  expected: {
    decision?: string | null;
    rejection_reasons?: string[];
    approved_amount?: number;
    confidence_score?: string;
    system_must?: string[];
  };
}

const TEST_CASES: TestCase[] = (
  testCasesRaw as { test_cases: TestCase[] }
).test_cases;

function tc(id: string): TestCase {
  const found = TEST_CASES.find((t) => t.case_id === id);
  if (!found) throw new Error(`Test case ${id} not found`);
  return found;
}

// ── Submission builder (mirrors the eval API route) ──────────────────────────

function buildSubmission(input: Record<string, unknown>): ClaimSubmission {
  const documents = (input.documents as Array<Record<string, unknown>>).map(
    (d, i) => ({
      fileId: (d.file_id as string) ?? `F${i}`,
      fileName: `${d.file_id ?? `doc_${i}`}.jpg`,
      actualType: d.actual_type as ClaimSubmission["documents"][0]["actualType"],
      content: d.content as Record<string, unknown> | undefined,
      quality: (d.quality as ClaimSubmission["documents"][0]["quality"]) ?? undefined,
      patientNameOnDoc: d.patient_name as string | undefined,
    })
  );

  const claimsHistory = (
    (input.claims_history as Array<Record<string, unknown>>) ?? []
  ).map((c) => ({
    claimId: c.claim_id as string,
    date: c.date as string,
    amount: c.amount as number,
    provider: c.provider as string | undefined,
  }));

  return {
    memberId: input.member_id as string,
    policyId: input.policy_id as string,
    claimCategory: input.claim_category as ClaimSubmission["claimCategory"],
    treatmentDate: input.treatment_date as string,
    claimedAmount: input.claimed_amount as number,
    hospitalName: input.hospital_name as string | undefined,
    submittedBy: input.member_id as string,
    ytdClaimsAmount: input.ytd_claims_amount as number | undefined,
    claimsHistory: claimsHistory.length > 0 ? claimsHistory : undefined,
    simulateComponentFailure:
      input.simulate_component_failure === true || undefined,
    documents,
  };
}

// ── Shared stubs ──────────────────────────────────────────────────────────────

function transcript(name: string): AgentTranscript {
  return {
    agentName: name,
    model: "gemini-2.5-flash",
    turns: 1,
    toolCalls: [],
    finalOutput: null,
    latencyMs: 10,
    degraded: false,
  };
}

function verifierOk() {
  mockVerifier.mockResolvedValue({
    ok: true,
    transcript: transcript("documentVerifier"),
  });
}

function verifierFail(problem: object) {
  mockVerifier.mockResolvedValue({
    ok: false,
    problem,
    transcript: transcript("documentVerifier"),
  });
}

function extractorOk(
  documents = [
    { fileId: "F001", documentType: "PRESCRIPTION", documentConfidence: 0.96 },
  ]
) {
  mockExtractor.mockResolvedValue({
    documents,
    transcript: transcript("extractor"),
  });
}

function evaluatorResult(
  status: string,
  amount?: number,
  rejectionReasons?: string[],
  confidence = 0.93
) {
  mockEvaluator.mockResolvedValue({
    ok: true,
    decision: {
      status,
      approvedAmount: amount,
      rejectionReasons,
      rationale: `Decision: ${status}`,
      confidence,
      ...(amount != null
        ? {
            financialBreakdown: {
              gross: amount / 0.9,
              networkDiscountPercent: 0,
              networkDiscountAmount: 0,
              afterDiscount: amount / 0.9,
              copayPercent: 10,
              copayAmount: amount / 9,
              payable: amount,
            },
          }
        : {}),
    },
    transcript: {
      ...transcript("policyEvaluator"),
      toolCalls: amount != null
        ? [{ toolName: "apply_financials", args: {}, result: { payable: amount }, latencyMs: 1 }]
        : [],
    },
  });
}

function fraudClean() {
  mockFraud.mockResolvedValue({
    ok: true,
    assessment: {
      score: 0.04,
      requiresManualReview: false,
      rationale: "No fraud signals.",
      signals: [],
    },
    transcript: transcript("fraudDetector"),
  });
}

function fraudFlag(score: number, detail: string) {
  mockFraud.mockResolvedValue({
    ok: true,
    assessment: {
      score,
      requiresManualReview: true,
      rationale: detail,
      signals: [{ type: "SAME_DAY_CLAIMS", detail, count: 3, limit: 2 }],
    },
    transcript: transcript("fraudDetector"),
  });
}

beforeEach(() => vi.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// TC001 — Wrong document type → pipeline halts
// ─────────────────────────────────────────────────────────────────────────────

describe("TC001 — wrong document type → halt", () => {
  it("returns decision:null, documentProblem.type=WRONG_DOCUMENT_TYPE, no downstream agents called", async () => {
    const { input } = tc("TC001");

    verifierFail({
      type: "WRONG_DOCUMENT_TYPE",
      uploadedTypes: ["PRESCRIPTION"],
      requiredTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
      message: "Missing HOSPITAL_BILL. Uploaded: doc.jpg (PRESCRIPTION).",
    });

    const trace = await runPipeline("CLM_TC001", buildSubmission(input));

    // system_must: stop before any claim decision
    expect(trace.decision).toBeNull();

    // system_must: surface the specific wrong type
    expect(trace.documentProblem).not.toBeNull();
    expect(trace.documentProblem?.type).toBe("WRONG_DOCUMENT_TYPE");
    expect(
      (trace.documentProblem as { message?: string }).message
    ).toMatch(/HOSPITAL_BILL/);

    // Only verifier ran
    const stages = trace.stages.map((s) => s.name);
    expect(stages).toContain("documentVerifier");
    expect(stages).not.toContain("policyEvaluator");
    expect(trace.stages.find((s) => s.name === "documentVerifier")?.status).toBe("FAIL");

    expect(mockExtractor).not.toHaveBeenCalled();
    expect(mockEvaluator).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC002 — Unreadable document → halt, ask for re-upload
// ─────────────────────────────────────────────────────────────────────────────

describe("TC002 — unreadable document → halt", () => {
  it("returns decision:null, documentProblem.type=UNREADABLE, does not reject outright", async () => {
    const { input } = tc("TC002");

    verifierFail({
      type: "UNREADABLE",
      uploadedTypes: ["PHARMACY_BILL"],
      requiredTypes: ["PHARMACY_BILL"],
      message: "The pharmacy bill cannot be read. Please re-upload a clearer image.",
    });

    const trace = await runPipeline("CLM_TC002", buildSubmission(input));

    // system_must: identify unreadable doc, ask for re-upload, NOT reject
    expect(trace.decision).toBeNull();
    expect(trace.documentProblem?.type).toBe("UNREADABLE");
    // must not be a final rejection (decision is null, not REJECTED)
    expect(trace.decision?.status).toBeUndefined();

    expect(mockEvaluator).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC003 — Patient name mismatch across documents → halt
// ─────────────────────────────────────────────────────────────────────────────

describe("TC003 — patient name mismatch → halt", () => {
  it("returns decision:null, documentProblem.type=MEMBER_MISMATCH, surfaces names found", async () => {
    const { input } = tc("TC003");

    verifierFail({
      type: "MEMBER_MISMATCH",
      uploadedTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
      requiredTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
      message:
        "Documents belong to different patients: 'Ravi Kumar' (prescription) vs 'Priya Menon' (hospital bill).",
    });

    const trace = await runPipeline("CLM_TC003", buildSubmission(input));

    // system_must: detect mismatch, surface specific names, NOT proceed to decision
    expect(trace.decision).toBeNull();
    expect(trace.documentProblem?.type).toBe("MEMBER_MISMATCH");
    expect(
      (trace.documentProblem as { message?: string }).message
    ).toMatch(/Ravi Kumar|Priya Menon/);

    expect(mockEvaluator).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC004 — Clean consultation approval at ₹1,350 with confidence > 0.85
// ─────────────────────────────────────────────────────────────────────────────

describe("TC004 — clean consultation approval", () => {
  it("approves ₹1,350 with confidence > 0.85, all five stages present, no component failures", async () => {
    const { input, expected } = tc("TC004");

    verifierOk();
    extractorOk([
      { fileId: "F007", documentType: "PRESCRIPTION", documentConfidence: 0.96 },
      { fileId: "F008", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
    ]);
    evaluatorResult("APPROVED", 1350, undefined, 0.93);
    fraudClean();

    const trace = await runPipeline("CLM_TC004", buildSubmission(input));

    // Decision: APPROVED
    expect(trace.decision?.status).toBe(expected.decision);
    // Amount within ₹1 of expected
    expect(trace.decision?.approvedAmount).toBeDefined();
    expect(Math.abs((trace.decision?.approvedAmount ?? 0) - (expected.approved_amount ?? 1350))).toBeLessThanOrEqual(1);

    // confidence_score: above 0.85
    expect(trace.confidence.overall).toBeGreaterThan(0.85);

    // All five stages
    const stages = trace.stages.map((s) => s.name);
    expect(stages).toContain("documentVerifier");
    expect(stages).toContain("extractor");
    expect(stages).toContain("policyEvaluator");
    expect(stages).toContain("fraudDetector");
    expect(stages).toContain("decisionComposer");

    // No component failures
    expect(trace.componentFailures).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC005 — Waiting period → REJECTED with WAITING_PERIOD reason
// ─────────────────────────────────────────────────────────────────────────────

describe("TC005 — waiting period rejection", () => {
  it("returns REJECTED with WAITING_PERIOD in rejectionReasons", async () => {
    const { input, expected } = tc("TC005");

    verifierOk();
    extractorOk();
    evaluatorResult("REJECTED", undefined, ["WAITING_PERIOD"]);
    fraudClean();

    const trace = await runPipeline("CLM_TC005", buildSubmission(input));

    expect(trace.decision?.status).toBe("REJECTED");
    expect(trace.decision?.rejectionReasons).toContain("WAITING_PERIOD");
    expect(trace.componentFailures).toHaveLength(0);
    // Cross-check against test_cases.json expected
    for (const reason of expected.rejection_reasons ?? []) {
      expect(trace.decision?.rejectionReasons).toContain(reason);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC006 — Sub-limit cap → PARTIAL at ₹8,000
// ─────────────────────────────────────────────────────────────────────────────

describe("TC006 — sub-limit cap → PARTIAL", () => {
  it("returns PARTIAL with approvedAmount=₹8,000", async () => {
    const { input, expected } = tc("TC006");

    verifierOk();
    extractorOk([
      { fileId: "F011", documentType: "PRESCRIPTION", documentConfidence: 0.94 },
      { fileId: "F012", documentType: "HOSPITAL_BILL", documentConfidence: 0.93 },
    ]);
    evaluatorResult("PARTIAL", 8000);
    fraudClean();

    const trace = await runPipeline("CLM_TC006", buildSubmission(input));

    expect(trace.decision?.status).toBe("PARTIAL");
    expect(Math.abs((trace.decision?.approvedAmount ?? 0) - (expected.approved_amount ?? 8000))).toBeLessThanOrEqual(1);
    expect(trace.componentFailures).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC007 — Pre-auth missing → REJECTED with PRE_AUTH_MISSING
// ─────────────────────────────────────────────────────────────────────────────

describe("TC007 — pre-auth missing → REJECTED", () => {
  it("returns REJECTED with PRE_AUTH_MISSING reason", async () => {
    const { input, expected } = tc("TC007");

    verifierOk();
    extractorOk([
      { fileId: "F013", documentType: "HOSPITAL_BILL", documentConfidence: 0.94 },
    ]);
    evaluatorResult("REJECTED", undefined, ["PRE_AUTH_MISSING"]);
    fraudClean();

    const trace = await runPipeline("CLM_TC007", buildSubmission(input));

    expect(trace.decision?.status).toBe("REJECTED");
    expect(trace.decision?.rejectionReasons).toContain("PRE_AUTH_MISSING");
    for (const reason of expected.rejection_reasons ?? []) {
      expect(trace.decision?.rejectionReasons).toContain(reason);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC008 — Per-claim limit exceeded → REJECTED with PER_CLAIM_EXCEEDED
// ─────────────────────────────────────────────────────────────────────────────

describe("TC008 — per-claim limit exceeded → REJECTED", () => {
  it("returns REJECTED with PER_CLAIM_EXCEEDED reason", async () => {
    const { input, expected } = tc("TC008");

    verifierOk();
    extractorOk([
      { fileId: "F015", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
      { fileId: "F016", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
    ]);
    evaluatorResult("REJECTED", undefined, ["PER_CLAIM_EXCEEDED"]);
    fraudClean();

    const trace = await runPipeline("CLM_TC008", buildSubmission(input));

    expect(trace.decision?.status).toBe("REJECTED");
    expect(trace.decision?.rejectionReasons).toContain("PER_CLAIM_EXCEEDED");
    for (const reason of expected.rejection_reasons ?? []) {
      expect(trace.decision?.rejectionReasons).toContain(reason);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC009 — Fraud signals → MANUAL_REVIEW (overrides APPROVED)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC009 — fraud signals → MANUAL_REVIEW", () => {
  it("overrides an APPROVED decision to MANUAL_REVIEW when fraud signals are present", async () => {
    const { input } = tc("TC009");
    const fraudDetail = "3 claims on same day exceeds the same-day limit of 2.";

    verifierOk();
    extractorOk([
      { fileId: "F017", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
      { fileId: "F018", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
    ]);
    evaluatorResult("APPROVED", 4320, undefined, 0.91);
    fraudFlag(0.85, fraudDetail);

    const trace = await runPipeline("CLM_TC009", buildSubmission(input));

    expect(trace.decision?.status).toBe("MANUAL_REVIEW");

    // Rationale must mention the fraud signal
    expect(trace.decision?.rationale).toContain(fraudDetail);

    // Both evaluator and fraud stages ran
    const stages = trace.stages.map((s) => s.name);
    expect(stages).toContain("policyEvaluator");
    expect(stages).toContain("fraudDetector");
    // evaluator was PASS (it approved before fraud overrode)
    expect(trace.stages.find((s) => s.name === "policyEvaluator")?.status).toBe("PASS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC010 — In-network discount → APPROVED at ₹3,240
// ─────────────────────────────────────────────────────────────────────────────

describe("TC010 — in-network discount → APPROVED at ₹3,240", () => {
  it("applies network discount, returns APPROVED at ₹3,240", async () => {
    const { input, expected } = tc("TC010");

    verifierOk();
    extractorOk([
      { fileId: "F019", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
      { fileId: "F020", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
    ]);
    evaluatorResult("APPROVED", 3240, undefined, 0.93);
    fraudClean();

    const trace = await runPipeline("CLM_TC010", buildSubmission(input));

    expect(trace.decision?.status).toBe("APPROVED");
    expect(Math.abs((trace.decision?.approvedAmount ?? 0) - (expected.approved_amount ?? 3240))).toBeLessThanOrEqual(1);
    expect(trace.componentFailures).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC011 — Component failure → graceful degradation, decision still produced
// ─────────────────────────────────────────────────────────────────────────────

describe("TC011 — component failure → graceful degradation", () => {
  it("marks extractor DEGRADED, continues pipeline, lowers confidence, decision is not null", async () => {
    const { input } = tc("TC011");

    verifierOk();
    // Extractor throws to simulate component failure
    mockExtractor.mockRejectedValue(new Error("Simulated component failure"));
    evaluatorResult("APPROVED", 4000, undefined, 0.88);
    fraudClean();

    const trace = await runPipeline("CLM_TC011", buildSubmission(input));

    // Pipeline must not crash
    expect(trace).toBeDefined();

    // Decision produced
    expect(trace.decision).not.toBeNull();

    // Extractor is DEGRADED
    const extractorStage = trace.stages.find((s) => s.name === "extractor");
    expect(extractorStage?.status).toBe("DEGRADED");

    // componentFailures captures extractor
    const failure = trace.componentFailures.find((f) => f.component === "extractor");
    expect(failure).toBeDefined();
    expect(failure?.error).toContain("Simulated");

    // Confidence is lowered
    expect(trace.confidence.overall).toBeLessThan(0.85);

    // Rationale hints at degradation / manual review
    expect(trace.decision?.rationale?.toLowerCase()).toMatch(
      /manual review|degraded|component/
    );

    // All five stages still in trace
    const stages = trace.stages.map((s) => s.name);
    ["documentVerifier", "extractor", "policyEvaluator", "fraudDetector", "decisionComposer"].forEach(
      (name) => expect(stages).toContain(name)
    );
  });

  it("still produces a MANUAL_REVIEW decision when BOTH evaluator and fraud detector fail", async () => {
    const { input } = tc("TC011");

    verifierOk();
    mockExtractor.mockRejectedValue(new Error("extractor down"));
    mockEvaluator.mockRejectedValue(new Error("evaluator down"));
    mockFraud.mockRejectedValue(new Error("fraud down"));

    const trace = await runPipeline("CLM_TC011_double", buildSubmission(input));

    expect(trace).toBeDefined();
    expect(trace.decision).not.toBeNull();
    expect(trace.decision?.status).toBe("MANUAL_REVIEW");
    expect(trace.componentFailures.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC012 — Excluded condition → REJECTED with EXCLUDED_CONDITION + confidence > 0.90
// ─────────────────────────────────────────────────────────────────────────────

describe("TC012 — excluded condition → REJECTED with confidence > 0.90", () => {
  it("returns REJECTED with EXCLUDED_CONDITION and confidence > 0.90", async () => {
    const { input, expected } = tc("TC012");

    verifierOk();
    extractorOk([
      { fileId: "F023", documentType: "PRESCRIPTION", documentConfidence: 0.97 },
      { fileId: "F024", documentType: "HOSPITAL_BILL", documentConfidence: 0.97 },
    ]);
    evaluatorResult("REJECTED", undefined, ["EXCLUDED_CONDITION"], 0.95);
    fraudClean();

    const trace = await runPipeline("CLM_TC012", buildSubmission(input));

    expect(trace.decision?.status).toBe("REJECTED");
    expect(trace.decision?.rejectionReasons).toContain("EXCLUDED_CONDITION");

    // confidence_score: above 0.90
    expect(trace.confidence.overall).toBeGreaterThan(0.90);

    for (const reason of expected.rejection_reasons ?? []) {
      expect(trace.decision?.rejectionReasons).toContain(reason);
    }
  });
});
