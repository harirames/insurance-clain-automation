# Task Plan — Plum Health Insurance Claims Processing

Phased breakdown of work for the assignment. Each phase has an exit criterion — do not move on until it is met. Target total: 2–3 days.

---

## Architecture: hybrid multi-agent

**Three LLM-driven agents** (Document Verifier, Policy Evaluator, Fraud Detector) plus a **structured-output Extractor**, behind a **deterministic Orchestrator**. Each LLM agent uses Gemini function-calling to invoke deterministic tools — the agent decides _what to check and how to explain it_, the tools own the math.

| Component          | Type                   | LLM?                                   | What it owns                                                            |
| ------------------ | ---------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Document Verifier  | LLM agent + tools      | Yes (Gemini + functions)               | Chooses which checks to run; writes the user-facing TC001-style message |
| Document Extractor | Structured-output call | Yes (Gemini + vision + responseSchema) | Turns documents into typed `ExtractedDocument`                          |
| Policy Evaluator   | LLM agent + tools      | Yes (Gemini + functions)               | Picks the right rule tools per claim; composes the rationale            |
| Fraud Detector     | LLM agent + tools      | Yes (Gemini + functions)               | Reads history + signals, produces score + narrative                     |
| Orchestrator       | Deterministic          | No                                     | Runs agents in order, captures traces, wraps every call in try/catch    |
| Rule modules       | Deterministic          | No                                     | All math (waiting periods, financials, limits) — exposed as agent tools |

**Why hybrid:** the math (TC005 dates, TC010 discount-then-copay, TC008 limits) must be reproducible across runs. Letting an LLM do arithmetic on those is graded directly. Letting an LLM _choose which math to do and explain the result_ is where multi-agent earns its bonus.

**Eval determinism rule:** every numeric output in the decision must come from a tool return value, never from model-generated text. Agents never restate amounts — they reference the tool result.

---

## Phase 0 — Foundations & Scaffolding ✅

- [x] Next.js 16 App Router conventions confirmed from `node_modules/next/dist/docs/`.
- [x] Vitest + `vite-tsconfig-paths` installed; `npm test` runs 11 passing tests.
- [x] `zod` (v4), `@google/genai`, shadcn/ui initialized (default/neutral/CSS vars), `lucide-react`.
- [x] `.env.example` with all env vars documented.
- [x] `lib/types.ts` — all canonical domain types and Zod schemas.
- [x] `lib/policy/loader.ts` — typed accessors over `policy_terms.json`.
- [x] `lib/agents/runner.ts` — shared Gemini function-calling loop (tool validation, transcript capture, maxTurns guard, full error containment). Uses `z.toJSONSchema()` (Zod v4 built-in).
- [x] `lib/agents/types.ts` — `Tool<I,O>`, `ToolRegistry`, `RunnerConfig`, `RunnerResult`.
- [x] `lib/llm/gemini.ts` — `generateWithTools` + `generateStructured` provider wrapper.
- [x] Full folder layout created. `npm run build` and `npm test` both pass.

---

## Phase 0 — Foundations & Scaffolding (archived detail)

Goal: lock in the project shell, type system, and the canonical data shapes everything downstream will share.

