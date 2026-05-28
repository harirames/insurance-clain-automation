import type {
  ClaimSubmission,
  DecisionTrace,
  ExtractedDocument,
  ComponentFailure,
  TraceStage,
} from "@/lib/types";
import { runDocumentVerifier } from "@/lib/agents/documentVerifier/agent";
import type { VerificationResult } from "@/lib/agents/documentVerifier/agent";
import { runExtractor } from "@/lib/agents/extractor/agent";
import { runPolicyEvaluator } from "@/lib/agents/policyEvaluator/agent";
import type { PolicyEvaluatorResult } from "@/lib/agents/policyEvaluator/agent";
import { runFraudDetector } from "@/lib/agents/fraudDetector/agent";
import type { FraudDetectorResult } from "@/lib/agents/fraudDetector/agent";
import { composeDecision } from "./decisionComposer";
import {
  makeStage,
  buildTrace,
  computeDocumentConfidence,
  computeFraudConfidence,
} from "./trace";

// ─── Orchestrator entry point ─────────────────────────────────────────────────

export async function runPipeline(
  claimId: string,
  submission: ClaimSubmission
): Promise<DecisionTrace> {
  const pipelineStart = new Date();
  const stages: TraceStage[] = [];
  const componentFailures: ComponentFailure[] = [];
  const degradedComponents: string[] = [];

  // ── Stage 1: Document Verifier ────────────────────────────────────────────

  let verifierResult: VerificationResult;
  const verifierStart = new Date();

  try {
    const verifierDocs = submission.documents.map((d) => ({
      fileId: d.fileId,
      fileName: d.fileName,
      actualType: d.actualType,
      quality: d.quality,
      patientNameOnDoc: d.patientNameOnDoc,
    }));

    verifierResult = await runDocumentVerifier({
      claimCategory: submission.claimCategory,
      documents: verifierDocs,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    componentFailures.push({
      component: "documentVerifier",
      error,
      fallback: "Treated as ok:true (pass-through to extractor)",
    });
    degradedComponents.push("documentVerifier");
    verifierResult = {
      ok: true,
      transcript: {
        agentName: "documentVerifier",
        model: "none",
        turns: 0,
        toolCalls: [],
        finalOutput: null,
        latencyMs: 0,
        degraded: true,
      },
    };
  }

  const verifierEnd = new Date();
  const verifierStatus = verifierResult.ok
    ? "PASS"
    : degradedComponents.includes("documentVerifier")
    ? "DEGRADED"
    : "FAIL";

  stages.push(
    makeStage(
      "documentVerifier",
      verifierStatus,
      verifierStart,
      verifierEnd,
      verifierResult.ok ? { ok: true } : { ok: false, problem: verifierResult.problem },
      verifierResult.transcript
    )
  );

  // If doc verifier halted the pipeline, stop here
  if (!verifierResult.ok) {
    return buildTrace({
      claimId,
      startedAt: pipelineStart,
      endedAt: new Date(),
      stages,
      componentFailures,
      documentConfidence: 0,
      fraudConfidence: 1,
      decision: null,
      documentProblem: verifierResult.problem,
    });
  }

  // ── Stage 2: Extractor ────────────────────────────────────────────────────

  let extractedDocuments: ExtractedDocument[] = [];
  const extractorStart = new Date();

  // TC011: simulate component failure in extractor stage
  const simulateFailure = submission.simulateComponentFailure === true;

  try {
    if (simulateFailure) {
      throw new Error("Simulated component failure (simulateComponentFailure: true)");
    }
    const extractionResult = await runExtractor(submission.documents);
    extractedDocuments = extractionResult.documents;

    stages.push(
      makeStage(
        "extractor",
        extractionResult.transcript.degraded ? "DEGRADED" : "PASS",
        extractorStart,
        new Date(),
        { documents: extractedDocuments },
        extractionResult.transcript
      )
    );

    if (extractionResult.transcript.degraded) {
      degradedComponents.push("extractor");
      componentFailures.push({
        component: "extractor",
        error: "One or more documents failed extraction (degraded flag set)",
        fallback: "Continued with zero-confidence empty documents",
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    componentFailures.push({
      component: "extractor",
      error,
      fallback: "Continued with empty extracted documents; confidence lowered",
    });
    degradedComponents.push("extractor");
    stages.push(
      makeStage(
        "extractor",
        "DEGRADED",
        extractorStart,
        new Date(),
        { documents: [] },
        {
          agentName: "extractor",
          model: "none",
          turns: 0,
          toolCalls: [],
          finalOutput: null,
          latencyMs: 0,
          degraded: true,
        }
      )
    );
  }

  // ── Stage 3: PolicyEvaluator ∥ FraudDetector (parallel) ──────────────────

  const claimsHistory = (submission.claimsHistory ?? []).map((c) => ({
    claimId: c.claimId,
    date: c.date,
    amount: c.amount,
    provider: c.provider,
  }));

  const evalStart = new Date();
  const [evalSettled, fraudSettled] = await Promise.allSettled([
    // Policy evaluator
    runPolicyEvaluator({
      memberId: submission.memberId,
      claimCategory: submission.claimCategory,
      treatmentDate: submission.treatmentDate,
      claimedAmount: submission.claimedAmount,
      hospitalName: submission.hospitalName,
      ytdClaimsAmount: submission.ytdClaimsAmount,
      preAuthProvided: undefined,
      extractedDocuments,
      submissionDate: submission.submissionDate,
      extractorDegraded: degradedComponents.includes("extractor"),
    }),
    // Fraud detector
    runFraudDetector({
      memberId: submission.memberId,
      claimCategory: submission.claimCategory,
      treatmentDate: submission.treatmentDate,
      claimedAmount: submission.claimedAmount,
      hospitalName: submission.hospitalName,
      claimsHistory,
      extractedDocuments,
    }),
  ]);

  // Handle policy evaluator result
  let evaluatorResult: PolicyEvaluatorResult | null = null;
  const evalEnd = new Date();

  if (evalSettled.status === "fulfilled") {
    evaluatorResult = evalSettled.value;
    stages.push(
      makeStage(
        "policyEvaluator",
        evaluatorResult.ok ? "PASS" : "FAIL",
        evalStart,
        evalEnd,
        evaluatorResult.ok
          ? { decision: evaluatorResult.decision }
          : { error: evaluatorResult.error },
        evaluatorResult.transcript
      )
    );
    if (!evaluatorResult.ok) {
      degradedComponents.push("policyEvaluator");
      componentFailures.push({
        component: "policyEvaluator",
        error: evaluatorResult.error,
        fallback: "Decision composed as MANUAL_REVIEW",
      });
    }
  } else {
    const error = String(evalSettled.reason);
    componentFailures.push({
      component: "policyEvaluator",
      error,
      fallback: "Decision composed as MANUAL_REVIEW",
    });
    degradedComponents.push("policyEvaluator");
    stages.push(
      makeStage("policyEvaluator", "DEGRADED", evalStart, evalEnd, { error })
    );
  }

  // Handle fraud detector result
  let fraudResult: FraudDetectorResult | null = null;
  const fraudEnd = new Date();

  if (fraudSettled.status === "fulfilled") {
    fraudResult = fraudSettled.value;
    stages.push(
      makeStage(
        "fraudDetector",
        fraudResult.ok ? "PASS" : "FAIL",
        evalStart,
        fraudEnd,
        fraudResult.ok
          ? { assessment: fraudResult.assessment }
          : { error: fraudResult.error },
        fraudResult.transcript
      )
    );
    if (!fraudResult.ok) {
      componentFailures.push({
        component: "fraudDetector",
        error: fraudResult.error,
        fallback: "Fraud assessment skipped; requiresManualReview assumed false",
      });
    }
  } else {
    const error = String(fraudSettled.reason);
    componentFailures.push({
      component: "fraudDetector",
      error,
      fallback: "Fraud assessment skipped; requiresManualReview assumed false",
    });
    stages.push(
      makeStage("fraudDetector", "DEGRADED", evalStart, fraudEnd, { error })
    );
  }

  // ── Stage 4: Decision Composer ────────────────────────────────────────────

  const composerStart = new Date();
  const composed = composeDecision({
    claimedAmount: submission.claimedAmount,
    verifierResult,
    evaluatorResult,
    fraudResult,
    extractedDocuments,
    degradedComponents,
  });

  stages.push(
    makeStage(
      "decisionComposer",
      "PASS",
      composerStart,
      new Date(),
      { decision: composed.decision, notes: composed.notes }
    )
  );

  // ── Confidence scores ─────────────────────────────────────────────────────

  const docConfidence = computeDocumentConfidence(extractedDocuments);
  const fraudScore =
    fraudResult?.ok === true ? fraudResult.assessment.score : 0;
  const fraudConfidence = computeFraudConfidence(fraudScore);

  return buildTrace({
    claimId,
    startedAt: pipelineStart,
    endedAt: new Date(),
    stages,
    componentFailures,
    documentConfidence: docConfidence,
    fraudConfidence,
    decision: composed.decision,
    documentProblem: composed.documentProblem,
  });
}
