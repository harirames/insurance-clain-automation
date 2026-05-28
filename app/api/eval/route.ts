import { NextResponse } from "next/server";
import testCasesRaw from "../../../test_cases.json";
import type { ClaimSubmission } from "@/lib/types";
import { runPipeline } from "@/lib/pipeline/orchestrator";

interface TestCase {
  case_id: string;
  case_name: string;
  description: string;
  input: Record<string, unknown>;
  expected: {
    decision?: string;
    rejection_reasons?: string[];
    approved_amount?: number;
    confidence_score?: string;
    system_must?: string[];
    notes?: string;
  };
}

export interface EvalFinancials {
  gross: number;
  networkDiscountPercent: number;
  networkDiscountAmount: number;
  afterDiscount: number;
  copayPercent: number;
  copayAmount: number;
  payable: number;
}

export interface EvalLineItem {
  description: string;
  amount: number;
  status: string;
  reason?: string;
}

export interface EvalStage {
  name: string;
  status: string;
  durationMs: number;
}

export interface EvalComponentFailure {
  component: string;
  error: string;
  fallback: string;
}

export interface EvalDocumentProblem {
  type: string;
  detail: string;
  affectedFiles?: string[];
}

export interface EvalResult {
  caseId: string;
  caseName: string;
  description: string;
  expected: string;
  expectedAmount?: number;
  expectedSystemMust?: string[];
  actual: string | null;
  passed: boolean;
  approvedAmount?: number | null;
  rejectionReasons?: string[];
  rationale?: string;
  financials?: EvalFinancials;
  lineItems?: EvalLineItem[];
  documentProblem?: EvalDocumentProblem;
  stages: EvalStage[];
  componentFailureDetails: EvalComponentFailure[];
  confidence: { overall: number; documents: number; fraud: number };
  notes: string[];
  durationMs: number;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildSubmission(input: Record<string, unknown>): ClaimSubmission {
  const documents = (input.documents as Array<Record<string, unknown>>).map(
    (d, i) => ({
      fileId: d.file_id as string ?? `F${i}`,
      fileName: (d.file_name ?? `${d.file_id ?? `doc_${i}`}.jpg`) as string,
      actualType: d.actual_type as ClaimSubmission["documents"][0]["actualType"],
      content: d.content as Record<string, unknown> | undefined,
      quality: (d.quality as ClaimSubmission["documents"][0]["quality"]) ?? undefined,
      patientNameOnDoc: d.patient_name_on_doc as string | undefined,
    })
  );

  const claimsHistory = (
    (input.claims_history as Array<Record<string, unknown>>) ?? []
  ).map((c) => ({
    claimId: c.claim_id as string,
    date: c.date as string,
    amount: c.amount as number,
    provider: c.provider as string | undefined,
  }));

  const treatmentDate = input.treatment_date as string;
  // Simulate submission 7 days after treatment so deadline checks pass for eval
  const submissionDate = addDays(treatmentDate, 7);

  return {
    memberId: input.member_id as string,
    policyId: input.policy_id as string,
    claimCategory: input.claim_category as ClaimSubmission["claimCategory"],
    treatmentDate,
    claimedAmount: input.claimed_amount as number,
    hospitalName: input.hospital_name as string | undefined,
    submittedBy: input.member_id as string,
    ytdClaimsAmount: input.ytd_claims_amount as number | undefined,
    claimsHistory: claimsHistory.length > 0 ? claimsHistory : undefined,
    simulateComponentFailure:
      input.simulate_component_failure === true || undefined,
    submissionDate,
    documents,
  };
}

export async function POST() {
  const testCases = (testCasesRaw as { test_cases: TestCase[] }).test_cases;
  const results: EvalResult[] = [];

  for (const tc of testCases) {
    const start = Date.now();
    const notes: string[] = [];
    let actual: string | null = null;
    let approvedAmount: number | null | undefined;
    let rejectionReasons: string[] | undefined;
    let rationale: string | undefined;
    let financials: EvalFinancials | undefined;
    let lineItems: EvalLineItem[] | undefined;
    let documentProblem: EvalDocumentProblem | undefined;
    let stages: EvalStage[] = [];
    let componentFailureDetails: EvalComponentFailure[] = [];
    let confidence = { overall: 0, documents: 0, fraud: 0 };

    try {
      const submission = buildSubmission(tc.input);
      const trace = await runPipeline(tc.case_id, submission);

      actual = trace.decision?.status ?? (trace.documentProblem ? "HALTED" : null);
      approvedAmount = trace.decision?.approvedAmount;
      rejectionReasons = trace.decision?.rejectionReasons ?? [];
      rationale = trace.decision?.rationale;
      confidence = {
        overall: trace.confidence.overall,
        documents: trace.confidence.documents,
        fraud: trace.confidence.fraud,
      };

      if (trace.decision?.financialBreakdown) {
        financials = trace.decision.financialBreakdown;
      }

      if (trace.decision?.lineItemsDecision) {
        lineItems = trace.decision.lineItemsDecision.map((li) => ({
          description: li.description,
          amount: li.amount,
          status: li.status,
          reason: li.reason,
        }));
      }

      if (trace.documentProblem) {
        const dp = trace.documentProblem;
        let detail = dp.message;
        let affectedFiles: string[] | undefined;
        if (dp.type === "UNREADABLE_DOCUMENT") {
          affectedFiles = dp.documents.map((d) => d.fileName);
        } else if (dp.type === "PATIENT_NAME_MISMATCH") {
          affectedFiles = dp.names.map((n) => `${n.fileId}: ${n.name}`);
        } else if (dp.type === "WRONG_DOCUMENT_TYPE") {
          detail = `Uploaded: ${dp.uploadedTypes.join(", ")} — Required: ${dp.requiredTypes.join(", ")}`;
        } else if (dp.type === "MISSING_REQUIRED_DOC") {
          detail = `Missing: ${dp.missingTypes.join(", ")}`;
        }
        documentProblem = { type: dp.type, detail, affectedFiles };
      }

      stages = trace.stages.map((s) => ({
        name: s.name,
        status: s.status,
        durationMs: new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime(),
      }));

      componentFailureDetails = trace.componentFailures.map((f) => ({
        component: f.component,
        error: f.error,
        fallback: f.fallback,
      }));
    } catch (err) {
      actual = "ERROR";
      notes.push(`Exception: ${err instanceof Error ? err.message : String(err)}`);
    }

    const expectedDecision = tc.expected.decision ?? "HALTED";
    let passed = actual === expectedDecision;

    // Extra checks for approved amount
    if (passed && tc.expected.approved_amount != null && approvedAmount != null) {
      if (Math.abs(approvedAmount - tc.expected.approved_amount) > 1) {
        passed = false;
        notes.push(
          `Amount mismatch: expected ₹${tc.expected.approved_amount}, got ₹${approvedAmount}`
        );
      }
    }

    // Confidence threshold checks
    if (tc.expected.confidence_score) {
      const [op, val] = tc.expected.confidence_score.split(" ");
      const threshold = parseFloat(val);
      if (op === "above" && confidence.overall <= threshold) {
        notes.push(`Confidence ${Math.round(confidence.overall * 100)}% does not satisfy > ${Math.round(threshold * 100)}%`);
      }
    }

    results.push({
      caseId: tc.case_id,
      caseName: tc.case_name,
      description: tc.description,
      expected: expectedDecision,
      expectedAmount: tc.expected.approved_amount,
      expectedSystemMust: tc.expected.system_must,
      actual,
      passed,
      approvedAmount,
      rejectionReasons,
      rationale,
      financials,
      lineItems,
      documentProblem,
      stages,
      componentFailureDetails,
      confidence,
      notes,
      durationMs: Date.now() - start,
    });
  }

  return NextResponse.json({ results });
}
