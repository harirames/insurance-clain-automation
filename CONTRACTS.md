# CONTRACTS.md — Per-Component Interface Contracts

Every input and output type is defined in `lib/types.ts` and enforced with Zod schemas. All financial values flow through tool returns — no agent restates amounts in free text.

---

## Shared Types

```typescript
// lib/types.ts

type ClaimCategory =
  | "CONSULTATION" | "DIAGNOSTIC" | "PHARMACY"
  | "DENTAL" | "VISION" | "ALTERNATIVE_MEDICINE";

type DocumentType =
  | "PRESCRIPTION" | "HOSPITAL_BILL" | "LAB_REPORT"
  | "PHARMACY_BILL" | "DENTAL_REPORT" | "DIAGNOSTIC_REPORT"
  | "DISCHARGE_SUMMARY";

type DocumentQuality = "GOOD" | "POOR" | "UNREADABLE";

type ClaimStatus =
  | "HALTED" | "APPROVED" | "PARTIAL" | "REJECTED" | "MANUAL_REVIEW";
```

---

## 1. Orchestrator — `runPipeline`

**File:** `lib/pipeline/orchestrator.ts`

### Input

```typescript
interface ClaimSubmission {
  memberId: string;           // Policy member ID, e.g. "EMP001"
  policyId: string;           // Policy identifier, e.g. "PLUM_GHI_2024"
  claimCategory: ClaimCategory;
  treatmentDate: string;      // ISO date "YYYY-MM-DD"
  claimedAmount: number;      // Rupees, positive integer
  hospitalName?: string;      // Optional; used for network discount lookup
  submittedBy: string;        // User who submitted (username)
  ytdClaimsAmount?: number;   // Year-to-date claims for annual limit check
  claimsHistory?: Array<{
    claimId: string;
    date: string;             // ISO date
    amount: number;
    provider?: string;
  }>;
  simulateComponentFailure?: true;  // Test flag — forces extractor to degrade
  documents: Array<{
    fileId: string;
    fileName: string;
    actualType: DocumentType;
    content?: Record<string, unknown>;      // Pre-extracted content from Cloudinary
    quality?: DocumentQuality;
    patientNameOnDoc?: string;
  }>;
}
```

### Output

```typescript
interface DecisionTrace {
  claimId: string;
  submittedAt: string;                // ISO datetime
  decision: PolicyDecision | null;    // null = pipeline halted before decision
  documentProblem: DocumentProblem | null;  // set when decision is null
  confidence: {
    overall: number;            // 0–1; reduced by component failures
    documentConfidence: number; // avg document extraction confidence
    fraudConfidence: number;    // inverse of fraud score
  };
  stages: TraceStage[];         // one entry per pipeline stage
  componentFailures: ComponentFailure[];   // caught exceptions
}

interface PolicyDecision {
  status: ClaimStatus;
  approvedAmount?: number;        // set for APPROVED and PARTIAL
  rejectionReasons?: string[];    // set for REJECTED
  rationale: string;              // human-readable explanation
  confidence: number;             // agent's stated confidence
  financialBreakdown?: FinancialBreakdown;
  lineItemsDecision?: LineItemDecision[];
}

interface FinancialBreakdown {
  gross: number;
  networkDiscountPercent: number;
  networkDiscountAmount: number;
  afterDiscount: number;
  copayPercent: number;
  copayAmount: number;
  payable: number;               // === approvedAmount
}

interface DocumentProblem {
  type: "WRONG_DOCUMENT_TYPE" | "UNREADABLE" | "MEMBER_MISMATCH" | "DUPLICATE";
  uploadedTypes: DocumentType[];
  requiredTypes: DocumentType[];
  message: string;               // actionable member-facing message
}

interface TraceStage {
  name: string;
  status: "PASS" | "FAIL" | "DEGRADED" | "SKIPPED";
  durationMs: number;
  agentTranscript?: AgentTranscript;
}

interface ComponentFailure {
  component: string;
  error: string;
  fallback: string;
}
```

### Errors Raised

The orchestrator **never throws**. All agent exceptions are caught and stored in `componentFailures[]`. If a critical agent fails completely the decision composer escalates to `MANUAL_REVIEW`.

---

## 2. DocumentVerifier Agent

