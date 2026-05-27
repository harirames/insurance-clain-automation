import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm/gemini", () => ({
  generateWithTools: vi.fn(),
  MODELS: { flash: "gemini-2.5-flash", pro: "gemini-2.5-pro" },
}));

import { generateWithTools } from "@/lib/llm/gemini";
import { runPolicyEvaluator } from "@/lib/agents/policyEvaluator/agent";
import type { PolicyEvaluatorInput } from "@/lib/agents/policyEvaluator/agent";
import type { ExtractedDocument } from "@/lib/types";

const mockLLM = generateWithTools as ReturnType<typeof vi.fn>;

function modelTurn(name: string, args: Record<string, unknown>) {
  return {
    candidates: [
      { content: { role: "model", parts: [{ functionCall: { name, args } }] } },
    ],
  };
}

// ─── Shared extracted document fixtures ──────────────────────────────────────

const TC004_DOCS: ExtractedDocument[] = [
  {
    fileId: "F007",
    documentType: "PRESCRIPTION",
    diagnosis: { value: "Viral Fever", confidence: 0.95 },
    doctorName: { value: "Dr. Arun Sharma", confidence: 0.95 },
    documentConfidence: 0.95,
  },
  {
    fileId: "F008",
    documentType: "HOSPITAL_BILL",
    hospitalName: { value: "City Clinic, Bengaluru", confidence: 0.95 },
    lineItems: [
      { description: "Consultation Fee", amount: 1000, confidence: 0.95 },
      { description: "CBC Test", amount: 300, confidence: 0.95 },
      { description: "Dengue NS1 Test", amount: 200, confidence: 0.95 },
    ],
    totalAmount: { value: 1500, confidence: 0.95 },
    documentConfidence: 0.95,
  },
];

const TC004_INPUT: PolicyEvaluatorInput = {
  memberId: "EMP001",
  claimCategory: "CONSULTATION",
  treatmentDate: "2024-11-01",
  claimedAmount: 1500,
  ytdClaimsAmount: 5000,
  extractedDocuments: TC004_DOCS,
};

