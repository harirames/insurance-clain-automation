import { z } from "zod";
import type { Tool } from "@/lib/agents/types";
import {
  checkMemberEligibility,
  CheckEligibilityInputSchema,
  CheckEligibilityOutputSchema,
  type CheckEligibilityInput,
  type CheckEligibilityOutput,
} from "@/lib/policy/eligibility";
import {
  checkWaitingPeriod,
  CheckWaitingPeriodInputSchema,
  CheckWaitingPeriodOutputSchema,
  type CheckWaitingPeriodInput,
  type CheckWaitingPeriodOutput,
} from "@/lib/policy/waitingPeriod";
import {
  checkCategoryCoverage,
  CheckCoverageInputSchema,
  CheckCoverageOutputSchema,
  type CheckCoverageInput,
  type CheckCoverageOutput,
} from "@/lib/policy/coverage";
import {
  checkExclusions,
  CheckExclusionsInputSchema,
  CheckExclusionsOutputSchema,
  type CheckExclusionsInput,
  type CheckExclusionsOutput,
} from "@/lib/policy/exclusions";
import {
  splitLineItems,
  SplitLineItemsInputSchema,
  SplitLineItemsOutputSchema,
  type SplitLineItemsInput,
  type SplitLineItemsOutput,
} from "@/lib/policy/lineItems";
import {
  checkLimits,
  CheckLimitsInputSchema,
  CheckLimitsOutputSchema,
  type CheckLimitsInput,
  type CheckLimitsOutput,
} from "@/lib/policy/limits";
import {
  checkPreAuth,
  CheckPreAuthInputSchema,
  CheckPreAuthOutputSchema,
  type CheckPreAuthInput,
  type CheckPreAuthOutput,
} from "@/lib/policy/preAuth";
import {
  applyFinancials,
  ApplyFinancialsInputSchema,
  ApplyFinancialsOutputSchema,
  type ApplyFinancialsInput,
  type ApplyFinancialsOutput,
} from "@/lib/policy/financials";
import {
  checkSubmissionRules,
  CheckSubmissionRulesInputSchema,
  CheckSubmissionRulesOutputSchema,
  type CheckSubmissionRulesInput,
  type CheckSubmissionRulesOutput,
} from "@/lib/policy/submissionRules";
import { PolicyEvaluatorOutputSchema, type PolicyEvaluatorOutput } from "./schema";

// ─── Rule tools (1:1 wrappers around lib/policy/* pure functions) ─────────────

export const checkMemberEligibilityTool: Tool<CheckEligibilityInput, CheckEligibilityOutput> = {
  name: "check_member_eligibility",
  description: "Verify the member exists in the policy roster and that the treatment date falls within the active policy period.",
  inputSchema: CheckEligibilityInputSchema,
  outputSchema: CheckEligibilityOutputSchema,
  async run(input) { return checkMemberEligibility(input); },
};

export const checkWaitingPeriodTool: Tool<CheckWaitingPeriodInput, CheckWaitingPeriodOutput> = {
  name: "check_waiting_period",
  description: "Check whether the treatment date falls within the initial waiting period or a condition-specific waiting period (diabetes, hypertension, etc.). Returns the eligible-from date when failing.",
  inputSchema: CheckWaitingPeriodInputSchema,
  outputSchema: CheckWaitingPeriodOutputSchema,
  async run(input) { return checkWaitingPeriod(input); },
};

export const checkCoverageTool: Tool<CheckCoverageInput, CheckCoverageOutput> = {
  name: "check_category_coverage",
  description: "Check whether the claim category is covered under the policy and retrieve its co-pay and discount parameters.",
  inputSchema: CheckCoverageInputSchema,
  outputSchema: CheckCoverageOutputSchema,
  async run(input) { return checkCategoryCoverage(input); },
};

export const checkExclusionsTool: Tool<CheckExclusionsInput, CheckExclusionsOutput> = {
  name: "check_exclusions",
  description: "Check whether the diagnosis, treatment, or line items match any excluded conditions in the policy (e.g. bariatric surgery, cosmetic procedures, substance abuse).",
  inputSchema: CheckExclusionsInputSchema,
  outputSchema: CheckExclusionsOutputSchema,
  async run(input) { return checkExclusions(input); },
};

