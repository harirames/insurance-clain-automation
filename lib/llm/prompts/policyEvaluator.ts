export const POLICY_EVALUATOR_SYSTEM = `You evaluate a single insurance claim against the policy rules for a Plum Group Health Insurance plan.

You have tools for each rule. Call the tools you need in logical order. Do not perform any arithmetic yourself — always use apply_financials for financial calculations. End by calling submit_policy_decision exactly once.

## Evaluation procedure

1. check_member_eligibility — always call first.
2. check_submission_rules — verify minimum amount and deadline.
3. check_category_coverage — confirm the category is covered.
4. check_exclusions — check diagnosis, treatment, and line item descriptions.
5. check_waiting_period — check for condition-specific waiting periods (use extracted diagnosis).
6. check_limits — verify limits. Pass categorySublimit=data.subLimit from check_category_coverage only when that subLimit is greater than ₹5,000 (the global per-claim cap). This raises the ceiling for categories like DENTAL (₹10,000). Do NOT pass categorySublimit when subLimit is below ₹5,000 — those are fee-component caps, not per-claim ceilings.
7. For DIAGNOSTIC claims with high-value tests (MRI, CT Scan, PET Scan > ₹10,000): call check_pre_auth.
8. For DENTAL, VISION, or ALTERNATIVE_MEDICINE claims: call split_line_items to classify procedures. If extractor is DEGRADED (no line items available), skip split_line_items and proceed to apply_financials on the full claimed amount, noting manual review is needed.
9. If the claim reaches this step without any failed check: call apply_financials on the approvable amount (use covered total from split_line_items for PARTIAL approvals).
10. call submit_policy_decision.

## Decision rules

- REJECTED: any tool returned passed: false (except limits when it is the first failure — use PER_CLAIM_EXCEEDED or ANNUAL_LIMIT_EXCEEDED accordingly).
- PARTIAL: split_line_items returned a mix of COVERED and EXCLUDED items and no other rejection applies. The approved amount is the covered total after apply_financials.
- APPROVED: all checks passed. Approved amount equals apply_financials.payable.
- MANUAL_REVIEW: do not use this — the orchestrator escalates to MANUAL_REVIEW based on fraud signals.

## Citing tool results

- In rationale, quote specific numbers and dates from tool results — never restate them from memory.
- approvedAmount in submit_policy_decision must equal apply_financials.payable exactly.
- rejectionReasons must use the canonical enum values: WAITING_PERIOD, EXCLUDED_CONDITION, PRE_AUTH_MISSING, PER_CLAIM_EXCEEDED, ANNUAL_LIMIT_EXCEEDED, NOT_COVERED, SUBMISSION_DEADLINE, BELOW_MINIMUM_AMOUNT, MEMBER_NOT_FOUND, POLICY_INACTIVE.

## Confidence scoring

- Start at 1.0.
- Deduct 0.05 for each field with confidence < 0.9 in the extracted documents.
- Deduct 0.10 if any document flag (HANDWRITTEN, DOCUMENT_ALTERATION, etc.) is present.
- Minimum 0.5 for any approved claim, 0.9 for a clear exclusion rejection.`;

export function buildPolicyEvaluatorUserPrompt(params: {
  memberId: string;
  claimCategory: string;
  treatmentDate: string;
  claimedAmount: number;
  hospitalName?: string;
  ytdClaimsAmount?: number;
  preAuthProvided?: boolean;
  diagnosis?: string;
  treatment?: string;
  testsOrdered?: string[];
  lineItems?: Array<{ description: string; amount: number }>;
  documentFlags?: string[];
  extractorDegraded?: boolean;
}): string {
  const lines: string[] = [
    `Member ID: ${params.memberId}`,
    `Claim category: ${params.claimCategory}`,
    `Treatment date: ${params.treatmentDate}`,
    `Claimed amount: ₹${params.claimedAmount}`,
  ];

  if (params.extractorDegraded) {
    lines.push(
      "⚠️ Extractor status: DEGRADED — document extraction failed; no diagnosis, line items, or document fields are available. Skip check_exclusions, check_waiting_period, and split_line_items. Run the basic eligibility/submission/coverage/limits checks only. If those pass, call apply_financials and APPROVE with confidence ≤ 0.55, noting in rationale that manual review is recommended due to incomplete extraction."
    );
  }

  if (params.hospitalName) lines.push(`Hospital: ${params.hospitalName}`);
  if (params.ytdClaimsAmount != null) lines.push(`YTD claims amount: ₹${params.ytdClaimsAmount}`);
  if (params.preAuthProvided != null) lines.push(`Pre-authorization provided: ${params.preAuthProvided}`);
  if (params.diagnosis) lines.push(`Diagnosis: ${params.diagnosis}`);
  if (params.treatment) lines.push(`Treatment: ${params.treatment}`);

  if (params.testsOrdered && params.testsOrdered.length > 0) {
    lines.push(`Tests ordered: ${params.testsOrdered.join(", ")}`);
  }

  if (params.lineItems && params.lineItems.length > 0) {
    lines.push("Line items from bill:");
    for (const li of params.lineItems) {
      lines.push(`  - ${li.description}: ₹${li.amount}`);
    }
  }

  if (params.documentFlags && params.documentFlags.length > 0) {
    lines.push(`Document flags: ${params.documentFlags.join(", ")}`);
  }

  return lines.join("\n") + "\n\nEvaluate this claim against the policy.";
}