- [x] Confirm Next.js 16 App Router conventions by skimming `node_modules/next/dist/docs/` (per `AGENTS.md`). Note any deprecated APIs.
- [x] Add tooling:
  - [x] Vitest (or Jest) + a smoke test that runs via `npm test`.
  - [x] `zod` for runtime schema validation on every LLM call and external input.
  - [x] Google Gemini SDK (`@google/genai`) wired through a single provider module in `lib/llm/` so it can be mocked in tests. Default model: `gemini-2.5-pro` for reasoning, `gemini-2.5-flash` for cheaper extraction; both support vision natively.
  - [x] `.env.local` + `.env.example` for `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and any other secrets.
- [x] Create the canonical domain types in `lib/types.ts`:
  - `ClaimSubmission`, `DocumentInput`, `ExtractedDocument`, `PolicyDecision`, `DecisionTrace`, `Confidence`, `RejectionReason` enum, `ClaimCategory` enum, `DocumentType` enum.
  - Match enum values exactly to the strings used in `policy_terms.json` and `test_cases.json` (`CONSULTATION`, `PRESCRIPTION`, `PRE_AUTH_MISSING`, etc.).
- [x] Add `lib/policy/loader.ts` that reads `policy_terms.json` once and exposes typed accessors (no hardcoded rules anywhere else).
- [x] Build `lib/agents/runner.ts` — the agent loop every tool-use agent shares:
  - Input: `{ systemPrompt, userPrompt, tools: ToolRegistry, finalResponseSchema, maxTurns: 6, model }`.
  - Calls Gemini with `tools: [{ functionDeclarations }]`. On a `functionCall` part: validate args with the tool's Zod input schema, run the deterministic implementation, append the `functionResponse` part to history, loop.
  - Terminates when the model returns a final object matching `finalResponseSchema` (use a `submit_<agent>_result` synthetic tool to force structured termination, or a second `generateContent` call with `responseSchema`). Hitting `maxTurns` is a degraded result — recorded in the transcript.
  - Captures an `AgentTranscript`: every model turn, every tool call (name, args, result, latency), the final structured output, total latency, model used. This is what the orchestrator's `DecisionTrace` consumes.
  - All errors (timeout, validation, tool throw) caught and surfaced as a `component_failures[]` entry; the runner never throws to the orchestrator.
- [ ] `ToolRegistry` type in `lib/agents/types.ts`:

  ```
  type Tool<I, O> = {
    name: string;
    description: string;          // shown to the model — terse, action-oriented
    inputSchema: z.ZodType<I>;    // also converted to Gemini function declaration
    outputSchema: z.ZodType<O>;
    run: (input: I) => Promise<O>;
  };
  type ToolRegistry = Record<string, Tool<any, any>>;
  ```

  Tool declarations for Gemini are generated from `inputSchema` via `z.toJSONSchema()` (Zod v4 built-in) — no `zod-to-json-schema` needed.

- [x] Stand up the folder layout:
  ```
  app/                          # Next.js routes (UI + API)
  lib/
    agents/
      runner.ts                 # shared function-calling loop for Gemini tool-use agents
      types.ts                  # AgentResult, AgentTranscript, ToolCall, ToolResult
      documentVerifier/
        agent.ts                # prompt + tool registration + runAgent()
        tools.ts                # deterministic check functions exposed as tools
        schema.ts               # Zod schemas for tool I/O and final output
      extractor/
        agent.ts                # structured-output Gemini call (no tools)
        schema.ts
      policyEvaluator/
        agent.ts
        tools.ts                # wraps lib/policy/* into tool function declarations
        schema.ts
      fraudDetector/
        agent.ts
        tools.ts
        schema.ts
    pipeline/
      orchestrator.ts           # deterministic; runs agents in order
      trace.ts                  # builds DecisionTrace from agent transcripts
      decisionComposer.ts       # final APPROVED|PARTIAL|REJECTED|MANUAL_REVIEW
    policy/                     # deterministic rule modules (the tools' implementations)
      loader.ts
      waitingPeriod.ts
      exclusions.ts
      limits.ts
      preAuth.ts
      financials.ts
      submissionRules.ts
    llm/
      gemini.ts                 # provider wrapper + retry + timeout
      prompts/                  # one .ts per agent for prompt strings
    types.ts
  tests/
    fixtures/
    integration/                # full pipeline runs (TC001–TC012)
    unit/                       # per-tool tests + per-agent tests with mocked LLM
  ```

**Exit:** `npm run dev`, `npm run build`, and `npm test` all succeed on a hello-world page and a trivial passing test. Policy file loads and types compile.

---

## Phase 0.5 — Auth (NextAuth v5, Credentials) ✅

- [x] `next-auth@beta`, `bcryptjs`, `react-hook-form`, `@hookform/resolvers` installed.
- [x] `AUTH_SECRET` (generated) and `AUTH_URL` in `.env.local` / `.env.example`.
- [x] `lib/auth/config.ts` — Credentials provider: looks up users from DB via `findUserByUsername()`. _(Updated: was policy_terms.json + opsUsers.ts; now DB-backed.)_
- [x] `lib/auth/session.ts` — exports `auth()`, `getCurrentUser()`, `requireAuth()`, `requireRole()`.
- [x] `lib/auth/opsUsers.ts` — kept for reference (hashes used in seed); auth no longer reads it directly.
- [x] `app/api/auth/[...nextauth]/route.ts` — NextAuth handler.
- [x] `proxy.ts` — redirects unauthenticated to `/login`; blocks MEMBERs from `/eval` and `/api/eval`. (Next.js 16 renamed middleware.ts → proxy.ts; exported function is `proxy`.)
- [x] `types/next-auth.d.ts` — module-augments `Session` and `JWT` with `role` and `memberId`.
- [x] `app/(auth)/login/page.tsx` — Server Component with Suspense boundary wrapping `LoginForm`.
- [x] `components/auth/LoginForm.tsx` — shadcn `Form` + `Card` + `Alert`; `react-hook-form` + `LoginSchema`.
- [x] `components/layout/SessionProviderWrapper.tsx` — thin client wrapper mounted in `app/layout.tsx`.
- [x] `components/ui/form.tsx` — created (shadcn form component wrapping react-hook-form).
- [x] 5 auth unit tests passing (member resolves, wrong password, OPS resolves, OPS wrong password, unknown user) — now mock prisma.user.
- [x] `npm test` → 42 passing (incl. Phase 1 document verifier). TypeScript clean.

**Demo credentials:** `EMP001` / `password123` (MEMBER) · `ops@plum.test` / `opspass123` (OPS)

---

## Phase 0.7 — Persistence: Prisma + Postgres + Cloudinary ✅

**What was built:**

- [x] `prisma/schema.prisma` — `User` (MEMBER/OPS), `Claim`, `Document` models + all enums. Prisma 7 (no `url` in datasource; connection managed via `prisma.config.ts` + `@prisma/adapter-pg`).
- [x] `prisma/seed.ts` — seeds all members from `policy_terms.json` + OPS demo user; idempotent upserts. Run with `npm run db:seed`.
- [x] `lib/db.ts` — HMR-safe Prisma singleton using `PrismaPg` adapter.
- [x] `lib/storage/usersRepo.ts` — `findUserByUsername()` replaces the local-file approach.
- [x] `lib/storage/claimsRepo.ts` — `createClaim`, `getClaim`, `listByMember`, `listAll`.
- [x] `lib/storage/cloudinary.ts` — `uploadDocument`, `getDocumentUrl`; server-only.
- [x] `app/api/claims/route.ts` — POST uploads to Cloudinary, stubs pipeline (Phase 5), persists claim.
- [x] `app/api/claims/[id]/route.ts` — GET with ownership enforcement.
- [x] `app/claims/[id]/page.tsx` — Server Component rendering claim from DB.
- [x] Unit tests for claimsRepo (Prisma mocked). Auth tests updated to mock DB.
- [x] `npm run db:migrate` → creates migration. `npm run db:seed` → populates users.
- [x] Next steps: set `DATABASE_URL` in `.env.local`, then run `npm run db:migrate && npm run db:seed`.

**Env vars needed:** `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

