import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the individual agents — the orchestrator is deterministic, agents are the LLM boundary
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

// ─── Shared transcript stub ───────────────────────────────────────────────────

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

// ─── Reusable agent stubs ─────────────────────────────────────────────────────

function verifierOk() {
  mockVerifier.mockResolvedValue({ ok: true, transcript: transcript("documentVerifier") });
}

function verifierFail(problem: object) {
  mockVerifier.mockResolvedValue({
    ok: false,
    problem,
    transcript: transcript("documentVerifier"),
  });
}

function extractorOk(documents = [{ fileId: "F001", documentType: "PRESCRIPTION", documentConfidence: 0.95 }]) {
  mockExtractor.mockResolvedValue({
    documents,
    transcript: transcript("extractor"),
  });
}

function evaluatorApproved(amount: number, confidence = 0.92) {
  mockEvaluator.mockResolvedValue({
    ok: true,
    decision: {
      status: "APPROVED",
      approvedAmount: amount,
      rationale: `All checks passed. Payable ₹${amount}.`,
      confidence,
      financialBreakdown: {
        gross: amount / 0.9,
        networkDiscountPercent: 0,
        networkDiscountAmount: 0,
        afterDiscount: amount / 0.9,
        copayPercent: 10,
        copayAmount: amount / 9,
        payable: amount,
      },
    },
    transcript: { ...transcript("policyEvaluator"), toolCalls: [{ toolName: "apply_financials", args: {}, result: { payable: amount }, latencyMs: 1 }] },
  });
}

function evaluatorRejected(reason: string) {
  mockEvaluator.mockResolvedValue({
    ok: true,
    decision: {
      status: "REJECTED",
      rejectionReasons: [reason],
      rationale: `Rejected: ${reason}`,
      confidence: 0.95,
    },
    transcript: transcript("policyEvaluator"),
  });
}

function fraudClean() {
  mockFraud.mockResolvedValue({
    ok: true,
    assessment: {
      score: 0.05,
      requiresManualReview: false,
      rationale: "No fraud signals.",
      signals: [],
    },
    transcript: transcript("fraudDetector"),
  });
}

function fraudManualReview(score: number, signalDetail: string, count: number, limit: number) {
  mockFraud.mockResolvedValue({
    ok: true,
    assessment: {
      score,
      requiresManualReview: true,
      rationale: signalDetail,
      signals: [{ type: "SAME_DAY_CLAIMS", detail: signalDetail, count, limit }],
    },
    transcript: transcript("fraudDetector"),
  });
}

beforeEach(() => vi.clearAllMocks());

// ─── TC001 — document verifier halts pipeline ─────────────────────────────────

describe("orchestrator — TC001 (document halt)", () => {
  it("returns decision: null and documentProblem when verifier fails", async () => {
    verifierFail({
      type: "WRONG_DOCUMENT_TYPE",
      uploadedTypes: ["PRESCRIPTION"],
      requiredTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
      message:
        "Missing HOSPITAL_BILL. Uploaded: dr_sharma_prescription.jpg (PRESCRIPTION).",
    });

    const submission: ClaimSubmission = {
      memberId: "EMP001",
      policyId: "PLUM_GHI_2024",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-01",
      claimedAmount: 1500,
      submittedBy: "EMP001",
      documents: [
        { fileId: "F001", fileName: "dr_sharma_prescription.jpg", actualType: "PRESCRIPTION" },
      ],
    };

    const trace = await runPipeline("CLM_TC001", submission);

    // Pipeline halted — no decision
    expect(trace.decision).toBeNull();
    expect(trace.documentProblem).not.toBeNull();
    expect(trace.documentProblem?.type).toBe("WRONG_DOCUMENT_TYPE");

    // Only documentVerifier stage (pipeline stops at halt)
    const stageNames = trace.stages.map((s) => s.name);
    expect(stageNames).toContain("documentVerifier");
    expect(stageNames).not.toContain("policyEvaluator");

    // Verifier stage should be FAIL
    const verifierStage = trace.stages.find((s) => s.name === "documentVerifier");
    expect(verifierStage?.status).toBe("FAIL");

    // Extractor and agents never called
    expect(mockExtractor).not.toHaveBeenCalled();
    expect(mockEvaluator).not.toHaveBeenCalled();
  });
});

// ─── TC004 — clean consultation approval ─────────────────────────────────────

