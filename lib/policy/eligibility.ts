import { z } from "zod";
import { getMember, getPolicy } from "./loader";

export const CheckEligibilityInputSchema = z.object({
  memberId: z.string(),
  treatmentDate: z.string().date(),
});
export type CheckEligibilityInput = z.infer<typeof CheckEligibilityInputSchema>;

export const CheckEligibilityOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    memberName: z.string().optional(),
    joinDate: z.string().optional(),
    policyStart: z.string().optional(),
    policyEnd: z.string().optional(),
  }),
});
export type CheckEligibilityOutput = z.infer<typeof CheckEligibilityOutputSchema>;

export function checkMemberEligibility(input: CheckEligibilityInput): CheckEligibilityOutput {
  const member = getMember(input.memberId);
  if (!member) {
    return {
      passed: false,
      detail: `Member ${input.memberId} not found in policy roster.`,
      data: {},
    };
  }

  const policy = getPolicy();
  const holder = policy.policy_holder;

  if (holder.renewal_status !== "ACTIVE") {
    return {
      passed: false,
      detail: `Policy ${policy.policy_id} is not active (status: ${holder.renewal_status}).`,
      data: { memberName: member.name },
    };
  }

  const { policy_start_date: start, policy_end_date: end } = holder;
  if (input.treatmentDate < start || input.treatmentDate > end) {
    return {
      passed: false,
      detail: `Treatment date ${input.treatmentDate} is outside the policy period (${start} to ${end}).`,
      data: { memberName: member.name, policyStart: start, policyEnd: end },
    };
  }

  return {
    passed: true,
    detail: `Member ${member.name} (${input.memberId}) is eligible. Policy is active and treatment is within the policy period.`,
    data: {
      memberName: member.name,
      joinDate: member.join_date,
      policyStart: start,
      policyEnd: end,
    },
  };
}