**File:** `lib/agents/documentVerifier/agent.ts`

### Purpose
Validates that the submitted documents are the right types, readable, and all belong to the same patient.

### Input

```typescript
interface DocumentVerifierInput {
  claimCategory: ClaimCategory;
  documents: Array<{
    fileId: string;
    fileName: string;
    actualType: DocumentType;
    quality?: DocumentQuality;
    patientNameOnDoc?: string;
  }>;
}
```

### Output

```typescript
type VerificationResult =
  | { ok: true;  transcript: AgentTranscript }
  | { ok: false; problem: DocumentProblem; transcript: AgentTranscript }
```

### Tools available to agent

| Tool | Description | Side effects |
|------|-------------|--------------|
| `check_required_document_types` | Verifies all required types for category are present | None |
| `check_document_quality` | Flags documents with quality POOR or UNREADABLE | None |
| `check_patient_name_consistency` | Detects mismatches across `patientNameOnDoc` fields | None |
| `submit_verification_result` | Terminal tool — records pass/fail decision | Terminates loop |

### Errors Raised

- Throws if the LLM returns a malformed `submit_verification_result` payload (Zod parse failure).
- A caught throw is recorded in `componentFailures` and the orchestrator treats the verifier as `ok:true` (pass-through).

---

## 3. Extractor Agent

**File:** `lib/agents/extractor/agent.ts`

### Purpose
Identifies and records the document types and extraction confidence for each submitted file. In test/bypass mode, returns the `content` already present in the submission.

### Input

```typescript
interface ExtractorInput {
  documents: Array<{
    fileId: string;
    fileName: string;
    actualType: DocumentType;
    content?: Record<string, unknown>;   // bypass: skip LLM extraction
    quality?: DocumentQuality;
  }>;
}
```

### Output

```typescript
interface ExtractorOutput {
  documents: Array<{
    fileId: string;
    documentType: DocumentType;
    documentConfidence: number;    // 0–1
  }>;
  transcript: AgentTranscript;
}
```

### Tools available to agent

| Tool | Description |
|------|-------------|
| `record_extracted_document` | Records one document's type + confidence |
| `submit_extraction` | Terminal tool — returns all recorded documents |

### Errors Raised

- On a caught throw: extractor stage becomes `DEGRADED`, `componentFailures` gets an entry, and the pipeline continues with an empty extracted documents list.

---

## 4. PolicyEvaluator Agent

**File:** `lib/agents/policyEvaluator/agent.ts`

### Purpose
Evaluates the claim against the policy rules and produces a structured decision with financial breakdown. All financial amounts flow through the `apply_financials` tool — the agent never states amounts in free text.

### Input

```typescript
interface PolicyEvaluatorInput {
  memberId: string;
  claimCategory: ClaimCategory;
  treatmentDate: string;
  claimedAmount: number;
  hospitalName?: string;
  ytdClaimsAmount?: number;
  policyTerms: PolicyTerms;         // loaded from policy_terms.json
  extractedDocuments: ExtractedDocument[];
}
```

### Output

```typescript
type PolicyEvaluatorResult =
  | {
      ok: true;
      decision: {
        status: "APPROVED" | "PARTIAL" | "REJECTED" | "MANUAL_REVIEW";
        approvedAmount?: number;
        rejectionReasons?: string[];
        rationale: string;
        confidence: number;
        financialBreakdown?: FinancialBreakdown;
        lineItemsDecision?: LineItemDecision[];
      };
      transcript: AgentTranscript;
    }
  | { ok: false; error: string; transcript: AgentTranscript }
```

### Tools available to agent

| Tool | Description |
|------|-------------|
| `check_waiting_period` | Returns whether treatment date is within the waiting period |
| `check_annual_limit` | Checks remaining annual benefit against claimed amount |
| `check_per_claim_limit` | Checks per-claim ceiling for category |
| `check_sub_limit` | Returns sub-limit for category (e.g. ALTERNATIVE_MEDICINE: ₹8,000) |
| `check_pre_authorization` | Returns whether pre-auth is required and if present |
| `check_excluded_conditions` | Returns whether diagnosis falls under policy exclusions |
| `apply_financials` | Applies discount → copay → sub-limit cap. Returns `payable` amount |
| `submit_policy_decision` | Terminal tool — records final decision |