describe("orchestrator — TC004 (clean approval)", () => {
  it("approves consultation at ₹1,350 with full trace and no component failures", async () => {
    verifierOk();
    extractorOk([
      { fileId: "F007", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
      { fileId: "F008", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
    ]);
    evaluatorApproved(1350);
    fraudClean();

    const submission: ClaimSubmission = {
      memberId: "EMP001",
      policyId: "PLUM_GHI_2024",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-01",
      claimedAmount: 1500,
      ytdClaimsAmount: 5000,
      submittedBy: "EMP001",
      documents: [
        {
          fileId: "F007",
          fileName: "prescription.jpg",
          actualType: "PRESCRIPTION",
          content: { doctor_name: "Dr. Arun Sharma", diagnosis: "Viral Fever" },
        },
        {
          fileId: "F008",
          fileName: "bill.jpg",
          actualType: "HOSPITAL_BILL",
          content: { hospital_name: "City Clinic, Bengaluru", total: 1500 },
        },
      ],
    };

    const trace = await runPipeline("CLM_TC004", submission);

    expect(trace.decision).not.toBeNull();
    expect(trace.decision?.status).toBe("APPROVED");
    expect(trace.decision?.approvedAmount).toBe(1350);
    expect(trace.confidence.overall).toBeGreaterThan(0.7);

    // All five stages present
    const stageNames = trace.stages.map((s) => s.name);
    expect(stageNames).toContain("documentVerifier");
    expect(stageNames).toContain("extractor");
    expect(stageNames).toContain("policyEvaluator");
    expect(stageNames).toContain("fraudDetector");
    expect(stageNames).toContain("decisionComposer");

    // No component failures
    expect(trace.componentFailures).toHaveLength(0);

    // Agent transcripts are present
    const evalStage = trace.stages.find((s) => s.name === "policyEvaluator");
    expect(evalStage?.agentTranscript).toBeDefined();
  });
});

// ─── TC005 — waiting period rejection ────────────────────────────────────────

describe("orchestrator — TC005 (rejection passes through)", () => {
  it("returns REJECTED with WAITING_PERIOD from policy evaluator", async () => {
    verifierOk();
    extractorOk();
    evaluatorRejected("WAITING_PERIOD");
    fraudClean();

    const submission: ClaimSubmission = {
      memberId: "EMP005",
      policyId: "PLUM_GHI_2024",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-10-15",
      claimedAmount: 3000,
      submittedBy: "EMP005",
      documents: [
        { fileId: "F009", fileName: "prescription.jpg", actualType: "PRESCRIPTION" },
      ],
    };

    const trace = await runPipeline("CLM_TC005", submission);

    expect(trace.decision?.status).toBe("REJECTED");
    expect(trace.decision?.rejectionReasons).toContain("WAITING_PERIOD");
    expect(trace.componentFailures).toHaveLength(0);
  });
});

// ─── TC009 — fraud signals → MANUAL_REVIEW override ─────────────────────────

describe("orchestrator — TC009 (fraud → MANUAL_REVIEW)", () => {
  it("overrides APPROVED to MANUAL_REVIEW when fraud detector requires manual review", async () => {
    verifierOk();
    extractorOk([
      { fileId: "F017", documentType: "PRESCRIPTION", documentConfidence: 0.95 },
      { fileId: "F018", documentType: "HOSPITAL_BILL", documentConfidence: 0.95 },
    ]);
    evaluatorApproved(4320);
    fraudManualReview(
      0.85,
      "3 claims on 2024-10-30 exceeds the same-day limit of 2.",
      3,
      2
    );

    const submission: ClaimSubmission = {
      memberId: "EMP008",
      policyId: "PLUM_GHI_2024",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-10-30",
      claimedAmount: 4800,
      submittedBy: "EMP008",
      claimsHistory: [
        { claimId: "CLM_0081", date: "2024-10-30", amount: 1200, provider: "City Clinic A" },
        { claimId: "CLM_0082", date: "2024-10-30", amount: 1800, provider: "City Clinic B" },
        { claimId: "CLM_0083", date: "2024-10-30", amount: 2100, provider: "Wellness Center" },
      ],
      documents: [
        {
          fileId: "F017",
          fileName: "prescription.jpg",
          actualType: "PRESCRIPTION",
          content: { diagnosis: "Migraine" },
        },
        {
          fileId: "F018",
          fileName: "bill.jpg",
          actualType: "HOSPITAL_BILL",
          content: { total: 4800 },
        },
      ],
    };

    const trace = await runPipeline("CLM_TC009", submission);

    // Fraud overrides policy approval → MANUAL_REVIEW
    expect(trace.decision?.status).toBe("MANUAL_REVIEW");

    // Rationale mentions fraud signals
    const rationale = trace.decision?.rationale ?? "";
    expect(rationale).toContain("3 claims on 2024-10-30 exceeds the same-day limit of 2.");

    // Both evaluator and fraud detector stages present
    const stageNames = trace.stages.map((s) => s.name);
    expect(stageNames).toContain("policyEvaluator");
    expect(stageNames).toContain("fraudDetector");

    // Evaluator was originally APPROVED — confirm it ran
    const evalStage = trace.stages.find((s) => s.name === "policyEvaluator");
    expect(evalStage?.status).toBe("PASS");
  });
});

// ─── TC011 — component failure → graceful degradation ────────────────────────

describe("orchestrator — TC011 (graceful degradation)", () => {
  it("marks extractor DEGRADED, continues pipeline, lowers confidence, decision is not null", async () => {
    verifierOk();
    // Extractor throws — simulating TC011 simulateComponentFailure
    mockExtractor.mockRejectedValue(new Error("Simulated component failure"));
    evaluatorApproved(4000, 0.88);
    fraudClean();

    const submission: ClaimSubmission = {
      memberId: "EMP006",
      policyId: "PLUM_GHI_2024",
      claimCategory: "ALTERNATIVE_MEDICINE",
      treatmentDate: "2024-10-28",
      claimedAmount: 4000,
      submittedBy: "EMP006",
      simulateComponentFailure: true,
      documents: [
        { fileId: "F021", fileName: "prescription.jpg", actualType: "PRESCRIPTION" },
        { fileId: "F022", fileName: "bill.jpg", actualType: "HOSPITAL_BILL" },
      ],
    };

    const trace = await runPipeline("CLM_TC011", submission);

    // Must not crash
    expect(trace).toBeDefined();

    // Decision is produced (pipeline continues)
    expect(trace.decision).not.toBeNull();

    // Extractor is DEGRADED
    const extractorStage = trace.stages.find((s) => s.name === "extractor");
    expect(extractorStage?.status).toBe("DEGRADED");

    // componentFailures has the extractor entry
    const extractorFailure = trace.componentFailures.find(
      (f) => f.component === "extractor"
    );
    expect(extractorFailure).toBeDefined();
    expect(extractorFailure?.error).toContain("Simulated");

    // Overall confidence lowered (less than a clean run's 0.85+)
    expect(trace.confidence.overall).toBeLessThan(0.85);

    // Rationale mentions manual review or degradation
    const rationale = trace.decision?.rationale ?? "";
    expect(rationale.toLowerCase()).toMatch(/manual review|degraded|component/);

    // All stages present
    const stageNames = trace.stages.map((s) => s.name);
    expect(stageNames).toContain("documentVerifier");
    expect(stageNames).toContain("extractor");
    expect(stageNames).toContain("policyEvaluator");
    expect(stageNames).toContain("fraudDetector");
    expect(stageNames).toContain("decisionComposer");
  });

  it("still produces a decision even when BOTH evaluator and fraud detector fail", async () => {
    verifierOk();
    mockExtractor.mockRejectedValue(new Error("Simulated failure"));
    mockEvaluator.mockRejectedValue(new Error("Evaluator crash"));
    mockFraud.mockRejectedValue(new Error("Fraud crash"));

    const submission: ClaimSubmission = {
      memberId: "EMP001",
      policyId: "PLUM_GHI_2024",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-01",
      claimedAmount: 1500,
      submittedBy: "EMP001",
      documents: [
        { fileId: "F001", fileName: "doc.jpg", actualType: "PRESCRIPTION" },
      ],
    };

    const trace = await runPipeline("CLM_FAIL", submission);

    // Pipeline never crashes
    expect(trace).toBeDefined();
    expect(trace.decision).not.toBeNull();
    expect(trace.decision?.status).toBe("MANUAL_REVIEW");

    // componentFailures captures all failures
    expect(trace.componentFailures.length).toBeGreaterThanOrEqual(2);
  });
});
