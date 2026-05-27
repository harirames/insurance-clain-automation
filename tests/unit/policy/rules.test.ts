import { describe, it, expect } from "vitest";

import { checkMemberEligibility } from "@/lib/policy/eligibility";
import { checkWaitingPeriod } from "@/lib/policy/waitingPeriod";
import { checkCategoryCoverage } from "@/lib/policy/coverage";
import { checkExclusions } from "@/lib/policy/exclusions";
import { splitLineItems } from "@/lib/policy/lineItems";
import { checkLimits } from "@/lib/policy/limits";
import { checkPreAuth } from "@/lib/policy/preAuth";
import { applyFinancials } from "@/lib/policy/financials";
import { checkSubmissionRules } from "@/lib/policy/submissionRules";

// ─── checkMemberEligibility ───────────────────────────────────────────────────

describe("checkMemberEligibility", () => {
  it("passes for a valid active member within policy window (TC004: EMP001)", () => {
    const result = checkMemberEligibility({ memberId: "EMP001", treatmentDate: "2024-11-01" });
    expect(result.passed).toBe(true);
    expect(result.data.memberName).toBe("Rajesh Kumar");
  });

  it("fails for unknown member", () => {
    const result = checkMemberEligibility({ memberId: "EMP999", treatmentDate: "2024-11-01" });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("EMP999");
  });

  it("fails for treatment date before policy start", () => {
    const result = checkMemberEligibility({ memberId: "EMP001", treatmentDate: "2024-03-01" });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("outside the policy period");
  });

  it("fails for treatment date after policy end", () => {
    const result = checkMemberEligibility({ memberId: "EMP001", treatmentDate: "2025-04-01" });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("outside the policy period");
  });
});

// ─── checkWaitingPeriod ───────────────────────────────────────────────────────

describe("checkWaitingPeriod", () => {
  it("TC005: rejects diabetes claim within 90-day waiting period", () => {
    // EMP005 joined 2024-09-01; diabetes wait = 90 days → eligible from 2024-11-29
    const result = checkWaitingPeriod({
      memberId: "EMP005",
      diagnosis: "Type 2 Diabetes Mellitus",
      treatmentDate: "2024-10-15",
    });
    expect(result.passed).toBe(false);
    expect(result.data.conditionKey).toBe("diabetes");
    expect(result.data.waitingDays).toBe(90);
    expect(result.data.eligibleFrom).toBe("2024-11-30");
  });

  it("TC004: passes for viral fever (no specific waiting period)", () => {
    const result = checkWaitingPeriod({
      memberId: "EMP001",
      diagnosis: "Viral Fever",
      treatmentDate: "2024-11-01",
    });
    expect(result.passed).toBe(true);
  });

  it("rejects claim within initial 30-day waiting period", () => {
    // EMP001 joined 2024-04-01; treat date 2024-04-15 (14 days in) → should fail
    const result = checkWaitingPeriod({
      memberId: "EMP001",
      diagnosis: "Common Cold",
      treatmentDate: "2024-04-15",
    });
    expect(result.passed).toBe(false);
    expect(result.data.waitingDays).toBe(30);
  });

  it("passes for diabetes treatment after the 90-day wait", () => {
    // EMP005 joined 2024-09-01; eligible from 2024-11-29; treat 2024-12-01 → pass
    const result = checkWaitingPeriod({
      memberId: "EMP005",
      diagnosis: "Type 2 Diabetes Mellitus",
      treatmentDate: "2024-12-01",
    });
    expect(result.passed).toBe(true);
  });

  it("TC012: obesity_treatment also has a waiting period", () => {
    // EMP009 joined 2024-04-01; obesity_treatment wait = 365 days; treat 2024-10-18 → fail
    const result = checkWaitingPeriod({
      memberId: "EMP009",
      diagnosis: "Morbid Obesity — BMI 37",
      treatmentDate: "2024-10-18",
    });
    expect(result.passed).toBe(false);
    expect(result.data.conditionKey).toBe("obesity_treatment");
  });
});

// ─── checkCategoryCoverage ────────────────────────────────────────────────────

describe("checkCategoryCoverage", () => {
  it("CONSULTATION is covered with 10% co-pay and 20% network discount", () => {
    const result = checkCategoryCoverage({ claimCategory: "CONSULTATION" });
    expect(result.passed).toBe(true);
    expect(result.data.copayPercent).toBe(10);
    expect(result.data.networkDiscountPercent).toBe(20);
  });

  it("DENTAL is covered with 0% co-pay", () => {
    const result = checkCategoryCoverage({ claimCategory: "DENTAL" });
    expect(result.passed).toBe(true);
    expect(result.data.copayPercent).toBe(0);
  });

  it("unknown category fails", () => {
    const result = checkCategoryCoverage({ claimCategory: "UNKNOWN" });
    expect(result.passed).toBe(false);
  });
});