describe("policyEvaluator agent", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── TC004: clean consultation approval ──────────────────────────────────

  it("TC004: approves consultation claim for ₹1,350 after 10% co-pay", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP001", treatmentDate: "2024-11-01" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_submission_rules", { treatmentDate: "2024-11-01", claimedAmount: 1500, submissionDate: "2024-11-01" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_category_coverage", { claimCategory: "CONSULTATION" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_exclusions", { diagnosis: "Viral Fever" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_waiting_period", { memberId: "EMP001", diagnosis: "Viral Fever", treatmentDate: "2024-11-01" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_limits", { claimedAmount: 1500, ytdClaimsAmount: 5000 })
      )
      .mockResolvedValueOnce(
        modelTurn("apply_financials", { amount: 1500, claimCategory: "CONSULTATION", hospitalName: "City Clinic, Bengaluru" })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "APPROVED",
          approvedAmount: 1350,
          rationale: "All checks passed. Network discount 0%. Co-pay 10% on ₹1,500 = ₹150. Payable ₹1,350.",
          confidence: 0.92,
        })
      );

    const result = await runPolicyEvaluator(TC004_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("APPROVED");
      expect(result.decision.approvedAmount).toBe(1350);
      expect(result.decision.financialBreakdown?.payable).toBe(1350);
      expect(result.decision.financialBreakdown?.copayPercent).toBe(10);
      expect(result.decision.financialBreakdown?.networkDiscountPercent).toBe(0);
    }
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("apply_financials");
    expect(toolNames).toContain("submit_policy_decision");
  });

  // ─── TC005: waiting period rejection ─────────────────────────────────────

  it("TC005: rejects diabetes claim with WAITING_PERIOD and eligible-from date", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP005", treatmentDate: "2024-10-15" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_waiting_period", {
          memberId: "EMP005",
          diagnosis: "Type 2 Diabetes Mellitus",
          treatmentDate: "2024-10-15",
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "REJECTED",
          rejectionReasons: ["WAITING_PERIOD"],
          rationale: "Treatment on 2024-10-15 is within the 90-day diabetes waiting period. Member will be eligible from 2024-11-29.",
          confidence: 0.95,
        })
      );

    const result = await runPolicyEvaluator({
      memberId: "EMP005",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-10-15",
      claimedAmount: 3000,
      extractedDocuments: [
        {
          fileId: "F009",
          documentType: "PRESCRIPTION",
          diagnosis: { value: "Type 2 Diabetes Mellitus", confidence: 0.95 },
          documentConfidence: 0.95,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("REJECTED");
      expect(result.decision.rejectionReasons).toContain("WAITING_PERIOD");
      expect(result.decision.rationale).toContain("2024-11-29");
    }
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_waiting_period");
  });

  // ─── TC006: dental partial approval ──────────────────────────────────────

  it("TC006: partial approval for dental — ₹8,000 covered, ₹4,000 whitening excluded", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP002", treatmentDate: "2024-10-15" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_category_coverage", { claimCategory: "DENTAL" })
      )
      .mockResolvedValueOnce(
        modelTurn("split_line_items", {
          claimCategory: "DENTAL",
          lineItems: [
            { description: "Root Canal Treatment", amount: 8000 },
            { description: "Teeth Whitening", amount: 4000 },
          ],
        })
      )
      .mockResolvedValueOnce(
        modelTurn("apply_financials", { amount: 8000, claimCategory: "DENTAL", hospitalName: "Smile Dental Clinic" })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "PARTIAL",
          approvedAmount: 8000,
          lineItemsDecision: [
            { description: "Root Canal Treatment", amount: 8000, status: "COVERED" },
            { description: "Teeth Whitening", amount: 4000, status: "EXCLUDED", reason: "Cosmetic dental procedure excluded by policy" },
          ],
          rationale: "Root Canal Treatment is covered (₹8,000). Teeth Whitening is excluded as a cosmetic procedure.",
          confidence: 0.93,
        })
      );

    const result = await runPolicyEvaluator({
      memberId: "EMP002",
      claimCategory: "DENTAL",
      treatmentDate: "2024-10-15",
      claimedAmount: 12000,
      extractedDocuments: [
        {
          fileId: "F011",
          documentType: "HOSPITAL_BILL",
          hospitalName: { value: "Smile Dental Clinic", confidence: 0.95 },
          lineItems: [
            { description: "Root Canal Treatment", amount: 8000, confidence: 0.95 },
            { description: "Teeth Whitening", amount: 4000, confidence: 0.95 },
          ],
          totalAmount: { value: 12000, confidence: 0.95 },
          documentConfidence: 0.95,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("PARTIAL");
      expect(result.decision.approvedAmount).toBe(8000);
      expect(result.decision.lineItemsDecision).toHaveLength(2);
      const covered = result.decision.lineItemsDecision?.filter((li) => li.status === "COVERED");
      const excluded = result.decision.lineItemsDecision?.filter((li) => li.status === "EXCLUDED");
      expect(covered).toHaveLength(1);
      expect(excluded).toHaveLength(1);
    }
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("split_line_items");
  });

  // ─── TC007: pre-auth missing ──────────────────────────────────────────────

  it("TC007: rejects MRI claim above threshold with PRE_AUTH_MISSING", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP007", treatmentDate: "2024-11-02" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_pre_auth", {
          claimCategory: "DIAGNOSTIC",
          tests: ["MRI Lumbar Spine"],
          amount: 15000,
          preAuthProvided: false,
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "REJECTED",
          rejectionReasons: ["PRE_AUTH_MISSING"],
          rationale: "Pre-authorization required for MRI above ₹10,000. None was provided. Please obtain pre-authorization and resubmit.",
          confidence: 0.95,
        })
      );

    const result = await runPolicyEvaluator({
      memberId: "EMP007",
      claimCategory: "DIAGNOSTIC",
      treatmentDate: "2024-11-02",
      claimedAmount: 15000,
      preAuthProvided: false,
      extractedDocuments: [
        {
          fileId: "F012",
          documentType: "PRESCRIPTION",
          testsOrdered: ["MRI Lumbar Spine"],
          documentConfidence: 0.95,
        },
        {
          fileId: "F014",
          documentType: "HOSPITAL_BILL",
          lineItems: [{ description: "MRI Lumbar Spine", amount: 15000, confidence: 0.95 }],
          totalAmount: { value: 15000, confidence: 0.95 },
          documentConfidence: 0.95,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("REJECTED");
      expect(result.decision.rejectionReasons).toContain("PRE_AUTH_MISSING");
      expect(result.decision.rationale).toContain("resubmit");
    }
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_pre_auth");
  });

  // ─── TC008: per-claim limit exceeded ─────────────────────────────────────

  it("TC008: rejects claim with PER_CLAIM_EXCEEDED, citing ₹7,500 vs ₹5,000 limit", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP003", treatmentDate: "2024-10-20" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_limits", { claimedAmount: 7500, ytdClaimsAmount: 10000 })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "REJECTED",
          rejectionReasons: ["PER_CLAIM_EXCEEDED"],
          rationale: "Claimed amount ₹7,500 exceeds the per-claim limit of ₹5,000.",
          confidence: 0.97,
        })
      );

    const result = await runPolicyEvaluator({
      memberId: "EMP003",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-10-20",
      claimedAmount: 7500,
      ytdClaimsAmount: 10000,
      extractedDocuments: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("REJECTED");
      expect(result.decision.rejectionReasons).toContain("PER_CLAIM_EXCEEDED");
      expect(result.decision.rationale).toContain("7,500");
      expect(result.decision.rationale).toContain("5,000");
    }
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_limits");
  });

  // ─── TC010: network discount then co-pay ─────────────────────────────────

  it("TC010: approves Apollo Hospitals claim at ₹3,240 (20% discount then 10% co-pay)", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP010", treatmentDate: "2024-11-03" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_category_coverage", { claimCategory: "CONSULTATION" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_exclusions", { diagnosis: "Acute Bronchitis" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_waiting_period", { memberId: "EMP010", diagnosis: "Acute Bronchitis", treatmentDate: "2024-11-03" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_limits", { claimedAmount: 4500, ytdClaimsAmount: 8000 })
      )
      .mockResolvedValueOnce(
        modelTurn("apply_financials", { amount: 4500, claimCategory: "CONSULTATION", hospitalName: "Apollo Hospitals" })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "APPROVED",
          approvedAmount: 3240,
          rationale: "Network discount 20% on ₹4,500 = ₹900. After discount: ₹3,600. Co-pay 10% = ₹360. Payable: ₹3,240.",
          confidence: 0.94,
        })
      );

    const result = await runPolicyEvaluator({
      memberId: "EMP010",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-03",
      claimedAmount: 4500,
      hospitalName: "Apollo Hospitals",
      ytdClaimsAmount: 8000,
      extractedDocuments: [
        {
          fileId: "F019",
          documentType: "PRESCRIPTION",
          diagnosis: { value: "Acute Bronchitis", confidence: 0.95 },
          documentConfidence: 0.95,
        },
        {
          fileId: "F020",
          documentType: "HOSPITAL_BILL",
          hospitalName: { value: "Apollo Hospitals", confidence: 0.95 },
          lineItems: [
            { description: "Consultation Fee", amount: 1500, confidence: 0.95 },
            { description: "Medicines", amount: 3000, confidence: 0.95 },
          ],
          totalAmount: { value: 4500, confidence: 0.95 },
          documentConfidence: 0.95,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("APPROVED");
      expect(result.decision.approvedAmount).toBe(3240);
      expect(result.decision.financialBreakdown?.networkDiscountPercent).toBe(20);
      expect(result.decision.financialBreakdown?.networkDiscountAmount).toBe(900);
      expect(result.decision.financialBreakdown?.afterDiscount).toBe(3600);
      expect(result.decision.financialBreakdown?.copayPercent).toBe(10);
      expect(result.decision.financialBreakdown?.copayAmount).toBe(360);
      expect(result.decision.financialBreakdown?.payable).toBe(3240);
    }
  });

  // ─── TC012: excluded condition ────────────────────────────────────────────

  it("TC012: rejects bariatric/obesity claim with EXCLUDED_CONDITION", async () => {
    mockLLM
      .mockResolvedValueOnce(
        modelTurn("check_member_eligibility", { memberId: "EMP009", treatmentDate: "2024-10-18" })
      )
      .mockResolvedValueOnce(
        modelTurn("check_exclusions", {
          diagnosis: "Morbid Obesity — BMI 37",
          treatment: "Bariatric Consultation and Customised Diet Plan",
        })
      )
      .mockResolvedValueOnce(
        modelTurn("submit_policy_decision", {
          status: "REJECTED",
          rejectionReasons: ["EXCLUDED_CONDITION"],
          rationale: "Diagnosis 'Morbid Obesity' and treatment 'Bariatric Consultation' match excluded conditions: Obesity and weight loss programs; Bariatric surgery.",
          confidence: 0.97,
        })
      );

    const result = await runPolicyEvaluator({
      memberId: "EMP009",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-10-18",
      claimedAmount: 8000,
      extractedDocuments: [
        {
          fileId: "F023",
          documentType: "PRESCRIPTION",
          diagnosis: { value: "Morbid Obesity — BMI 37", confidence: 0.95 },
          treatment: { value: "Bariatric Consultation and Customised Diet Plan", confidence: 0.95 },
          documentConfidence: 0.95,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.status).toBe("REJECTED");
      expect(result.decision.rejectionReasons).toContain("EXCLUDED_CONDITION");
    }
    const toolNames = result.transcript.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toContain("check_exclusions");
  });

  // ─── Graceful degradation ─────────────────────────────────────────────────

  it("returns ok: false with error when LLM throws", async () => {
    mockLLM.mockRejectedValue(new Error("LLM timeout"));

    const result = await runPolicyEvaluator(TC004_INPUT);

    expect(result.ok).toBe(false);
    expect(result.transcript.degraded).toBe(true);
  });
});
