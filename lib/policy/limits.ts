import { z } from "zod";
import { getPolicyCoverage } from "./loader";

export const CheckLimitsInputSchema = z.object({
  claimedAmount: z.number(),
  ytdClaimsAmount: z.number().optional(),
  // Category-specific sub-limit (from check_category_coverage result). When provided,
  // overrides the global per-claim limit for this category.
  categorySublimit: z.number().optional(),
});
export type CheckLimitsInput = z.infer<typeof CheckLimitsInputSchema>;

export const CheckLimitsOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    limitType: z.string().optional(),
    limit: z.number().optional(),
    claimed: z.number().optional(),
    ytd: z.number().optional(),
    remaining: z.number().optional(),
  }),
});
export type CheckLimitsOutput = z.infer<typeof CheckLimitsOutputSchema>;

export function checkLimits(input: CheckLimitsInput): CheckLimitsOutput {
  const coverage = getPolicyCoverage();

  // Category sub-limits that exceed the global cap raise the ceiling (e.g. DENTAL ₹10,000).
  // Sub-limits below the global cap are fee-component caps handled at the line-item level,
  // not hard per-claim ceilings — so we only override upward.
  const perClaimCeiling =
    input.categorySublimit != null && input.categorySublimit > coverage.per_claim_limit
      ? input.categorySublimit
      : coverage.per_claim_limit;

  const usingSublimit =
    input.categorySublimit != null && input.categorySublimit > coverage.per_claim_limit;

  // Per-claim hard ceiling
  if (input.claimedAmount > perClaimCeiling) {
    return {
      passed: false,
      detail: `Claimed amount ₹${input.claimedAmount} exceeds the ${
        usingSublimit ? "category sub-limit" : "per-claim limit"
      } of ₹${perClaimCeiling}.`,
      data: {
        limitType: usingSublimit ? "CATEGORY_SUBLIMIT" : "PER_CLAIM",
        limit: perClaimCeiling,
        claimed: input.claimedAmount,
      },
    };
  }

  // Annual OPD ceiling
  const ytd = input.ytdClaimsAmount ?? 0;
  if (ytd + input.claimedAmount > coverage.annual_opd_limit) {
    const remaining = Math.max(0, coverage.annual_opd_limit - ytd);
    return {
      passed: false,
      detail: `Adding ₹${input.claimedAmount} to YTD total ₹${ytd} exceeds the annual OPD limit of ₹${coverage.annual_opd_limit}. Available balance: ₹${remaining}.`,
      data: {
        limitType: "ANNUAL_OPD",
        limit: coverage.annual_opd_limit,
        claimed: input.claimedAmount,
        ytd,
        remaining,
      },
    };
  }

  const remaining = coverage.annual_opd_limit - ytd - input.claimedAmount;
  return {
    passed: true,
    detail: `Claimed ₹${input.claimedAmount} is within the ${
      usingSublimit ? `category sub-limit ₹${perClaimCeiling}` : `per-claim limit ₹${perClaimCeiling}`
    } and annual OPD limit. Annual balance after this claim: ₹${remaining}.`,
    data: {
      limit: coverage.per_claim_limit,
      claimed: input.claimedAmount,
      ytd,
      remaining,
    },
  };
}
