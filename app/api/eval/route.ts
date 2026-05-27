import { NextResponse } from "next/server";
import testCasesRaw from "../../../test_cases.json";
import type { ClaimSubmission, ClaimStatus } from "@/lib/types";
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
  };
}

export interface EvalResult {
  caseId: string;
  caseName: string;
  expected: string;
  actual: string | null;
  passed: boolean;
  approvedAmount?: number | null;
  expectedAmount?: number;
  rejectionReasons?: string[];
  confidence: number;
  componentFailures: number;
  notes: string[];
  durationMs: number;
}

function buildSubmission(input: Record<string, unknown>): ClaimSubmission {
  const documents = (input.documents as Array<Record<string, unknown>>).map(
    (d, i) => ({
      fileId: d.file_id as string ?? `F${i}`,
      fileName: `${d.file_id ?? `doc_${i}`}.jpg`,
      actualType: d.actual_type as ClaimSubmission["documents"][0]["actualType"],
      content: d.content as Record<string, unknown> | undefined,
      quality: (d.quality as ClaimSubmission["documents"][0]["quality"]) ?? undefined,
      patientNameOnDoc: d.patient_name as string | undefined,
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

  return {
    memberId: input.member_id as string,
    policyId: input.policy_id as string,
    claimCategory: input.claim_category as ClaimSubmission["claimCategory"],
    treatmentDate: input.treatment_date as string,
    claimedAmount: input.claimed_amount as number,
    hospitalName: input.hospital_name as string | undefined,
    submittedBy: input.member_id as string,
    ytdClaimsAmount: input.ytd_claims_amount as number | undefined,
    claimsHistory: claimsHistory.length > 0 ? claimsHistory : undefined,
    simulateComponentFailure:
      input.simulate_component_failure === true || undefined,
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
    let confidence = 0;
    let componentFailures = 0;

    try {
      const submission = buildSubmission(tc.input);
      const trace = await runPipeline(tc.case_id, submission);

      actual = trace.decision?.status ?? (trace.documentProblem ? "HALTED" : null);
      approvedAmount = trace.decision?.approvedAmount;
      rejectionReasons = trace.decision?.rejectionReasons ?? [];
      confidence = trace.confidence.overall;
      componentFailures = trace.componentFailures.length;

      if (trace.componentFailures.length > 0) {
        notes.push(
          `Component failures: ${trace.componentFailures.map((f) => f.component).join(", ")}`
        );
      }
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

    // Confidence threshold checks (TC012 > 0.90)
    if (tc.expected.confidence_score) {
      const [op, val] = tc.expected.confidence_score.split(" ");
      const threshold = parseFloat(val);
      if (op === "above" && confidence <= threshold) {
        notes.push(`Confidence ${confidence} does not satisfy > ${threshold}`);
      }
    }

    results.push({
      caseId: tc.case_id,
      caseName: tc.case_name,
      expected: expectedDecision,
      actual,
      passed,
      approvedAmount,
      expectedAmount: tc.expected.approved_amount,
      rejectionReasons,
      confidence,
      componentFailures,
      notes,
      durationMs: Date.now() - start,
    });
  }

  return NextResponse.json({ results });
}
