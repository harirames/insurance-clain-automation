import { z } from "zod";
import { getCategory } from "./loader";
import type { ClaimCategory } from "@/lib/types";

export const CheckPreAuthInputSchema = z.object({
  claimCategory: z.string(),
  tests: z.array(z.string()).optional(),
  lineItemDescriptions: z.array(z.string()).optional(),
  amount: z.number(),
  preAuthProvided: z.boolean(),
});
export type CheckPreAuthInput = z.infer<typeof CheckPreAuthInputSchema>;

export const CheckPreAuthOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    requiredFor: z.string().optional(),
    threshold: z.number().optional(),
  }),
});
export type CheckPreAuthOutput = z.infer<typeof CheckPreAuthOutputSchema>;

export function checkPreAuth(input: CheckPreAuthInput): CheckPreAuthOutput {
  const cat = getCategory(input.claimCategory as ClaimCategory) as Record<string, unknown> | undefined;

  const highValueTests = (cat?.high_value_tests_requiring_pre_auth as string[] | undefined) ?? [];
  const threshold = (cat?.pre_auth_threshold as number | undefined) ?? 0;

  if (highValueTests.length === 0) {
    return {
      passed: true,
      detail: `Category "${input.claimCategory}" has no high-value test pre-authorization requirements.`,
      data: {},
    };
  }

  const allDescriptions = [
    ...(input.tests ?? []),
    ...(input.lineItemDescriptions ?? []),
  ].map((s) => s.toLowerCase());

  for (const test of highValueTests) {
    const testLower = test.toLowerCase();
    const present = allDescriptions.some(
      (d) => d.includes(testLower) || testLower.split(" ").some((w) => d.includes(w))
    );

    if (present && input.amount > threshold) {
      if (!input.preAuthProvided) {
        return {
          passed: false,
          detail: `Pre-authorization is required for "${test}" when the amount exceeds ₹${threshold}. The claimed amount of ₹${input.amount} exceeds this threshold and no pre-authorization was provided. Please obtain pre-authorization and resubmit.`,
          data: { requiredFor: test, threshold },
        };
      }
    }
  }

  return {
    passed: true,
    detail: "Pre-authorization requirements are satisfied for this claim.",
    data: {},
  };
}
