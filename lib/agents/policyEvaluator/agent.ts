import type {
  ClaimCategory,
  ExtractedDocument,
  PolicyDecision,
  LineItemDecision,
  FinancialBreakdown,
  AgentTranscript,
} from "@/lib/types";
import { runAgent } from "@/lib/agents/runner";
import { MODELS } from "@/lib/llm/gemini";
import { POLICY_EVALUATOR_SYSTEM, buildPolicyEvaluatorUserPrompt } from "@/lib/llm/prompts/policyEvaluator";
import { makePolicyEvaluatorTools } from "./tools";
import { PolicyEvaluatorOutputSchema, type PolicyEvaluatorOutput } from "./schema";
import type { ApplyFinancialsOutput } from "@/lib/policy/financials";

// ─── Public input type ────────────────────────────────────────────────────────

export interface PolicyEvaluatorInput {
  memberId: string;
  claimCategory: ClaimCategory;
  treatmentDate: string;
  claimedAmount: number;
  hospitalName?: string;
  ytdClaimsAmount?: number;
  preAuthProvided?: boolean;
  extractedDocuments: ExtractedDocument[];
  submissionDate?: string;
  extractorDegraded?: boolean;
}

// ─── Public output type ───────────────────────────────────────────────────────

export type PolicyEvaluatorResult =
  | { ok: true; decision: PolicyDecision; transcript: AgentTranscript }
  | { ok: false; error: string; transcript: AgentTranscript };

// ─── runPolicyEvaluator ───────────────────────────────────────────────────────

export async function runPolicyEvaluator(
  input: PolicyEvaluatorInput
): Promise<PolicyEvaluatorResult> {
  const result = await runAgent<PolicyEvaluatorOutput>({
    agentName: "policyEvaluator",
    systemPrompt: POLICY_EVALUATOR_SYSTEM,
    userPrompt: buildUserPrompt(input),
    tools: makePolicyEvaluatorTools(input.submissionDate),
    finalResponseSchema: PolicyEvaluatorOutputSchema,
    finalToolName: "submit_policy_decision",
    maxTurns: 12,
    model: MODELS.flash,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, transcript: result.transcript };
  }

  const decision = toDecision(result.output, result.transcript);
  return { ok: true, decision, transcript: result.transcript };
}

// ─── Convert agent output to canonical PolicyDecision ────────────────────────

function toDecision(output: PolicyEvaluatorOutput, transcript: AgentTranscript): PolicyDecision {
  // Use apply_financials.payable as the canonical approved amount (agent reads it from tool result)
  const financialsCall = [...transcript.toolCalls]
    .reverse()
    .find((tc) => tc.toolName === "apply_financials");
  const financials = financialsCall?.result as ApplyFinancialsOutput | undefined;

  const approvedAmount =
    output.status === "APPROVED" || output.status === "PARTIAL"
      ? (financials?.payable ?? output.approvedAmount)
      : undefined;

  const financialBreakdown: FinancialBreakdown | undefined = financials
    ? {
        gross: financials.gross,
        networkDiscountPercent: financials.networkDiscountPercent,
        networkDiscountAmount: financials.networkDiscountAmount,
        afterDiscount: financials.afterDiscount,
        copayPercent: financials.copayPercent,
        copayAmount: financials.copayAmount,
        payable: financials.payable,
      }
    : undefined;

  const lineItemsDecision: LineItemDecision[] | undefined = output.lineItemsDecision?.map(
    (li) => ({
      description: li.description,
      amount: li.amount,
      status: li.status,
      reason: li.reason,
    })
  );

  return {
    status: output.status,
    approvedAmount,
    rejectionReasons: output.rejectionReasons,
    lineItemsDecision,
    financialBreakdown,
    rationale: output.rationale,
    confidence: output.confidence,
  };
}

// ─── User prompt builder ──────────────────────────────────────────────────────

function buildUserPrompt(input: PolicyEvaluatorInput): string {
  // Gather fields from extracted documents
  const prescriptions = input.extractedDocuments.filter(
    (d) => d.documentType === "PRESCRIPTION"
  );
  const bills = input.extractedDocuments.filter(
    (d) => d.documentType === "HOSPITAL_BILL" || d.documentType === "PHARMACY_BILL"
  );

  const diagnosis = prescriptions
    .map((d) => d.diagnosis?.value as string | undefined)
    .filter(Boolean)
    .join("; ");

  const treatment = prescriptions
    .map((d) => d.treatment?.value as string | undefined)
    .filter(Boolean)
    .join("; ");

  const testsOrdered = prescriptions.flatMap((d) => d.testsOrdered ?? []);

  const lineItems = bills.flatMap(
    (d) =>
      d.lineItems?.map((li) => ({ description: li.description, amount: li.amount })) ?? []
  );

  const hospitalName =
    input.hospitalName ??
    (bills
      .map((d) => d.hospitalName?.value as string | undefined)
      .find(Boolean));

  const documentFlags = input.extractedDocuments.flatMap((d) => d.flags ?? []);

  return buildPolicyEvaluatorUserPrompt({
    memberId: input.memberId,
    claimCategory: input.claimCategory,
    treatmentDate: input.treatmentDate,
    claimedAmount: input.claimedAmount,
    hospitalName,
    ytdClaimsAmount: input.ytdClaimsAmount,
    preAuthProvided: input.preAuthProvided,
    diagnosis: diagnosis || undefined,
    treatment: treatment || undefined,
    testsOrdered: testsOrdered.length > 0 ? testsOrdered : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    documentFlags: documentFlags.length > 0 ? documentFlags : undefined,
    extractorDegraded: input.extractorDegraded,
  });
}
