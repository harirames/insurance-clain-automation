import { z } from "zod";
import { getCategory, isNetworkHospital } from "./loader";
import type { ClaimCategory } from "@/lib/types";

export const ApplyFinancialsInputSchema = z.object({
  amount: z.number().positive(),
  claimCategory: z.string(),
  hospitalName: z.string().optional(),
});
export type ApplyFinancialsInput = z.infer<typeof ApplyFinancialsInputSchema>;

export const ApplyFinancialsOutputSchema = z.object({
  gross: z.number(),
  networkDiscountPercent: z.number(),
  networkDiscountAmount: z.number(),
  afterDiscount: z.number(),
  copayPercent: z.number(),
  copayAmount: z.number(),
  payable: z.number(),
});
export type ApplyFinancialsOutput = z.infer<typeof ApplyFinancialsOutputSchema>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function applyFinancials(input: ApplyFinancialsInput): ApplyFinancialsOutput {
  const cat = getCategory(input.claimCategory as ClaimCategory) as Record<string, unknown> | undefined;
  const gross = input.amount;

  // Step 1: Network discount — applied first (TC010 invariant)
  const catNetworkDiscountPct = (cat?.network_discount_percent as number | undefined) ?? 0;
  const inNetwork = input.hospitalName ? isNetworkHospital(input.hospitalName) : false;
  const networkDiscountPercent = inNetwork ? catNetworkDiscountPct : 0;
  const networkDiscountAmount = round2((gross * networkDiscountPercent) / 100);
  const afterDiscount = round2(gross - networkDiscountAmount);

  // Step 2: Co-pay on the after-discount amount
  const copayPercent = (cat?.copay_percent as number | undefined) ?? 0;
  const copayAmount = round2((afterDiscount * copayPercent) / 100);
  const payable = round2(afterDiscount - copayAmount);

  return {
    gross,
    networkDiscountPercent,
    networkDiscountAmount,
    afterDiscount,
    copayPercent,
    copayAmount,
    payable,
  };
}
