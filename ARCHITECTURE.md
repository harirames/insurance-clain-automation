# ARCHITECTURE.md — Insurance Claims Automation System

## Overview

An AI-powered health insurance claims processing system built on Next.js 16 / React 19. It accepts multi-document claim submissions, runs them through a multi-agent LLM pipeline, and produces a structured decision trace containing the outcome, financial breakdown, fraud assessment, and a fully reconstructible audit trail.

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App (app/)                       │
│                                                                 │
│  /(app)/          → Dashboard, Claims list, Claim detail        │
│  /(app)/claims/new → Submission form                            │
│  /(app)/eval      → Eval harness (OPS only)                     │
│  /login           → Credential auth                             │
│  /api/claims      → REST: submit + list                         │
│  /api/claims/[id] → REST: get claim                             │
│  /api/eval        → Run all 12 test cases                       │
└────────────────────┬────────────────────────────────────────────┘
                     │  server action
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Pipeline Orchestrator                      │
│              lib/pipeline/orchestrator.ts                       │
│                                                                 │
│  Stage 1 ── DocumentVerifier  (LLM agent)                       │
│              ↓ if ok:true                                       │
│  Stage 2 ── Extractor         (LLM agent — sequential)          │
│              ↓ extractedDocuments passed downstream             │
│  Stage 3 ── PolicyEvaluator   (LLM agent)  ─┐ Promise.allSettled│
│  Stage 4 ── FraudDetector     (LLM agent)  ─┘                   │
│              ↓                                                  │
│  Stage 5 ── DecisionComposer  (deterministic)                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    ClaimsRepo    Cloudinary  Policy Loader
    (PostgreSQL)  (document   (policy_terms.json)
                   storage)
```

---

## Sequence Diagram

```
Member         UI            /api/claims         Orchestrator
  │            │                  │                   │
  │──submit──▶ │                  │                   │
  │            │──POST /claims──▶ │                   │
  │            │                  │──runPipeline()──▶ │
  │            │                  │                   │
  │            │                  │         ┌─────────▼──────────┐
  │            │                  │         │  DocumentVerifier   │
  │            │                  │         │  (LLM + tools)     │
  │            │                  │         └─────────┬──────────┘
  │            │                  │                   │ ok:false? → return halt
  │            │                  │                   │ ok:true? ↓
  │            │                  │         ┌─────────▼──────────┐
  │            │                  │         │  Extractor         │ sequential
  │            │                  │         └─────────┬──────────┘
  │            │                  │                   │ extractedDocuments
  │            │                  │         ┌─────────▼──────────┐  ┐
  │            │                  │         │  PolicyEvaluator   │  │ concurrent
  │            │                  │         └────────────────────┘  │ via
  │            │                  │         ┌────────────────────┐  │ Promise.allSettled
  │            │                  │         │  FraudDetector     │  ┘
  │            │                  │         └─────────┬──────────┘
  │            │                  │                   │
  │            │                  │         ┌─────────▼──────────┐
  │            │                  │         │  DecisionComposer  │
  │            │                  │         │  (deterministic)   │
  │            │                  │         └─────────┬──────────┘
  │            │                  │◀──DecisionTrace───┘
  │            │                  │
  │            │                  │──createClaim(db)──▶ PostgreSQL
  │            │◀──201 + claimId──┤
  │◀──redirect─┤                  │
```

---

## Agent Architecture

Each LLM agent is structured identically:

```
agent.ts          ← entry point; prepares prompts, calls runner
runner.ts         ← generic agentic loop (turns ≤ 6, tool dispatch)
tools.ts          ← deterministic tool implementations (no LLM)
prompts/          ← system + user prompt templates
```

### Agent Runner Loop

```
userPrompt ──▶ Gemini (generateWithTools)
                │
                ├─ function_call? ──▶ execute tool ──▶ append result ──▶ loop
                │
                └─ submit_* terminal tool? ──▶ parse Zod schema ──▶ return
```

The runner enforces a **maximum of 6 turns** per agent. All tool calls and their results are recorded in `AgentTranscript.toolCalls` for audit.

---

## Data Model

```
User
  id, username, passwordHash, role (MEMBER|OPS), memberId?, name

Claim
  id (cuid2), memberId, policyId, claimCategory, treatmentDate
  claimedAmount, approvedAmount?, hospitalName?
  status (HALTED|APPROVED|PARTIAL|REJECTED|MANUAL_REVIEW)
  decisionTrace (JSONB)
  submittedBy → User.username
  documents → Document[]

Document
  id, claimId, fileName, actualType, mimeType
  cloudinaryPublicId, cloudinaryUrl
  quality?, patientNameOnDoc?
  extractedContent? (JSONB), confidence? (JSONB)