---

## Phase 1 — Document Verifier Agent (LLM + tools) — covers TC001, TC002, TC003 ✅

**What was built:**

- [x] `lib/agents/documentVerifier/schema.ts` — Zod I/O schemas for all 4 tools + `VerifierOutputSchema`.
- [x] `lib/agents/documentVerifier/tools.ts` — 4 deterministic tools + `submit_verification_result` stub: `lookup_required_types_for_category`, `check_required_document_types`, `check_document_quality`, `check_patient_name_consistency`.
- [x] `lib/llm/prompts/documentVerifier.ts` — system prompt with mandatory procedure + message specificity rules.
- [x] `lib/agents/documentVerifier/agent.ts` — `runDocumentVerifier()` wraps `runAgent()`, converts flat output to `DocumentProblem`.
- [x] `tests/unit/agents/documentVerifier/tools.test.ts` — 14 deterministic tool tests (TC001/TC002/TC003 fixtures + edge cases).
- [x] `tests/unit/agents/documentVerifier/agent.test.ts` — 5 agent tests with mocked LLM (TC001/TC002/TC003 + clean pass + degradation).
- [x] `npm test` → 42 passing. TypeScript clean.

Goal: stop bad submissions before any decisioning happens. The agent decides which checks to run and writes the user-facing message; deterministic tools own the actual checks. Graded at 10% but gates the rest of the pipeline.