### Constraint

The `apply_financials` tool is the **only** path by which `approvedAmount` can be set. If the LLM states an amount in any other tool call or rationale text, it is ignored.

### Errors Raised

- On a caught throw: evaluator result is `null`; DecisionComposer escalates to `MANUAL_REVIEW`.

---

## 5. FraudDetector Agent

**File:** `lib/agents/fraudDetector/agent.ts`

### Purpose
Examines claims history for fraud signals (same-day duplicate claims, velocity, unusual amounts). Returns a fraud score and optionally flags for manual review.

### Input

```typescript
interface FraudDetectorInput {
  memberId: string;
  currentClaim: {
    claimId: string;
    date: string;
    amount: number;
    category: ClaimCategory;
    provider?: string;
  };
  claimsHistory: Array<{
    claimId: string;
    date: string;
    amount: number;
    provider?: string;
  }>;
  fraudThresholds: {
    max_same_day_claims: number;
    velocity_window_days: number;
    max_claims_in_window: number;
    large_claim_threshold: number;
  };
}
```

### Output

```typescript
type FraudDetectorResult =
  | {
      ok: true;
      assessment: {
        score: number;                    // 0–1; higher = more suspicious
        requiresManualReview: boolean;
        rationale: string;
        signals: FraudSignal[];
      };
      transcript: AgentTranscript;
    }
  | { ok: false; error: string; transcript: AgentTranscript }

interface FraudSignal {
  type: "SAME_DAY_CLAIMS" | "HIGH_VELOCITY" | "LARGE_AMOUNT" | "DUPLICATE_PROVIDER";
  detail: string;
  count?: number;
  limit?: number;
}
```

### Tools available to agent

| Tool | Description |
|------|-------------|
| `count_same_day_claims` | Counts claims on the same calendar date |
| `compute_velocity` | Counts claims within the velocity window |
| `check_large_claim` | Flags if claimed amount exceeds the large-claim threshold |
| `submit_fraud_assessment` | Terminal tool — mandatory; records fraud assessment |

### Constraint

`submit_fraud_assessment` is the **mandatory terminal tool**. The agent loop will not accept any other tool as the final action.

### Errors Raised

- On a caught throw: fraud result is `null`; DecisionComposer treats as no-fraud (score 0, no manual review flag).

---

## 6. DecisionComposer — `composeDecision`

**File:** `lib/pipeline/decisionComposer.ts`

This is a **deterministic function** — no LLM involved.

### Input

```typescript
interface ComposerInput {
  claimedAmount: number;
  verifierResult: VerificationResult;
  evaluatorResult: PolicyEvaluatorResult | null;
  fraudResult: FraudDetectorResult | null;
  extractedDocuments: ExtractedDocument[];
  degradedComponents: string[];
}
```

### Output

```typescript
interface ComposerOutput {
  decision: PolicyDecision | null;
  documentProblem: DocumentProblem | null;
  notes: string[];
}
```

### Decision Logic (in order)

1. **Verifier failed** → `decision: null`, `documentProblem` set. Pipeline stops.
2. **Evaluator failed** → `status: MANUAL_REVIEW`, `confidence: 0.3`. Note added.
3. **Evaluator rejected** → Pass through `REJECTED` with reasons and rationale.
4. **Fraud requires manual review** → Override evaluator status to `MANUAL_REVIEW`; fraud signal details appended to rationale.
5. **Evaluator approved/partial + clean fraud** → Pass through with `approvedAmount` from evaluator tool result.
6. **Degraded components present** → Confidence penalty applied; note added to rationale.

### Errors Raised

Never throws. All edge cases produce a valid `ComposerOutput`.

---

## 7. Agent Transcript

Returned by every agent for full auditability:

```typescript
interface AgentTranscript {
  agentName: string;
  model: string;              // e.g. "gemini-2.5-flash"
  turns: number;              // LLM round-trips used (max 6)
  toolCalls: ToolCall[];
  finalOutput: unknown;       // raw Zod-parsed terminal tool output
  latencyMs: number;
  degraded: boolean;          // true if caught exception filled the stub
}

interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  latencyMs: number;
}
```
