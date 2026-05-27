import { describe, it, expect } from "vitest";

import {
  countSameDayClaimsTool,
  countMonthlyClaimsTool,
  checkHighValueThresholdTool,
  checkDocumentAlterationFlagsTool,
} from "@/lib/agents/fraudDetector/tools";

// ─── TC009 fixture: EMP008 with 3 same-day claims already ────────────────────

const TC009_HISTORY = [
  { claimId: "CLM_0081", date: "2024-10-30", amount: 1200, provider: "City Clinic A" },
  { claimId: "CLM_0082", date: "2024-10-30", amount: 1800, provider: "City Clinic B" },
  { claimId: "CLM_0083", date: "2024-10-30", amount: 2100, provider: "Wellness Center" },
];

// ─── count_same_day_claims ────────────────────────────────────────────────────

describe("countSameDayClaimsTool", () => {
  it("TC009: detects 3 same-day claims against limit of 2 — exceeded: true", async () => {
    const result = await countSameDayClaimsTool.run({
      memberId: "EMP008",
      treatmentDate: "2024-10-30",
      claimsHistory: TC009_HISTORY,
    });

    expect(result.count).toBe(3);
    expect(result.limit).toBe(2);
    expect(result.exceeded).toBe(true);
    expect(result.sameDayClaims).toHaveLength(3);
  });

  it("returns exceeded: false when count is below limit", async () => {
    const result = await countSameDayClaimsTool.run({
      memberId: "EMP001",
      treatmentDate: "2024-10-30",
      claimsHistory: [
        { claimId: "CLM_001", date: "2024-10-30", amount: 500, provider: "Clinic A" },
      ],
    });

    expect(result.count).toBe(1);
    expect(result.exceeded).toBe(false);
  });

  it("returns count 0 when no same-day claims exist", async () => {
    const result = await countSameDayClaimsTool.run({
      memberId: "EMP001",
      treatmentDate: "2024-11-01",
      claimsHistory: TC009_HISTORY, // all on 2024-10-30
    });

    expect(result.count).toBe(0);
    expect(result.exceeded).toBe(false);
    expect(result.sameDayClaims).toHaveLength(0);
  });

  it("returns exceeded: true when count exactly equals limit", async () => {
    // limit is 2; history has exactly 2 same-day claims → exceeded
    const result = await countSameDayClaimsTool.run({
      memberId: "EMP001",
      treatmentDate: "2024-10-30",
      claimsHistory: [
        { claimId: "CLM_001", date: "2024-10-30", amount: 500 },
        { claimId: "CLM_002", date: "2024-10-30", amount: 800 },
      ],
    });

    expect(result.count).toBe(2);
    expect(result.exceeded).toBe(true);
  });

  it("handles empty claims history", async () => {
    const result = await countSameDayClaimsTool.run({
      memberId: "EMP001",
      treatmentDate: "2024-11-01",
      claimsHistory: [],
    });

    expect(result.count).toBe(0);
    expect(result.exceeded).toBe(false);
  });
});

// ─── count_monthly_claims ─────────────────────────────────────────────────────

describe("countMonthlyClaimsTool", () => {
  it("TC009: counts all 3 same-month claims in October 2024", async () => {
    const result = await countMonthlyClaimsTool.run({
      memberId: "EMP008",
      treatmentDate: "2024-10-30",
      claimsHistory: TC009_HISTORY,
    });

    // limit is 6; 3 claims this month → not exceeded
    expect(result.count).toBe(3);
    expect(result.limit).toBe(6);
    expect(result.exceeded).toBe(false);
  });

  it("returns exceeded: true when monthly count reaches limit", async () => {
    // Build 6 claims in the same month
    const history = Array.from({ length: 6 }, (_, i) => ({
      claimId: `CLM_${i}`,
      date: "2024-10-30",
      amount: 500,
    }));

    const result = await countMonthlyClaimsTool.run({
      memberId: "EMP001",
      treatmentDate: "2024-10-15",
      claimsHistory: history,
    });

    expect(result.count).toBe(6);
    expect(result.exceeded).toBe(true);
  });

  it("ignores claims from different months", async () => {
    const result = await countMonthlyClaimsTool.run({
      memberId: "EMP001",
      treatmentDate: "2024-11-01",
      claimsHistory: TC009_HISTORY, // all in October
    });

    expect(result.count).toBe(0);
    expect(result.exceeded).toBe(false);
  });
});

// ─── check_high_value_threshold ───────────────────────────────────────────────

describe("checkHighValueThresholdTool", () => {
  it("TC009: ₹4,800 is below high-value threshold (₹25,000) — not exceeded", async () => {
    const result = await checkHighValueThresholdTool.run({ claimedAmount: 4800 });

    expect(result.threshold).toBe(25000);
    expect(result.exceeded).toBe(false);
    expect(result.autoReviewTriggered).toBe(false);
  });

  it("triggers exceeded and autoReview when amount equals auto_manual_review_above", async () => {
    const result = await checkHighValueThresholdTool.run({ claimedAmount: 25000 });

    expect(result.exceeded).toBe(false); // threshold is 25000; > not >=
    expect(result.autoReviewTriggered).toBe(true); // autoReview uses >= 25000
  });

  it("triggers exceeded when amount is above high_value_claim_threshold", async () => {
    const result = await checkHighValueThresholdTool.run({ claimedAmount: 30000 });

    expect(result.exceeded).toBe(true);
    expect(result.autoReviewTriggered).toBe(true);
  });
});

// ─── check_document_alteration_flags ─────────────────────────────────────────

describe("checkDocumentAlterationFlagsTool", () => {
  it("returns empty alteredDocuments when no alteration flags present", async () => {
    const result = await checkDocumentAlterationFlagsTool.run({
      extractedDocuments: [
        { fileId: "F017", flags: ["HANDWRITTEN"] },
        { fileId: "F018", flags: [] },
      ],
    });

    expect(result.alteredDocuments).toHaveLength(0);
  });

  it("detects DOCUMENT_ALTERATION flag", async () => {
    const result = await checkDocumentAlterationFlagsTool.run({
      extractedDocuments: [
        { fileId: "F017", flags: ["DOCUMENT_ALTERATION", "LOW_CONFIDENCE"] },
        { fileId: "F018", flags: [] },
      ],
    });

    expect(result.alteredDocuments).toHaveLength(1);
    expect(result.alteredDocuments[0].fileId).toBe("F017");
    expect(result.alteredDocuments[0].reason).toContain("DOCUMENT_ALTERATION");
  });

  it("detects TAMPERED flag case-insensitively", async () => {
    const result = await checkDocumentAlterationFlagsTool.run({
      extractedDocuments: [{ fileId: "F001", flags: ["tampered_signature"] }],
    });

    expect(result.alteredDocuments).toHaveLength(1);
    expect(result.alteredDocuments[0].fileId).toBe("F001");
  });

  it("returns empty list when documents have no flags", async () => {
    const result = await checkDocumentAlterationFlagsTool.run({
      extractedDocuments: [{ fileId: "F001" }, { fileId: "F002" }],
    });

    expect(result.alteredDocuments).toHaveLength(0);
  });
});
