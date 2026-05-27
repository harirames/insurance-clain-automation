import { z } from "zod";
import { getSubmissionRules } from "./loader";

export const CheckSubmissionRulesInputSchema = z.object({
  treatmentDate: z.string().date(),
  claimedAmount: z.number(),
  submissionDate: z.string().date().optional(),
});
export type CheckSubmissionRulesInput = z.infer<typeof CheckSubmissionRulesInputSchema>;

export const CheckSubmissionRulesOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    deadline: z.string().optional(),
    daysLate: z.number().optional(),
    minimum: z.number().optional(),
    claimed: z.number().optional(),
  }),
});
export type CheckSubmissionRulesOutput = z.infer<typeof CheckSubmissionRulesOutputSchema>;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function checkSubmissionRules(input: CheckSubmissionRulesInput): CheckSubmissionRulesOutput {
  const rules = getSubmissionRules();

  if (input.claimedAmount < rules.minimum_claim_amount) {
    return {
      passed: false,
      detail: `Claimed amount ₹${input.claimedAmount} is below the minimum claim amount of ₹${rules.minimum_claim_amount}.`,
      data: { minimum: rules.minimum_claim_amount, claimed: input.claimedAmount },
    };
  }

  const submissionDate = input.submissionDate ?? new Date().toISOString().slice(0, 10);
  const deadline = addDays(input.treatmentDate, rules.deadline_days_from_treatment);

  if (submissionDate > deadline) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLate = Math.ceil(
      (new Date(submissionDate).getTime() - new Date(deadline).getTime()) / msPerDay
    );
    return {
      passed: false,
      detail: `Claim submitted ${daysLate} day(s) after the deadline of ${deadline} (${rules.deadline_days_from_treatment} days from treatment on ${input.treatmentDate}).`,
      data: { deadline, daysLate },
    };
  }

  return {
    passed: true,
    detail: `Claimed amount ₹${input.claimedAmount} meets the ₹${rules.minimum_claim_amount} minimum. Submission is within the ${rules.deadline_days_from_treatment}-day deadline (${deadline}).`,
    data: { deadline },
  };
}
