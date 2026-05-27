import { z } from "zod";
import { getPolicyCoverage } from "./loader";

export const CheckLimitsInputSchema = z.object({
  claimedAmount: z.number(),
  ytdClaimsAmount: z.number().optional(),
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

  // Per-claim hard ceiling
  if (input.claimedAmount > coverage.per_claim_limit) {
    return {
      passed: false,
      detail: `Claimed amount ₹${input.claimedAmount} exceeds the per-claim limit of ₹${coverage.per_claim_limit}.`,
      data: {
        limitType: "PER_CLAIM",
        limit: coverage.per_claim_limit,
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
    detail: `Claimed ₹${input.claimedAmount} is within per-claim limit ₹${coverage.per_claim_limit} and annual OPD limit. Annual balance after this claim: ₹${remaining}.`,
    data: {
      limit: coverage.per_claim_limit,
      claimed: input.claimedAmount,
      ytd,
      remaining,
    },
  };
}
