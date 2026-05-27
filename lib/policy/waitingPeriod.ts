import { z } from "zod";
import { getMember, getWaitingPeriods } from "./loader";

// Keyword → specific_conditions key mapping
const CONDITION_KEYWORDS: [string, string][] = [
  ["diabetes", "diabetes"],
  ["hypertension", "hypertension"],
  ["thyroid", "thyroid_disorders"],
  ["joint replacement", "joint_replacement"],
  ["maternity", "maternity"],
  ["pregnancy", "maternity"],
  ["mental health", "mental_health"],
  ["psychiatric", "mental_health"],
  ["obesity", "obesity_treatment"],
  ["bariatric", "obesity_treatment"],
  ["hernia", "hernia"],
  ["cataract", "cataract"],
];

function detectConditionKey(diagnosis: string, treatment?: string): string | null {
  const text = `${diagnosis} ${treatment ?? ""}`.toLowerCase();
  for (const [keyword, key] of CONDITION_KEYWORDS) {
    if (text.includes(keyword)) return key;
  }
  return null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const CheckWaitingPeriodInputSchema = z.object({
  memberId: z.string(),
  diagnosis: z.string(),
  treatmentDate: z.string().date(),
  treatment: z.string().optional(),
});
export type CheckWaitingPeriodInput = z.infer<typeof CheckWaitingPeriodInputSchema>;

export const CheckWaitingPeriodOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    conditionKey: z.string().optional(),
    waitingDays: z.number().optional(),
    eligibleFrom: z.string().optional(),
  }),
});
export type CheckWaitingPeriodOutput = z.infer<typeof CheckWaitingPeriodOutputSchema>;

export function checkWaitingPeriod(input: CheckWaitingPeriodInput): CheckWaitingPeriodOutput {
  const member = getMember(input.memberId);
  if (!member) {
    return { passed: false, detail: `Member ${input.memberId} not found.`, data: {} };
  }

  const joinDate = member.join_date;
  if (!joinDate) {
    return { passed: true, detail: `Member ${input.memberId} has no join date; skipping waiting period check.`, data: {} };
  }

  const periods = getWaitingPeriods();

  // 1. Initial waiting period
  const initialEligible = addDays(joinDate, periods.initial_waiting_period_days);
  if (input.treatmentDate < initialEligible) {
    return {
      passed: false,
      detail: `Treatment on ${input.treatmentDate} is within the initial ${periods.initial_waiting_period_days}-day waiting period. Eligible from ${initialEligible}.`,
      data: { waitingDays: periods.initial_waiting_period_days, eligibleFrom: initialEligible },
    };
  }

  // 2. Specific condition waiting period
  const conditionKey = detectConditionKey(input.diagnosis, input.treatment);
  if (conditionKey) {
    const waitDays = (periods.specific_conditions as Record<string, number>)[conditionKey];
    if (waitDays != null) {
      const condEligible = addDays(joinDate, waitDays);
      if (input.treatmentDate < condEligible) {
        return {
          passed: false,
          detail: `Treatment on ${input.treatmentDate} is within the ${waitDays}-day waiting period for ${conditionKey}. Member will be eligible from ${condEligible}.`,
          data: { conditionKey, waitingDays: waitDays, eligibleFrom: condEligible },
        };
      }
    }
  }

  return {
    passed: true,
    detail: "No waiting period restrictions apply to this claim.",
    data: conditionKey ? { conditionKey } : {},
  };
}