// ─── checkExclusions ──────────────────────────────────────────────────────────

describe("checkExclusions", () => {
  it("TC012: obesity and bariatric treatment are excluded", () => {
    const result = checkExclusions({
      diagnosis: "Morbid Obesity — BMI 37",
      treatment: "Bariatric Consultation and Customised Diet Plan",
    });
    expect(result.passed).toBe(false);
    expect(result.data.matchedExclusions.length).toBeGreaterThan(0);
    const matched = result.data.matchedExclusions.join(" ").toLowerCase();
    expect(matched).toMatch(/obesity|bariatric/);
  });

  it("TC004: viral fever has no exclusions", () => {
    const result = checkExclusions({ diagnosis: "Viral Fever" });
    expect(result.passed).toBe(true);
    expect(result.data.matchedExclusions).toHaveLength(0);
  });

  it("TC010: acute bronchitis has no exclusions", () => {
    const result = checkExclusions({ diagnosis: "Acute Bronchitis" });
    expect(result.passed).toBe(true);
  });

  it("cosmetic procedure is excluded", () => {
    const result = checkExclusions({ diagnosis: "Nasal deviation", treatment: "Cosmetic rhinoplasty" });
    expect(result.passed).toBe(false);
    expect(result.data.matchedExclusions[0]).toMatch(/[Cc]osmetic/);
  });
});

// ─── splitLineItems ───────────────────────────────────────────────────────────

describe("splitLineItems", () => {
  it("TC006: dental root canal covered, teeth whitening excluded", () => {
    const result = splitLineItems({
      claimCategory: "DENTAL",
      lineItems: [
        { description: "Root Canal Treatment", amount: 8000 },
        { description: "Teeth Whitening", amount: 4000 },
      ],
    });
    expect(result.lineItems[0].status).toBe("COVERED");
    expect(result.lineItems[1].status).toBe("EXCLUDED");
    expect(result.coveredTotal).toBe(8000);
    expect(result.excludedTotal).toBe(4000);
  });

  it("CONSULTATION: all line items covered (no procedure list)", () => {
    const result = splitLineItems({
      claimCategory: "CONSULTATION",
      lineItems: [
        { description: "Consultation Fee", amount: 1000 },
        { description: "CBC Test", amount: 300 },
      ],
    });
    expect(result.lineItems.every((li) => li.status === "COVERED")).toBe(true);
    expect(result.coveredTotal).toBe(1300);
    expect(result.excludedTotal).toBe(0);
  });

  it("DENTAL: unknown procedure excluded when not in covered list", () => {
    const result = splitLineItems({
      claimCategory: "DENTAL",
      lineItems: [{ description: "Experimental Laser Treatment", amount: 5000 }],
    });
    expect(result.lineItems[0].status).toBe("EXCLUDED");
  });
});

// ─── checkLimits ──────────────────────────────────────────────────────────────

describe("checkLimits", () => {
  it("TC008: per-claim limit exceeded (₹7,500 > ₹5,000)", () => {
    const result = checkLimits({ claimedAmount: 7500, ytdClaimsAmount: 10000 });
    expect(result.passed).toBe(false);
    expect(result.data.limitType).toBe("PER_CLAIM");
    expect(result.data.limit).toBe(5000);
    expect(result.data.claimed).toBe(7500);
  });

  it("TC004: ₹1,500 is within limits", () => {
    const result = checkLimits({ claimedAmount: 1500, ytdClaimsAmount: 5000 });
    expect(result.passed).toBe(true);
  });

  it("TC010: ₹4,500 is within per-claim limit", () => {
    const result = checkLimits({ claimedAmount: 4500, ytdClaimsAmount: 8000 });
    expect(result.passed).toBe(true);
  });

  it("annual OPD limit exceeded", () => {
    const result = checkLimits({ claimedAmount: 5000, ytdClaimsAmount: 48000 });
    expect(result.passed).toBe(false);
    expect(result.data.limitType).toBe("ANNUAL_OPD");
    expect(result.data.remaining).toBe(2000);
  });
});

// ─── checkPreAuth ─────────────────────────────────────────────────────────────