```

`decisionTrace` is stored as JSONB in PostgreSQL. It is self-contained — the full audit trail (agent transcripts, tool calls, financial breakdown, confidence scores, component failures) can be reconstructed from the stored trace alone without re-running the pipeline.

---

## Financial Calculation Chain

All numeric values flow exclusively through tool returns:

```
claimedAmount
  └─ apply_network_discount(in_network_hospital)  → afterDiscount
       └─ apply_copay(category_copay_percent)       → payable
            └─ apply_sub_limit(category_sub_limit)  → final payable
```

Rules: **discount is applied before copay**, copay is applied on the discounted amount. This ordering is enforced by the `apply_financials` tool in the PolicyEvaluator.

---

## Design Decisions

### Multi-agent vs. Monolithic LLM

**Considered:** A single LLM call with a large prompt covering document verification, extraction, policy evaluation, and fraud detection.

**Rejected because:**

- A monolithic prompt cannot enforce that financial amounts come from tool returns. Agents would restate amounts in free text, causing calculation drift.
- Different agents have fundamentally different reasoning modes (e.g., FraudDetector needs claims history; Extractor is pure OCR/parsing). A monolithic prompt would need all context simultaneously, ballooning token usage.
- Individual agent failures cannot be isolated and degraded gracefully without an agentic structure.

**Decision:** Four specialized LLM agents + one deterministic DecisionComposer. The composer is the sole authority on the final decision — agents provide structured inputs, not free-text verdicts.

### Concurrent Extractor + Evaluator + Fraud

**Decision:** Stages 2–4 run concurrently via `Promise.allSettled`. The extractor reads documents independently of policy evaluation. This reduces wall-clock latency from ~9s (sequential) to ~3s (parallel) for a typical claim.

**Trade-off:** The PolicyEvaluator receives extracted document content as part of its context — since extraction and evaluation run in parallel, the evaluator receives the _submitted_ document content (pre-extraction). The extractor output is recorded in the trace for audit but does not block evaluation. In practice this is acceptable because the submission form already collects `content` from the Cloudinary upload analysis.

### Deterministic Tools, Stochastic Reasoning

All financial calculations, sub-limit lookups, fraud signal counting, and document type checks are implemented as deterministic TypeScript tools (no LLM). The LLM is used only for reasoning about which tool to call next and producing rationale text. This makes the system's financial outputs fully auditable and unit-testable without mocking the LLM.

### Policy as JSON, Not Hardcoded

All policy rules (sub-limits, copay percentages, waiting periods, excluded conditions, per-claim maxima, fraud thresholds) live in `policy_terms.json`. No policy rule is hardcoded in TypeScript. The `loader.ts` module exposes typed accessors — any future policy amendment is a JSON file change with no code change required.

---

## Limitations

1. **No async processing queue.** Claims are processed synchronously during the HTTP request. If the LLM takes >30s, the request times out.
2. **In-memory policy loader.** `policy_terms.json` is read at startup and held in module scope. A policy update requires a server restart.
3. **No streaming.** The UI does not stream agent progress — the user waits for the full pipeline to complete before seeing any result.
4. **Single-model provider.** Only Google Gemini (`gemini-2.5-flash`) is supported. There is no fallback to a different provider or model.
5. **Cloudinary public URLs.** Documents are stored in Cloudinary with public URLs — there is no signed URL expiry enforced.
6. **Claims history is database-sourced only.** Fraud detection uses claims stored in the local PostgreSQL database. Cross-policy or cross-insurer history is not available.

---

## 10× Scale Plan

At 10× volume (concurrent claims, larger member base) the following changes are required:

| Concern                      | Current                     | At 10×                                                                                 |
| ---------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| **Claim processing**         | Synchronous in HTTP request | Background job queue (BullMQ / Inngest) with webhook callback to UI                    |
| **LLM concurrency**          | Unbounded parallel requests | Rate-limit pool per Gemini quota tier; circuit breaker per model                       |
| **Model fallback**           | Single model                | Primary:`gemini-2.5-flash`; fallback: `gemini-2.0-flash-lite` on timeout               |
| **Document storage**         | Cloudinary public           | Cloudinary with signed URLs + 7-day expiry                                             |
| **Claims history for fraud** | Local DB scan               | Vector index of past claim embeddings for semantic similarity detection                |
| **Extractor throughput**     | Inline per claim            | Async extraction workers (separate container) with result stored before evaluator runs |
| **Policy loader**            | Module-scope JSON           | Redis cache with TTL; invalidated on policy publish event                              |
| **Observability**            | `console.log`               | OpenTelemetry traces per agent turn; Grafana dashboard for latency + error rates       |
| **Database**                 | Single PG instance          | PG read replicas + connection pooling (PgBouncer)                                      |
| **Audit trail**              | JSONB in claims table       | Dedicated `decision_events` table with append-only writes                              |