- [x] Input contract: `ClaimSubmission` (with `claim_category` and `documents[]` carrying `actual_type`, `quality`, `patient_name_on_doc`) — implemented as `VerifierInput` + `VerifierDocInput` in `agent.ts`.
- [x] Final output contract (the agent's structured return): `{ ok: true } | { ok: false, error: DocumentProblem }` where `DocumentProblem` is a discriminated union of:
  - `WRONG_DOCUMENT_TYPE` — names uploaded type(s) and required type(s).
  - `UNREADABLE_DOCUMENT` — names the specific `file_id` / `file_name` to re-upload.
  - `PATIENT_NAME_MISMATCH` — lists every distinct name found across documents.
  - `MISSING_REQUIRED_DOC` — names the missing required type.
- [x] **Tools** (all deterministic, all defined in `lib/agents/documentVerifier/tools.ts`, all sourced from `policy_terms.json → document_requirements`):
  - `check_required_document_types({ claim_category, uploaded_types })` → `{ missing: DocumentType[], extra: DocumentType[] }`.
  - `check_document_quality({ documents })` → `{ unreadable: Array<{ file_id, file_name }> }`.
  - `check_patient_name_consistency({ documents })` → `{ matched: boolean, distinct_names: Array<{ file_id, name }> }`.
  - `lookup_required_types_for_category({ claim_category })` → `{ required: DocumentType[], optional: DocumentType[] }` (gives the model the policy context to write specific messages).
- [x] **Agent prompt** (in `lib/llm/prompts/documentVerifier.ts`):
  - System: "You are a claims document verifier. Use the tools to determine whether the submission is valid before any decisioning happens. You MUST cite specific file names and document types in any rejection message — never use generic phrasing. Return your final answer via the structured response."
  - Constrain the model: it may not produce a final `ok: false` answer for a category of problem until the relevant tool has been called and returned a non-empty result. (Enforce this in `runner.ts`: if the agent submits a `WRONG_DOCUMENT_TYPE` error, the transcript must contain a `check_required_document_types` call with matching args.)
- [x] **Error message rule:** messages must reference actual file names / types from tool outputs. Enforced via CRITICAL instruction in the system prompt — agent must quote actual file names and document types.
- [x] **Unit tests** with the LLM mocked — 5 tests in `tests/unit/agents/documentVerifier/agent.test.ts`:
  - For TC001 fixtures, assert the agent (a) called `check_required_document_types`, (b) returned `WRONG_DOCUMENT_TYPE` with both prescription file names listed and `HOSPITAL_BILL` named as required.
  - For TC002, assert it called `check_document_quality` and returned `UNREADABLE_DOCUMENT` naming `blurry_bill.jpg`.
  - For TC003, assert it called `check_patient_name_consistency` and returned `PATIENT_NAME_MISMATCH` with both names.
- [x] **Deterministic tool tests** (pure functions, no LLM): 18 tests in `tests/unit/agents/documentVerifier/tools.test.ts`.

**Exit:** TC001/TC002/TC003 produce the correct halt + actionable message; the transcript shows tool calls preceding every claim in the message; pipeline never reaches the extractor for these cases.

---

## Phase 2 — Document Extractor (structured-output Gemini call) ✅

**What was built:**

- [x] `lib/agents/extractor/schema.ts` — `GeminiExtractionSchema` (single unified Zod schema for all doc types), `isValidDoctorRegistration()` regex validator (`KA/XXXXX/YYYY`, `AYUR/[STATE]/XXXXX/YYYY`).
- [x] `lib/llm/prompts/extractor.ts` — `EXTRACTOR_SYSTEM` prompt with confidence guide, flags list, registration format note. `buildExtractorUserPrompt(docType)`.
- [x] `lib/agents/extractor/agent.ts` — `runExtractor(docs: DocumentInput[]): Promise<ExtractionResult>`:
  - Bypass mode: `doc.content` → `contentToExtractedDocument()` at 0.95 confidence (deterministic eval).
  - LLM mode: `doc.cloudinaryUrl` → `generateStructured()` with `z.toJSONSchema(GeminiExtractionSchema)`; escalates to `MODELS.pro` for `POOR` quality docs.
  - Degraded: no content + no URL, or LLM throws → `emptyExtraction()` with `EXTRACTION_FAILED` flag.
  - Emits `AgentTranscript` with `turns = docs.length`, `toolCalls = []`.
- [x] `tests/unit/agents/extractor/agent.test.ts` — 14 tests covering bypass mode (TC004, TC011 fixtures), LLM mode, pro model selection, degradation, registration validator.
- [x] `npm test` → 56 passing (all phases). TypeScript clean.

Goal: turn raw documents into validated structured data. Unlike the other agents, this one does **not** use tool-use — it's a single Gemini call with `responseSchema` per document. Most test cases provide pre-extracted `content` objects; the real extractor must still exist for the UI flow and to satisfy the assignment's vision/handwriting requirements.

**Exit:** Extractor returns a fully typed `ExtractedDocument` for every test-case input; component failures surface in the trace without crashing. ✅

---

## Phase 3 — Policy Evaluator Agent (LLM + tools) ✅ — covers TC004–TC008, TC010, TC012

**What was built:**

- [x] 9 deterministic rule modules in `lib/policy/`: `eligibility.ts`, `waitingPeriod.ts`, `coverage.ts`, `exclusions.ts`, `lineItems.ts`, `limits.ts`, `preAuth.ts`, `financials.ts`, `submissionRules.ts`. Each exports a typed pure function + Zod input/output schemas.
- [x] `lib/agents/policyEvaluator/schema.ts` — `PolicyEvaluatorOutputSchema` (args for `submit_policy_decision`).
- [x] `lib/agents/policyEvaluator/tools.ts` — 10 Gemini function-calling tools (9 rule wrappers + `submit_policy_decision` terminator).
- [x] `lib/llm/prompts/policyEvaluator.ts` — system prompt with mandatory evaluation procedure and guardrails. `buildPolicyEvaluatorUserPrompt()`.
- [x] `lib/agents/policyEvaluator/agent.ts` — `runPolicyEvaluator()` wraps `runAgent()`. Converts `PolicyEvaluatorOutput` → `PolicyDecision`, using `apply_financials.payable` from the transcript as the canonical approved amount.
- [x] `tests/unit/policy/rules.test.ts` — 35 deterministic tests across all 9 rule modules (TC004/TC005/TC006/TC007/TC008/TC010/TC012 fixtures + edge cases).
- [x] `tests/unit/agents/policyEvaluator/agent.test.ts` — 7 agent integration tests with mocked LLM (TC004/TC005/TC006/TC007/TC008/TC010/TC012 + degradation).
- [x] `npm test` → 99 passing. TypeScript clean.

**Key correctness properties verified:**
- TC004: no discount + 10% co-pay on ₹1,500 → **₹1,350** ✓
- TC005: diabetes 90-day wait, eligible from 2024-11-30 ✓
- TC006: Root Canal COVERED, Teeth Whitening EXCLUDED → **PARTIAL ₹8,000** ✓
- TC007: MRI ₹15,000 > ₹10,000 threshold, no pre-auth → **PRE_AUTH_MISSING** ✓
- TC008: ₹7,500 > per-claim limit ₹5,000 → **PER_CLAIM_EXCEEDED** ✓
- TC010: Apollo Hospitals 20% discount first → ₹3,600, then 10% co-pay → **₹3,240** ✓
- TC012: "obesity"/"bariatric" keywords → **EXCLUDED_CONDITION** ✓

Goal: an LLM agent that, given the extracted claim, decides which rule tools to invoke and in what order, reads their results, and composes the rationale. The rule modules are pure deterministic functions in `lib/policy/` and are exposed as Gemini function-calling tools. **All numeric outputs (approved amount, discount, co-pay, eligibility date) come from tool returns, never from generated text.**

### 3a. Deterministic rule modules in `lib/policy/` (write & test first)

Each module exports a pure function with a Zod input + Zod output schema. Each returns `{ passed: boolean, detail: string, data: object }` so the agent can quote `data` fields verbatim.

- [x] `lib/policy/eligibility.ts` — `checkMemberEligibility({ memberId, treatmentDate })` → member exists in `members[]`, policy `renewal_status === "ACTIVE"`, treatment date within policy window.
- [x] `lib/policy/waitingPeriod.ts` — `checkWaitingPeriod({ memberId, diagnosis, treatmentDate })` → uses `initial_waiting_period_days`, `pre_existing_conditions_days`, `specific_conditions{}`. Maps diagnosis text → condition key (`Type 2 Diabetes Mellitus` → `diabetes`). When failing, returns `data.eligible_from: "YYYY-MM-DD"` for TC005.
- [x] `lib/policy/coverage.ts` — `checkCategoryCoverage({ claimCategory })` → picks `opd_categories.*`; `covered === false` → fail.
- [x] `lib/policy/exclusions.ts` — `checkExclusions({ diagnosis, treatment, lineItems })` → matches `exclusions.conditions[]` + category-specific lists. TC012: bariatric / obesity.
- [x] `lib/policy/lineItems.ts` — `splitLineItems({ claimCategory, lineItems })` → for dental/vision/alt-med, classifies each line as `COVERED` | `EXCLUDED` against `covered_procedures` / `excluded_procedures`. TC006.
- [x] `lib/policy/limits.ts` — `checkLimits({ claimedAmount, claimCategory, ytdClaimsAmount })` → returns the first violated limit with both numbers in `data` for the rejection message. TC008.
- [x] `lib/policy/preAuth.ts` — `checkPreAuth({ claimCategory, tests, amount, preAuthProvided })` → matches `pre_authorization.required_for[]` and `high_value_tests_requiring_pre_auth[]` × `pre_auth_threshold`. TC007.
- [x] `lib/policy/financials.ts` — `applyFinancials({ amount, claimCategory, hospitalName })` → **discount first, then co-pay** (TC010 invariant). Returns `{ gross, network_discount_percent, network_discount_amount, after_discount, copay_percent, copay_amount, payable }`. Every intermediate value lands in the trace.
- [x] `lib/policy/submissionRules.ts` — `checkSubmissionRules({ treatmentDate, claimedAmount })` → `deadline_days_from_treatment`, `minimum_claim_amount`.

Unit-test each one against the matching test case fixtures before wiring tools.

### 3b. Tools (in `lib/agents/policyEvaluator/tools.ts`)

Each rule module above is wrapped 1:1 as a Gemini function-calling tool with the same name (camelCase → snake_case for the tool name, e.g. `check_waiting_period`). The wrapper validates inputs with the Zod schema and forwards to the rule module. No new logic in the tool layer.

Add one _terminating_ tool the agent must call exactly once at the end:

- `submit_policy_decision({ status: APPROVED|PARTIAL|REJECTED, line_items_decision?, rejection_reasons?, financials_ref?, rationale })` — `rationale` is plain-English; `financials_ref` is the name of a previous `apply_financials` tool call whose `payable` becomes the approved amount. The runner copies the referenced number into the final output — the agent never types the amount itself.

### 3c. Agent prompt (in `lib/llm/prompts/policyEvaluator.ts`)

- System: "You evaluate a single insurance claim against the policy. You have tools for each rule. Call the tools you need in any order. Do not perform math yourself — always use `apply_financials`. End by calling `submit_policy_decision` exactly once. Cite tool results in your rationale."
- Provide the claim summary and extracted documents as the user message.
- Guard rails enforced by `runner.ts`:
  - The final decision must reference a `submit_policy_decision` call.
  - If `status === APPROVED` or `PARTIAL`, the agent must have called `apply_financials` and the final amount must equal that call's `payable`.
  - If `status === REJECTED`, at least one preceding tool call must have returned `passed: false` (no fabricated rejections).
  - If `claim_category` is one of dental/vision/alternative_medicine, `split_line_items` must have been called.

### 3d. Tests

- [x] Unit test each tool against its fixtures (no LLM) — 35 tests in `tests/unit/policy/rules.test.ts`.
- [x] Agent integration tests (LLM mocked to produce scripted tool-call sequences) for TC004 (full approval ₹1,350), TC005 (waiting period rejection with eligible-from date), TC006 (partial ₹8,000 with line-item split), TC007 (pre-auth rejection), TC008 (per-claim limit with both numbers in message), TC010 (network discount then co-pay → ₹3,240), TC012 (excluded condition) — 7 tests + degradation in `tests/unit/agents/policyEvaluator/agent.test.ts`.

**Exit:** Every test case in 3d hits the documented amount/reason; every transcript shows tool calls preceding the final claim; no decision text contains arithmetic the tools didn't produce.

---

## Phase 4 — Fraud Detector Agent (LLM + tools) — covers TC009 ✅

**What was built:**

- [x] `lib/agents/fraudDetector/schema.ts` — Zod I/O schemas for all 4 tools + `FraudAssessmentOutputSchema`.
- [x] `lib/agents/fraudDetector/tools.ts` — 4 deterministic signal tools + `submit_fraud_assessment` terminator: `count_same_day_claims`, `count_monthly_claims`, `check_high_value_threshold`, `check_document_alteration_flags`. All thresholds from `getFraudThresholds()` (policy_terms.json).
- [x] `lib/llm/prompts/fraudDetector.ts` — system prompt with mandatory procedure, scoring rubric, `requiresManualReview` enforcement rules, and `buildFraudDetectorUserPrompt()`.
- [x] `lib/agents/fraudDetector/agent.ts` — `runFraudDetector()` wraps `runAgent()`, collects doc flags from extracted docs before building user prompt.
- [x] `tests/unit/agents/fraudDetector/tools.test.ts` — 15 deterministic tool tests (TC009 fixtures + edge cases: empty history, exact-limit boundary, cross-month isolation, alteration keyword detection).
- [x] `tests/unit/agents/fraudDetector/agent.test.ts` — 4 agent integration tests with mocked LLM (TC009 same-day fraud, clean claim, document alteration signal, LLM degradation).
- [x] `npm test` → 118 passing. TypeScript clean.

Goal: surface fraud signals as a separate agent so they enter the trace independently of policy rules. Agent reads history + extracted-doc flags, decides which signals to check, and produces a narrative + score; all thresholds and counts come from deterministic tools.

### 4a. Deterministic signal tools (in `lib/agents/fraudDetector/tools.ts`)

- [x] `count_same_day_claims({ memberId, treatmentDate, claimsHistory })` → `{ count, limit, exceeded }` against `fraud_thresholds.same_day_claims_limit`.
- [x] `count_monthly_claims({ memberId, treatmentDate, claimsHistory })` → `{ count, limit, exceeded }` against `monthly_claims_limit`.
- [x] `check_high_value_threshold({ claimedAmount })` → `{ threshold, exceeded, auto_review_threshold, auto_review_triggered }`.
- [x] `check_document_alteration_flags({ extractedDocuments })` → `{ altered_documents: Array<{ file_id, reason }> }` (consumes the extractor's confidence flags).
- [x] `submit_fraud_assessment({ score, signals, requires_manual_review, rationale })` — terminating tool intercepted by runner.

### 4b. Agent prompt (in `lib/llm/prompts/fraudDetector.ts`)

- [x] System: "You assess a single claim for fraud risk. Use the tools to gather signals — do not invent counts or thresholds. End by calling `submit_fraud_assessment` exactly once."
- [x] Scoring rubric and `requiresManualReview` enforcement rules included in system prompt.
- [x] `buildFraudDetectorUserPrompt()` — formats claim summary, prior claims history, and document flags.

### 4c. Tests

- [x] Unit tests for each signal tool against TC009 fixtures — 15 tests in `tests/unit/agents/fraudDetector/tools.test.ts`.
- [x] Agent integration test (LLM mocked): TC009 yields `requiresManualReview: true` and `signals` includes a same-day-claims entry with `count: 3, limit: 2` — in `tests/unit/agents/fraudDetector/agent.test.ts`.

**Exit:** TC009 returns `MANUAL_REVIEW` at the orchestrator level with the same-day-claims signal named explicitly in the user-facing notes.


---

## Phase 5 — Deterministic Orchestrator & Trace — covers TC011 ✅

**What was built:**

- [x] `lib/pipeline/trace.ts` — `makeStage()`, `buildTrace()`, `computeDocumentConfidence()`, `computeFraudConfidence()`, `computeOverallConfidence()` helpers.
- [x] `lib/pipeline/decisionComposer.ts` — pure deterministic function: verifier halt → `decision: null`; fraud/amount threshold → `MANUAL_REVIEW` override; else pass through policy evaluator's decision.
- [x] `lib/pipeline/orchestrator.ts` — `runPipeline()`: documentVerifier → extractor → (policyEvaluator ∥ fraudDetector via `Promise.allSettled`) → decisionComposer. Every agent call wrapped in try/catch.
- [x] `tests/integration/orchestrator.test.ts` — 6 integration tests with agents mocked: TC001 (halt), TC004 (clean approval), TC005 (rejection pass-through), TC009 (fraud → MANUAL_REVIEW), TC011 (extractor DEGRADED), TC011 (total failure → MANUAL_REVIEW still produced).
- [x] `npm test` → 124 passing. TypeScript clean.

Goal: tie the agents together with a **deterministic** controller; produce one explainable `DecisionTrace` per claim. The orchestrator does no LLM work itself — it dispatches to agents, captures their transcripts, and composes the final decision.

- [x] Order: `documentVerifier → extractor → (policyEvaluator ∥ fraudDetector) → decisionComposer`.
- [x] `DecisionTrace` shape in `lib/pipeline/trace.ts` — uses existing `TraceStage`, `AgentTranscript`, `ComponentFailure`, `DecisionTrace` types from `lib/types.ts`.
- [x] `decisionComposer.ts` logic (deterministic, no LLM):
  - If `documentVerifier` returned `ok: false` → `decision: null`; `documentProblem` populated; pipeline returns immediately.
  - `fraudDetector.requiresManualReview === true` OR `claimedAmount >= auto_manual_review_above` → `MANUAL_REVIEW` with fraud rationale in decision.
  - Else: policy evaluator's `decision` passed through verbatim. `approvedAmount` sourced from evaluator tool output, never recomputed.
- [x] **Graceful degradation** (TC011): `simulateComponentFailure: true` throws in extractor stage → caught → `DEGRADED` stage, `componentFailures[]` entry, `confidence.overall` lowered by 0.15/degraded component, manual review note in rationale.
- [x] Every agent call wrapped in try/catch → `componentFailures[]` + `degradedComponents[]` → composer accounts for it.
- [x] Parallelism: `policyEvaluator` and `fraudDetector` run via `Promise.allSettled` — each settled independently.

**Exit:** TC011 is DEGRADED with confidence below 0.85, extractor failure in `componentFailures`, rationale mentions manual review. TC009 decision is `MANUAL_REVIEW` with same-day signal in rationale. No test throws.

---

## Phase 6 — UI ✅

**What was built:**

- [x] `lib/actions/submitClaim.ts` — server action: Cloudinary upload → `runPipeline()` → `createClaim()` → `redirect(/claims/[id])`.
- [x] `app/page.tsx` — home: submission form + recent claims list. OPS member picker from policy roster; MEMBER hidden memberId. Nav to `/eval`.
- [x] `components/claim/ClaimSubmissionForm.tsx` — `useActionState` form, multi-file upload with preview, spinner, inline errors.
- [x] `components/claim/DecisionBanner.tsx` — color-coded (APPROVED/PARTIAL/REJECTED/MANUAL_REVIEW/HALTED). Shows amount, rationale, rejection chips, confidence bar. Verbatim verifier halt message.
- [x] `components/claim/FinancialBreakdownCard.tsx` — line items + gross→discount→co-pay→payable waterfall. Numbers from trace only.
- [x] `components/claim/TraceViewer.tsx` — expandable stages with PASS/FAIL/DEGRADED chips + latency. Each tool call shows args + result side-by-side. Submit tools in blue.
- [x] `app/claims/[id]/page.tsx` — DecisionBanner + FinancialBreakdown + metadata + doc list + TraceViewer.
- [x] `app/api/eval/route.ts` — POST handler running all 12 test cases through the real pipeline.
- [x] `app/eval/page.tsx` — Run button → progress bar + expected vs actual table, expandable failure notes.
- [x] `app/api/claims/route.ts` — wired to real `runPipeline()`, Phase 5 stub removed.
- [x] `npm run build` → clean (TypeScript + Turbopack). `npm test` → 124/124.

---

## Phase 7 — Eval Harness & Report (≈2h)

Goal: produce the deliverable eval report and prove every test case behaves.

- [ ] `tests/integration/runAllTestCases.test.ts` iterates `test_cases.json`, runs the pipeline, asserts:
  - Halt cases (TC001–TC003): `decision === null` and the error type matches.
  - Approval cases: `decision`, `approved_amount`, and reason match exactly.
  - Confidence thresholds (TC004 > 0.85, TC012 > 0.90).
- [ ] Generate `EVAL_REPORT.md` from the test run: per case, show input summary, produced decision, full trace, expected vs. actual, and an explanation for any mismatch.
- [ ] CI-friendly: `npm test` runs unit + integration in one shot.

**Exit:** All 12 cases either pass or have a written, defended explanation for divergence. `EVAL_REPORT.md` is committed.

---

## Phase 8 — Documentation Deliverables (≈2h)

- [ ] `ARCHITECTURE.md` — components, sequence diagram, what was considered and rejected (e.g., monolithic vs. multi-agent), limitations, 10× scale plan (queueing, vector storage of past claims, async extraction workers, model fallback, observability stack).
- [ ] `CONTRACTS.md` — per-component interface: input shape, output shape, errors raised. One section per agent (`DocumentVerifier`, `Extractor`, `PolicyEvaluator`, `FraudDetector`, `Orchestrator`).
- [ ] `ASSUMPTIONS.md` — every cut and trade-off (e.g., bypass-mode extractor for tests, in-memory claims history, no auth).
- [ ] Update top-level `README.md` with run instructions: install, env vars, `npm run dev`, `npm test`, `/eval` page.

**Exit:** A reviewer can clone, run, and understand the system without asking a question.

---

## Phase 9 — Demo Video & Submission (≈1h)

- [ ] Record 8–12 minute walkthrough:
  - 1× claim stopped early due to a document problem (show the specific error message).
  - 1× clean end-to-end approval with the full trace visible.
  - One technical decision you are proud of + one you would change.
- [ ] Final pass: clean commit history, push branch, verify deployed URL (or document local setup) works from a fresh clone.
- [ ] Submit repo link, deployed URL, and eval report.

---

## Cross-cutting checklist (touches every phase)

- [ ] No policy rule, limit, member ID, or category string is hardcoded outside `policy_terms.json` and the matching enum.
- [ ] Every LLM call validates output with Zod before use.
- [ ] Every agent has at least one unit test (with the LLM mocked) and every tool has a deterministic unit test (no LLM). The pipeline has integration tests for all 12 cases.
- [ ] Every numeric value in a decision output came from a tool return — agents never restate amounts in free text.
- [ ] Every decision output is reconstructible from its trace alone (including each agent's transcript).
- [ ] Network discount is applied before co-pay everywhere it appears.
- [ ] No code path can crash the pipeline; failures land in `component_failures[]`.