export const splitLineItemsTool: Tool<SplitLineItemsInput, SplitLineItemsOutput> = {
  name: "split_line_items",
  description: "Classify each bill line item as COVERED or EXCLUDED for categories that have procedure-level coverage rules (DENTAL, VISION, ALTERNATIVE_MEDICINE). Returns covered and excluded totals.",
  inputSchema: SplitLineItemsInputSchema,
  outputSchema: SplitLineItemsOutputSchema,
  async run(input) { return splitLineItems(input); },
};

export const checkLimitsTool: Tool<CheckLimitsInput, CheckLimitsOutput> = {
  name: "check_limits",
  description: "Check whether the claimed amount exceeds the per-claim limit (₹5,000) or the annual OPD limit (₹50,000). Returns the limit type and both amounts when failing.",
  inputSchema: CheckLimitsInputSchema,
  outputSchema: CheckLimitsOutputSchema,
  async run(input) { return checkLimits(input); },
};

export const checkPreAuthTool: Tool<CheckPreAuthInput, CheckPreAuthOutput> = {
  name: "check_pre_auth",
  description: "Check whether pre-authorization is required for high-value diagnostic tests (MRI, CT Scan, PET Scan above ₹10,000) and whether it was provided.",
  inputSchema: CheckPreAuthInputSchema,
  outputSchema: CheckPreAuthOutputSchema,
  async run(input) { return checkPreAuth(input); },
};

export const applyFinancialsTool: Tool<ApplyFinancialsInput, ApplyFinancialsOutput> = {
  name: "apply_financials",
  description: "Calculate the final payable amount by applying network discount first, then co-pay. Returns gross, discount amount, after-discount amount, co-pay amount, and payable. Always call this before approving a claim.",
  inputSchema: ApplyFinancialsInputSchema,
  outputSchema: ApplyFinancialsOutputSchema,
  async run(input) { return applyFinancials(input); },
};

function makeCheckSubmissionRulesTool(
  submissionDate?: string
): Tool<CheckSubmissionRulesInput, CheckSubmissionRulesOutput> {
  return {
    name: "check_submission_rules",
    description: "Verify the claim meets submission rules: amount is above the minimum (₹500) and was submitted within 30 days of treatment.",
    inputSchema: CheckSubmissionRulesInputSchema,
    outputSchema: CheckSubmissionRulesOutputSchema,
    async run(input) {
      return checkSubmissionRules({ ...input, submissionDate: input.submissionDate ?? submissionDate });
    },
  };
}

export const checkSubmissionRulesTool = makeCheckSubmissionRulesTool();

// ─── Terminating tool — intercepted by runner before run() is called ──────────

export const submitPolicyDecisionTool: Tool<PolicyEvaluatorOutput, { accepted: boolean }> = {
  name: "submit_policy_decision",
  description: "Submit your final policy decision. Call this exactly once after completing all relevant checks. For APPROVED or PARTIAL, you MUST have called apply_financials and approvedAmount must equal its payable value. For REJECTED, at least one prior tool must have returned passed: false.",
  inputSchema: PolicyEvaluatorOutputSchema,
  outputSchema: z.object({ accepted: z.boolean() }),
  async run(_input) { return { accepted: true }; },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export function makePolicyEvaluatorTools(submissionDate?: string) {
  const submissionTool = makeCheckSubmissionRulesTool(submissionDate);
  return {
    [checkMemberEligibilityTool.name]: checkMemberEligibilityTool,
    [checkWaitingPeriodTool.name]: checkWaitingPeriodTool,
    [checkCoverageTool.name]: checkCoverageTool,
    [checkExclusionsTool.name]: checkExclusionsTool,
    [splitLineItemsTool.name]: splitLineItemsTool,
    [checkLimitsTool.name]: checkLimitsTool,
    [checkPreAuthTool.name]: checkPreAuthTool,
    [applyFinancialsTool.name]: applyFinancialsTool,
    [submissionTool.name]: submissionTool,
    [submitPolicyDecisionTool.name]: submitPolicyDecisionTool,
  };
}

export const policyEvaluatorTools = makePolicyEvaluatorTools();