describe("checkPreAuth", () => {
  it("TC007: MRI without pre-auth above threshold fails", () => {
    const result = checkPreAuth({
      claimCategory: "DIAGNOSTIC",
      tests: ["MRI Lumbar Spine"],
      amount: 15000,
      preAuthProvided: false,
    });
    expect(result.passed).toBe(false);
    expect(result.data.requiredFor).toContain("MRI");
    expect(result.data.threshold).toBe(10000);
    expect(result.detail).toContain("resubmit");
  });

  it("MRI below threshold does not require pre-auth", () => {
    const result = checkPreAuth({
      claimCategory: "DIAGNOSTIC",
      tests: ["MRI Lumbar Spine"],
      amount: 8000,
      preAuthProvided: false,
    });
    expect(result.passed).toBe(true);
  });

  it("MRI with pre-auth provided passes", () => {
    const result = checkPreAuth({
      claimCategory: "DIAGNOSTIC",
      tests: ["MRI Lumbar Spine"],
      amount: 15000,
      preAuthProvided: true,
    });
    expect(result.passed).toBe(true);
  });

  it("CONSULTATION has no pre-auth requirements", () => {
    const result = checkPreAuth({
      claimCategory: "CONSULTATION",
      amount: 3000,
      preAuthProvided: false,
    });
    expect(result.passed).toBe(true);
  });
});

// ─── applyFinancials ──────────────────────────────────────────────────────────

describe("applyFinancials", () => {
  it("TC004: no network discount + 10% co-pay → ₹1,350 payable", () => {
    const result = applyFinancials({
      amount: 1500,
      claimCategory: "CONSULTATION",
      hospitalName: "City Clinic, Bengaluru",
    });
    expect(result.gross).toBe(1500);
    expect(result.networkDiscountPercent).toBe(0);
    expect(result.networkDiscountAmount).toBe(0);
    expect(result.afterDiscount).toBe(1500);
    expect(result.copayPercent).toBe(10);
    expect(result.copayAmount).toBe(150);
    expect(result.payable).toBe(1350);
  });

  it("TC010: network discount 20% THEN co-pay 10% → ₹3,240 payable", () => {
    const result = applyFinancials({
      amount: 4500,
      claimCategory: "CONSULTATION",
      hospitalName: "Apollo Hospitals",
    });
    expect(result.gross).toBe(4500);
    expect(result.networkDiscountPercent).toBe(20);
    expect(result.networkDiscountAmount).toBe(900);
    expect(result.afterDiscount).toBe(3600);
    expect(result.copayPercent).toBe(10);
    expect(result.copayAmount).toBe(360);
    expect(result.payable).toBe(3240);
  });

  it("TC006: dental has no co-pay, full covered amount payable", () => {
    const result = applyFinancials({
      amount: 8000,
      claimCategory: "DENTAL",
      hospitalName: "Smile Dental Clinic",
    });
    expect(result.copayPercent).toBe(0);
    expect(result.copayAmount).toBe(0);
    expect(result.payable).toBe(8000);
  });

  it("network discount is applied BEFORE co-pay (order invariant)", () => {
    const result = applyFinancials({
      amount: 4500,
      claimCategory: "CONSULTATION",
      hospitalName: "Apollo Hospitals",
    });
    // If discount were applied AFTER co-pay: 4500*0.9 = 4050 * 0.8 = 3240 (coincidentally same)
    // Correct: 4500 * 0.8 = 3600 * 0.9 = 3240
    // Different amount: 4000 × 0.8 × 0.9 = 2880 vs 4000 × 0.9 × 0.8 = 2880 (same)
    // Use a case where order matters: amount = 1000, discount 20%, copay 10%
    // Correct: 1000*0.8=800, 800*0.9=720
    // Wrong:   1000*0.9=900, 900*0.8=720  (same again — math commutes for percentages)
    // The key is the BASE for copay: must be after-discount, not gross
    expect(result.afterDiscount).toBe(3600);
    expect(result.copayAmount).toBe(360);  // 10% of 3600, not 10% of 4500
  });
});

// ─── checkSubmissionRules ─────────────────────────────────────────────────────

describe("checkSubmissionRules", () => {
  it("passes for valid amount submitted same day as treatment", () => {
    const result = checkSubmissionRules({
      treatmentDate: "2024-11-01",
      claimedAmount: 1500,
      submissionDate: "2024-11-01",
    });
    expect(result.passed).toBe(true);
  });

  it("fails when claimed amount is below minimum (₹500)", () => {
    const result = checkSubmissionRules({
      treatmentDate: "2024-11-01",
      claimedAmount: 200,
      submissionDate: "2024-11-01",
    });
    expect(result.passed).toBe(false);
    expect(result.data.minimum).toBe(500);
    expect(result.data.claimed).toBe(200);
  });

  it("fails when submitted more than 30 days after treatment", () => {
    const result = checkSubmissionRules({
      treatmentDate: "2024-10-01",
      claimedAmount: 1500,
      submissionDate: "2024-11-15",
    });
    expect(result.passed).toBe(false);
    expect(result.data.daysLate).toBeGreaterThan(0);
    expect(result.detail).toContain("deadline");
  });

  it("passes on exactly the 30th day", () => {
    const result = checkSubmissionRules({
      treatmentDate: "2024-10-01",
      claimedAmount: 1500,
      submissionDate: "2024-10-31",
    });
    expect(result.passed).toBe(true);
  });
});
