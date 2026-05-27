import { z } from "zod";
import { getCategory } from "./loader";
import type { ClaimCategory } from "@/lib/types";

export const CheckCoverageInputSchema = z.object({
  claimCategory: z.string(),
});
export type CheckCoverageInput = z.infer<typeof CheckCoverageInputSchema>;

export const CheckCoverageOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    subLimit: z.number().optional(),
    copayPercent: z.number().optional(),
    networkDiscountPercent: z.number().optional(),
  }),
});
export type CheckCoverageOutput = z.infer<typeof CheckCoverageOutputSchema>;

export function checkCategoryCoverage(input: CheckCoverageInput): CheckCoverageOutput {
  const cat = getCategory(input.claimCategory as ClaimCategory) as Record<string, unknown> | undefined;

  if (!cat) {
    return {
      passed: false,
      detail: `Claim category "${input.claimCategory}" is not recognised under this policy.`,
      data: {},
    };
  }

  if (!cat.covered) {
    return {
      passed: false,
      detail: `Category "${input.claimCategory}" is not covered under this policy.`,
      data: {},
    };
  }

  return {
    passed: true,
    detail: `Category "${input.claimCategory}" is covered.`,
    data: {
      subLimit: cat.sub_limit as number | undefined,
      copayPercent: cat.copay_percent as number | undefined,
      networkDiscountPercent: cat.network_discount_percent as number | undefined,
    },
  };
}
