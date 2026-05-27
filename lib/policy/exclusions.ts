import { z } from "zod";
import { getExclusions } from "./loader";

export const CheckExclusionsInputSchema = z.object({
  diagnosis: z.string(),
  treatment: z.string().optional(),
  lineItemDescriptions: z.array(z.string()).optional(),
});
export type CheckExclusionsInput = z.infer<typeof CheckExclusionsInputSchema>;

export const CheckExclusionsOutputSchema = z.object({
  passed: z.boolean(),
  detail: z.string(),
  data: z.object({
    matchedExclusions: z.array(z.string()),
  }),
});
export type CheckExclusionsOutput = z.infer<typeof CheckExclusionsOutputSchema>;

// Extract keywords >=5 chars from an exclusion condition string
function keywords(condition: string): string[] {
  return condition
    .toLowerCase()
    .split(/[\s,–\-—]+/)
    .filter((w) => w.length >= 5);
}

export function checkExclusions(input: CheckExclusionsInput): CheckExclusionsOutput {
  const exclusions = getExclusions();
  const searchText = [
    input.diagnosis,
    input.treatment ?? "",
    ...(input.lineItemDescriptions ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const matched: string[] = [];
  for (const condition of exclusions.conditions) {
    const kws = keywords(condition);
    if (kws.length > 0 && kws.some((kw) => searchText.includes(kw))) {
      matched.push(condition);
    }
  }

  if (matched.length > 0) {
    return {
      passed: false,
      detail: `Claim matches excluded policy condition(s): ${matched.join("; ")}.`,
      data: { matchedExclusions: matched },
    };
  }

  return {
    passed: true,
    detail: "No exclusions apply to this claim.",
    data: { matchedExclusions: [] },
  };
}
