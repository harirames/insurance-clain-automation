import { z } from "zod";
import { getCategory } from "./loader";
import type { ClaimCategory } from "@/lib/types";

const LineItemInputSchema = z.object({
  description: z.string(),
  amount: z.number(),
});

export const SplitLineItemsInputSchema = z.object({
  claimCategory: z.string(),
  lineItems: z.array(LineItemInputSchema),
});
export type SplitLineItemsInput = z.infer<typeof SplitLineItemsInputSchema>;

const LineItemResultSchema = z.object({
  description: z.string(),
  amount: z.number(),
  status: z.enum(["COVERED", "EXCLUDED"]),
  reason: z.string().optional(),
});

export const SplitLineItemsOutputSchema = z.object({
  lineItems: z.array(LineItemResultSchema),
  coveredTotal: z.number(),
  excludedTotal: z.number(),
});
export type SplitLineItemsOutput = z.infer<typeof SplitLineItemsOutputSchema>;

function matchesList(description: string, list: string[]): string | undefined {
  const desc = description.toLowerCase();
  return list.find(
    (item) => desc.includes(item.toLowerCase()) || item.toLowerCase().includes(desc)
  );
}

export function splitLineItems(input: SplitLineItemsInput): SplitLineItemsOutput {
  const cat = getCategory(input.claimCategory as ClaimCategory) as Record<string, unknown> | undefined;

  const coveredList: string[] = [
    ...((cat?.covered_procedures as string[] | undefined) ?? []),
    ...((cat?.covered_items as string[] | undefined) ?? []),
  ];
  const excludedList: string[] = [
    ...((cat?.excluded_procedures as string[] | undefined) ?? []),
    ...((cat?.excluded_items as string[] | undefined) ?? []),
  ];

  const results = input.lineItems.map((item) => {
    // Check excluded list first
    const excludedMatch = matchesList(item.description, excludedList);
    if (excludedMatch) {
      return {
        description: item.description,
        amount: item.amount,
        status: "EXCLUDED" as const,
        reason: `"${excludedMatch}" is excluded under policy for ${input.claimCategory}`,
      };
    }

    // If a covered list exists, item must be on it
    if (coveredList.length > 0) {
      const coveredMatch = matchesList(item.description, coveredList);
      if (!coveredMatch) {
        return {
          description: item.description,
          amount: item.amount,
          status: "EXCLUDED" as const,
          reason: `"${item.description}" is not in the covered procedures list for ${input.claimCategory}`,
        };
      }
    }

    return { description: item.description, amount: item.amount, status: "COVERED" as const };
  });

  const coveredTotal = results
    .filter((r) => r.status === "COVERED")
    .reduce((s, r) => s + r.amount, 0);
  const excludedTotal = results
    .filter((r) => r.status === "EXCLUDED")
    .reduce((s, r) => s + r.amount, 0);

  return { lineItems: results, coveredTotal, excludedTotal };
}
