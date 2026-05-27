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

## Phase 0 — Foundations & Scaffolding (≈2h)

Goal: lock in the project shell, type system, and the canonical data shapes everything downstream will share.

- [ ] Confirm Next.js 16 App Router conventions by skimming `node_modules/next/dist/docs/` (per `AGENTS.md`). Note any deprecated APIs.
- [ ] Add tooling:
  - [ ] Vitest (or Jest) + a smoke test that runs via `npm test`.
  - [ ] `zod` for runtime schema validation on every LLM call and external input.
  - [ ] Google Gemini SDK (`@google/genai`) wired through a single provider module in `lib/llm/` so it can be mocked in tests. Default model: `gemini-2.5-pro` for reasoning, `gemini-2.5-flash` for cheaper extraction; both support vision natively.
  - [ ] `.env.local` + `.env.example` for `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and any other secrets.
- [ ] Create the canonical domain types in `lib/types.ts`:
  - `ClaimSubmission`, `DocumentInput`, `ExtractedDocument`, `PolicyDecision`, `DecisionTrace`, `Confidence`, `RejectionReason` enum, `ClaimCategory` enum, `DocumentType` enum.
  - Match enum values exactly to the strings used in `policy_terms.json` and `test_cases.json` (`CONSULTATION`, `PRESCRIPTION`, `PRE_AUTH_MISSING`, etc.).
- [ ] Add `lib/policy/loader.ts` that reads `policy_terms.json` once and exposes typed accessors (no hardcoded rules anywhere else).
- [ ] Build `lib/agents/runner.ts` — the agent loop every tool-use agent shares:
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
  Tool declarations for Gemini are generated from `inputSchema` via `zod-to-json-schema` so we never hand-write JSON schema.
- [ ] Stand up the folder layout:
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

## Phase 0.5 — Auth (NextAuth v5, Credentials) (≈2h)

Goal: gate the app behind login so `MEMBER` and `OPS` flows are separable from day one — saves a refactor later in Phase 6.

- [ ] Install `next-auth@beta` and `bcryptjs` (+ `@types/bcryptjs`). Add `AUTH_SECRET` and `AUTH_URL` to `.env.local` / `.env.example`.
- [ ] Create the auth files exactly as listed in CLAUDE.md (`app/api/auth/[...nextauth]/route.ts`, `lib/auth/{config,session,opsUsers}.ts`, `middleware.ts`, `types/next-auth.d.ts`).
- [ ] Credentials provider `authorize()`:
  - If username matches a `member_id` in `policy_terms.json` and the password matches the demo `MEMBER` hash → return `{ id, name, role: "MEMBER", memberId }`.
  - Else if username matches an entry in `lib/auth/opsUsers.ts` and bcrypt verifies → return `{ id, name, role: "OPS" }`.
  - Else return `null`.
- [ ] JWT + session callbacks: copy `role` and `memberId` into the token and back onto `session.user`. Module-augment `Session` and `JWT` in `types/next-auth.d.ts`.
- [ ] `middleware.ts` matcher protects `/claims`, `/eval`, `/api/claims`, `/api/eval`; redirects to `/login` when unauthenticated and to `/` (403) when a `MEMBER` hits an `OPS`-only route.
- [ ] Login page at `app/(auth)/login/page.tsx` using shadcn `Form` + `react-hook-form` + `LoginSchema` from `lib/types.ts`. Errors via shadcn `Alert`.
- [ ] Add `<SessionProvider>` in a thin client wrapper mounted from `app/layout.tsx`.
- [ ] `lib/auth/session.ts` exports `auth()`, `getCurrentUser()`, `requireRole("OPS" | "MEMBER")` — used by every server component, server action, and route handler.
- [ ] Document demo credentials in `README.md` (e.g., `EMP001` / `password123`, `ops@plum.test` / `opspass123`). Commit the hashes only, never plaintext.
- [ ] Unit tests: `authorize()` resolves a known member, rejects a wrong password, rejects an unknown username. Integration test: hitting `/eval` as a `MEMBER` returns 403.

**Exit:** `npm run dev` shows the login screen on first load; `EMP001` logs in and lands on `/`; `ops@plum.test` logs in and can reach `/eval`; a `MEMBER` cannot reach `/eval` or another member's claim page.

---

## Phase 0.7 — Persistence: Prisma + Postgres + Cloudinary (≈2h)

Goal: persistent claims and decision traces in Postgres via Prisma, uploaded documents in Cloudinary. Vercel-compatible end to end.

### 0.7a — Postgres + Prisma setup

- [ ] Pick a Postgres host:
  - Local dev: Docker (`docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16`) — fastest to start.
  - Cloud/Vercel: Neon, Supabase, or Vercel Postgres (free tiers fine).
- [ ] Install: `npm i prisma @prisma/client && npm i -D prisma` (Prisma is also a peer of `prisma`). Run `npx prisma init`.
- [ ] Add `"postinstall": "prisma generate"` to `package.json` (required so `prisma generate` runs during Vercel builds).
- [ ] Env vars in `.env.local` + `.env.example`:
  - `DATABASE_URL` — pooled connection string for runtime.
  - `DIRECT_URL` — direct connection for migrations (only with poolers like Neon/Supabase).
- [ ] `lib/db.ts` — HMR-safe Prisma client singleton:
  ```ts
  import { PrismaClient } from "@prisma/client";
  const g = globalThis as unknown as { prisma?: PrismaClient };
  export const prisma = g.prisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== "production") g.prisma = prisma;
  ```

### 0.7b — Schema (`prisma/schema.prisma`)

- [ ] Enums (values must match strings in `policy_terms.json` / `test_cases.json`):
  ```prisma
  enum ClaimCategory { CONSULTATION DIAGNOSTIC PHARMACY DENTAL VISION ALTERNATIVE_MEDICINE }
  enum DocumentType  { PRESCRIPTION HOSPITAL_BILL LAB_REPORT PHARMACY_BILL DENTAL_REPORT DIAGNOSTIC_REPORT DISCHARGE_SUMMARY }
  enum ClaimStatus   { HALTED APPROVED PARTIAL REJECTED MANUAL_REVIEW }
  enum DocumentQuality { GOOD POOR UNREADABLE }
  ```
- [ ] Models:
  ```prisma
  model Claim {
    id              String        @id @default(cuid())
    memberId        String
    policyId        String
    claimCategory   ClaimCategory
    treatmentDate   DateTime
    claimedAmount   Decimal       @db.Decimal(12, 2)
    hospitalName    String?
    submittedBy     String        // user id from NextAuth session
    status          ClaimStatus
    approvedAmount  Decimal?      @db.Decimal(12, 2)
    decisionTrace   Json          // full DecisionTrace, including each agent transcript
    documents       Document[]
    createdAt       DateTime      @default(now())
    updatedAt       DateTime      @updatedAt
    @@index([memberId, createdAt])
    @@index([submittedBy, createdAt])
  }

  model Document {
    id                  String          @id @default(cuid())
    claimId             String
    claim               Claim           @relation(fields: [claimId], references: [id], onDelete: Cascade)
    fileName            String
    actualType          DocumentType
    mimeType            String
    cloudinaryPublicId  String
    cloudinaryUrl       String
    quality             DocumentQuality?
    patientNameOnDoc    String?
    extractedContent    Json?
    confidence          Json?
    createdAt           DateTime        @default(now())
    @@index([claimId])
  }
  ```
- [ ] `npx prisma migrate dev --name init` to create the first migration. Commit `prisma/migrations/`.
- [ ] Do **not** create a `User` or `Member` table — members come from `policy_terms.json`, ops users from `lib/auth/opsUsers.ts`, sessions are JWT.

### 0.7c — Cloudinary setup

- [ ] Create a free Cloudinary account. Add env vars to `.env.local` + `.env.example`:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET` (server-only — never imported client-side)
- [ ] Install: `npm i cloudinary`.
- [ ] `lib/storage/cloudinary.ts`:
  ```ts
  import { v2 as cloudinary } from "cloudinary";
  cloudinary.config({ cloud_name: ..., api_key: ..., api_secret: ..., secure: true });
  export async function uploadDocument(claimId: string, file: { name: string; bytes: Buffer; mimeType: string }) {
    const res = await cloudinary.uploader.upload(`data:${file.mimeType};base64,${file.bytes.toString("base64")}`, {
      folder: `claims/${claimId}`,
      resource_type: "auto",          // handles images and PDFs
      public_id: file.name.replace(/\.[^.]+$/, ""),
      overwrite: false,
    });
    return { publicId: res.public_id, url: res.secure_url, mimeType: file.mimeType };
  }
  export function getDocumentUrl(publicId: string) { return cloudinary.url(publicId, { secure: true, sign_url: true }); }
  ```
- [ ] Allow only `image/jpeg`, `image/png`, `application/pdf` in the upload handler. Reject everything else with a shadcn `Alert` on the form.

### 0.7d — Repository layer (`lib/storage/claimsRepo.ts`)

Thin wrappers, no business logic. The orchestrator and route handlers call these — Prisma never leaks past this file.

- [ ] `createClaim(input)` — wraps `Claim` + `Document` creates in a single `prisma.$transaction(...)` so a partial failure doesn't orphan documents.
- [ ] `getClaim(id)` — `findUnique` with `include: { documents: true }`.
- [ ] `listByMember(memberId)` — for the member dashboard.
- [ ] `listAll(filter?)` — for ops; supports basic status filter + pagination.
- [ ] All functions return plain typed objects (cast `Decimal` to `number`, `Date` to ISO string) so the rest of the codebase doesn't depend on Prisma types.

### 0.7e — Wire into routes

- [ ] `app/api/claims/route.ts` (POST):
  1. `auth()` to get user — fail 401 if absent.
  2. Parse `multipart/form-data`; for each file, validate MIME type, call `uploadDocument(tempClaimId, file)`.
  3. Run the orchestrator with the resulting `cloudinaryUrl`s as document inputs.
  4. `createClaim()` with the final record (status + trace + document refs).
  5. Return `{ claim_id }`.
- [ ] `app/api/claims/[id]/route.ts` (GET): `getClaim()`; enforce `MEMBER` ownership against `session.user.memberId`; OPS sees everything.
- [ ] `app/claims/[id]/page.tsx` is a Server Component that calls `getClaim()` directly (no client fetch).
- [ ] The Gemini extractor receives the Cloudinary `secure_url` as a remote `fileData` part — Gemini fetches the bytes itself, no server-side download needed.

### 0.7f — Tests

- [ ] Unit: `claimsRepo` round-trips a claim against a test database (use a `DATABASE_URL_TEST` Postgres or `pg-mem` if you want to avoid a real DB in unit tests).
- [ ] Mock the Cloudinary SDK in tests — never hit Cloudinary from CI.
- [ ] Integration: POST a multipart claim, assert a row exists with the expected status and the trace JSON contains stage transcripts; GET returns the same record.

### Deployment note (document in `ASSUMPTIONS.md` + `README.md`)

- All three services work on Vercel. Use Vercel Postgres or Neon for `DATABASE_URL`; pooled connection at runtime, `DIRECT_URL` for `prisma migrate deploy`.
- Add the Cloudinary env vars in Vercel project settings.
- Run `npx prisma migrate deploy` as part of the build (Vercel build command: `prisma generate && prisma migrate deploy && next build`). Locally, use `prisma migrate dev`.

**Exit:** Submitting a claim writes one `Claim` + N `Document` rows, the documents land in Cloudinary under `claims/<claimId>/`, and `/claims/[id]` re-renders the full trace from the DB on a fresh page load.

---

## Phase 1 — Document Verifier Agent (LLM + tools) (≈3h) — covers TC001, TC002, TC003

Goal: stop bad submissions before any decisioning happens. The agent decides which checks to run and writes the user-facing message; deterministic tools own the actual checks. Graded at 10% but gates the rest of the pipeline.

- [ ] Input contract: `ClaimSubmission` (with `claim_category` and `documents[]` carrying `actual_type`, `quality`, `patient_name_on_doc`).
- [ ] Final output contract (the agent's structured return): `{ ok: true } | { ok: false, error: DocumentProblem }` where `DocumentProblem` is a discriminated union of:
  - `WRONG_DOCUMENT_TYPE` — names uploaded type(s) and required type(s).
  - `UNREADABLE_DOCUMENT` — names the specific `file_id` / `file_name` to re-upload.
  - `PATIENT_NAME_MISMATCH` — lists every distinct name found across documents.
  - `MISSING_REQUIRED_DOC` — names the missing required type.
- [ ] **Tools** (all deterministic, all defined in `lib/agents/documentVerifier/tools.ts`, all sourced from `policy_terms.json → document_requirements`):
  - `check_required_document_types({ claim_category, uploaded_types })` → `{ missing: DocumentType[], extra: DocumentType[] }`.
  - `check_document_quality({ documents })` → `{ unreadable: Array<{ file_id, file_name }> }`.
  - `check_patient_name_consistency({ documents })` → `{ matched: boolean, distinct_names: Array<{ file_id, name }> }`.
  - `lookup_required_types_for_category({ claim_category })` → `{ required: DocumentType[], optional: DocumentType[] }` (gives the model the policy context to write specific messages).
- [ ] **Agent prompt** (in `lib/llm/prompts/documentVerifier.ts`):
  - System: "You are a claims document verifier. Use the tools to determine whether the submission is valid before any decisioning happens. You MUST cite specific file names and document types in any rejection message — never use generic phrasing. Return your final answer via the structured response."
  - Constrain the model: it may not produce a final `ok: false` answer for a category of problem until the relevant tool has been called and returned a non-empty result. (Enforce this in `runner.ts`: if the agent submits a `WRONG_DOCUMENT_TYPE` error, the transcript must contain a `check_required_document_types` call with matching args.)
- [ ] **Error message rule:** messages must reference actual file names / types from tool outputs. The validator in `runner.ts` rejects any final message whose `uploaded`/`required`/`file_name` fields are not substrings of the relevant tool result — forces traceability.
- [ ] **Unit tests** with the LLM mocked:
  - For TC001 fixtures, assert the agent (a) called `check_required_document_types`, (b) returned `WRONG_DOCUMENT_TYPE` with both prescription file names listed and `HOSPITAL_BILL` named as required.
  - For TC002, assert it called `check_document_quality` and returned `UNREADABLE_DOCUMENT` naming `blurry_bill.jpg`.
  - For TC003, assert it called `check_patient_name_consistency` and returned `PATIENT_NAME_MISMATCH` with both names.
- [ ] **Deterministic tool tests** (pure functions, no LLM): one per tool covering the same fixtures.

**Exit:** TC001/TC002/TC003 produce the correct halt + actionable message; the transcript shows tool calls preceding every claim in the message; pipeline never reaches the extractor for these cases.

---

## Phase 2 — Document Extractor (structured-output Gemini call) (≈3–4h)

Goal: turn raw documents into validated structured data. Unlike the other agents, this one does **not** use tool-use — it's a single Gemini call with `responseSchema` per document. Most test cases provide pre-extracted `content` objects; the real extractor must still exist for the UI flow and to satisfy the assignment's vision/handwriting requirements.

- [ ] Dual-mode design:
  - **Bypass mode** — if a test fixture already supplies `content`, pass it through after schema validation. Lets the eval run deterministically.
  - **LLM mode** — call Gemini (`gemini-2.5-flash` for routine pages, `gemini-2.5-pro` for handwritten / low-quality ones) with `responseMimeType: "application/json"` and a `responseSchema` derived from the per-document-type Zod schema. Images / PDFs go in as inline parts; multi-page PDFs can be passed directly.
- [ ] Per-document Zod schemas for `PRESCRIPTION`, `HOSPITAL_BILL`, `LAB_REPORT`, `PHARMACY_BILL`, `DENTAL_REPORT`, `DISCHARGE_SUMMARY` — fields per `sample_documents_guide.md`. Defined in `lib/agents/extractor/schema.ts`.
- [ ] Doctor registration validator covering the state formats listed in `sample_documents_guide.md` (`KA/XXXXX/YYYY`, `AYUR/[STATE]/XXXXX/YYYY`, etc.). Invalid → low-confidence flag, not a hard fail.
- [ ] Confidence model: per-field confidence (0–1) requested from the model and validated. Aggregate to a per-document score; aggregate again to a per-claim score.
- [ ] Even though this is not a tool-use agent, emit an `AgentTranscript` shaped output (one model turn, zero tool calls) so the orchestrator's trace builder handles it uniformly.
- [ ] Failure handling: on LLM timeout or JSON-validation failure, return a partial `ExtractedDocument` with the failed fields set to `null` and a `component_failures[]` entry in the trace. Never throw out of the pipeline.
- [ ] Unit tests with golden fixtures from `sample_documents_guide.md` (LLM mocked).

**Exit:** Extractor returns a fully typed `ExtractedDocument` for every test-case input; component failures surface in the trace without crashing.

---

## Phase 3 — Policy Evaluator Agent (LLM + tools) (≈4h) — covers TC004–TC008, TC010, TC012

Goal: an LLM agent that, given the extracted claim, decides which rule tools to invoke and in what order, reads their results, and composes the rationale. The rule modules are pure deterministic functions in `lib/policy/` and are exposed as Gemini function-calling tools. **All numeric outputs (approved amount, discount, co-pay, eligibility date) come from tool returns, never from generated text.**

### 3a. Deterministic rule modules in `lib/policy/` (write & test first)

Each module exports a pure function with a Zod input + Zod output schema. Each returns `{ passed: boolean, detail: string, data: object }` so the agent can quote `data` fields verbatim.

- [ ] `lib/policy/eligibility.ts` — `checkMemberEligibility({ memberId, treatmentDate })` → member exists in `members[]`, policy `renewal_status === "ACTIVE"`, treatment date within policy window.
- [ ] `lib/policy/waitingPeriod.ts` — `checkWaitingPeriod({ memberId, diagnosis, treatmentDate })` → uses `initial_waiting_period_days`, `pre_existing_conditions_days`, `specific_conditions{}`. Maps diagnosis text → condition key (`Type 2 Diabetes Mellitus` → `diabetes`). When failing, returns `data.eligible_from: "YYYY-MM-DD"` for TC005.
- [ ] `lib/policy/coverage.ts` — `checkCategoryCoverage({ claimCategory })` → picks `opd_categories.*`; `covered === false` → fail.
- [ ] `lib/policy/exclusions.ts` — `checkExclusions({ diagnosis, treatment, lineItems })` → matches `exclusions.conditions[]` + category-specific lists. TC012: bariatric / obesity.
- [ ] `lib/policy/lineItems.ts` — `splitLineItems({ claimCategory, lineItems })` → for dental/vision/alt-med, classifies each line as `COVERED` | `EXCLUDED` against `covered_procedures` / `excluded_procedures`. TC006.
- [ ] `lib/policy/limits.ts` — `checkLimits({ claimedAmount, claimCategory, ytdClaimsAmount })` → returns the first violated limit with both numbers in `data` for the rejection message. TC008.
- [ ] `lib/policy/preAuth.ts` — `checkPreAuth({ claimCategory, tests, amount, preAuthProvided })` → matches `pre_authorization.required_for[]` and `high_value_tests_requiring_pre_auth[]` × `pre_auth_threshold`. TC007.
- [ ] `lib/policy/financials.ts` — `applyFinancials({ amount, claimCategory, hospitalName })` → **discount first, then co-pay** (TC010 invariant). Returns `{ gross, network_discount_percent, network_discount_amount, after_discount, copay_percent, copay_amount, payable }`. Every intermediate value lands in the trace.
- [ ] `lib/policy/submissionRules.ts` — `checkSubmissionRules({ treatmentDate, claimedAmount })` → `deadline_days_from_treatment`, `minimum_claim_amount`.

Unit-test each one against the matching test case fixtures before wiring tools.

### 3b. Tools (in `lib/agents/policyEvaluator/tools.ts`)

Each rule module above is wrapped 1:1 as a Gemini function-calling tool with the same name (camelCase → snake_case for the tool name, e.g. `check_waiting_period`). The wrapper validates inputs with the Zod schema and forwards to the rule module. No new logic in the tool layer.

Add one *terminating* tool the agent must call exactly once at the end:
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

- [ ] Unit test each tool against its fixtures (no LLM).
- [ ] Agent integration tests (LLM mocked to produce scripted tool-call sequences) for TC004 (full approval ₹1,350), TC005 (waiting period rejection with eligible-from date), TC006 (partial ₹8,000 with line-item split), TC007 (pre-auth rejection), TC008 (per-claim limit with both numbers in message), TC010 (network discount then co-pay → ₹3,240), TC012 (excluded condition).

**Exit:** Every test case in 3d hits the documented amount/reason; every transcript shows tool calls preceding the final claim; no decision text contains arithmetic the tools didn't produce.

---

## Phase 4 — Fraud Detector Agent (LLM + tools) (≈2h) — covers TC009

Goal: surface fraud signals as a separate agent so they enter the trace independently of policy rules. Agent reads history + extracted-doc flags, decides which signals to check, and produces a narrative + score; all thresholds and counts come from deterministic tools.

### 4a. Deterministic signal tools (in `lib/agents/fraudDetector/tools.ts`)

- `count_same_day_claims({ memberId, treatmentDate, claimsHistory })` → `{ count, limit, exceeded }` against `fraud_thresholds.same_day_claims_limit`.
- `count_monthly_claims({ memberId, treatmentDate, claimsHistory })` → `{ count, limit, exceeded }` against `monthly_claims_limit`.
- `check_high_value_threshold({ claimedAmount })` → `{ threshold, exceeded, auto_review_threshold, auto_review_triggered }`.
- `check_document_alteration_flags({ extractedDocuments })` → `{ altered_documents: Array<{ file_id, reason }> }` (consumes the extractor's confidence flags).
- `submit_fraud_assessment({ score, signals, requires_manual_review, rationale })` — terminating tool. `score` and `requires_manual_review` are checked against `fraud_thresholds.fraud_score_manual_review_threshold` by the runner; if any `exceeded === true` came from upstream tool calls, `requires_manual_review` must be `true` (the runner rejects inconsistent submissions).

### 4b. Agent prompt (in `lib/llm/prompts/fraudDetector.ts`)

- System: "You assess a single claim for fraud risk. Use the tools to gather signals — do not invent counts or thresholds. End by calling `submit_fraud_assessment` exactly once."
- Inputs: claim summary, claims history, extracted document flags.

### 4c. Tests

- [ ] Unit tests for each signal tool against TC009 fixtures.
- [ ] Agent integration test (LLM mocked): TC009 yields `requires_manual_review: true` and `signals` includes a same-day-claims entry with `count: 3, limit: 2`.

**Exit:** TC009 returns `MANUAL_REVIEW` at the orchestrator level with the same-day-claims signal named explicitly in the user-facing notes.

---

## Phase 5 — Deterministic Orchestrator & Trace (≈2h) — covers TC011

Goal: tie the agents together with a **deterministic** controller; produce one explainable `DecisionTrace` per claim. The orchestrator does no LLM work itself — it dispatches to agents, captures their transcripts, and composes the final decision. This keeps the eval reproducible while the agents stay autonomous.

- [ ] Order: `documentVerifier → extractor → (policyEvaluator ∥ fraudDetector) → decisionComposer`.
- [ ] `DecisionTrace` shape (in `lib/pipeline/trace.ts`):
  ```
  {
    claim_id, started_at, ended_at,
    stages: [
      {
        name,                              // "documentVerifier" | "extractor" | "policyEvaluator" | "fraudDetector" | "decisionComposer"
        status: PASS|FAIL|SKIPPED|DEGRADED,
        started_at, ended_at,
        agent_transcript?: AgentTranscript, // for LLM stages — every model turn + tool call
        result: object,                    // the agent's structured output
      }
    ],
    component_failures: [ { component, error, fallback } ],
    confidence: { documents, fraud, overall },
    decision: { status, approved_amount?, reasons[], notes?, line_items_decision? }
  }
  ```
- [ ] `decisionComposer.ts` logic (deterministic, no LLM):
  - If `documentVerifier` returned `ok: false` → decision is `null` and the trace stops there; surface the verifier's message verbatim.
  - Else combine `policyEvaluator.submit_policy_decision` + `fraudDetector.submit_fraud_assessment`:
    - `fraudDetector.requires_manual_review === true` OR claim amount ≥ `auto_manual_review_above` → `MANUAL_REVIEW`.
    - Else use the policy evaluator's `status`.
    - `PARTIAL` only when `split_line_items` produced a mix of `COVERED` and `EXCLUDED`.
  - Approved amount is copied from the `apply_financials` tool result referenced by the evaluator's `financials_ref` — never recomputed here.
- [ ] **Graceful degradation** (TC011): when `simulate_component_failure === true`, the orchestrator marks the targeted stage (e.g., extractor) as `DEGRADED`, substitutes a typed-empty result, continues to the next stage, lowers `confidence.overall`, and adds a "manual review recommended due to incomplete processing" note. The composer still produces a decision.
- [ ] Every agent call is wrapped in the orchestrator: `try/catch` → log to `component_failures` → continue with a typed empty result. The agent `runner.ts` already catches its own errors, so this is a belt-and-suspenders second layer.
- [ ] Parallelism: `policyEvaluator` and `fraudDetector` are independent of each other — run them with `Promise.allSettled` and merge results.

**Exit:** TC011 returns `APPROVED` (or the correct degraded decision), `confidence.overall` is visibly lower than TC004, the failed component is named in the trace, and the agent transcripts of every stage are present for `/eval` rendering. No test case throws.

---

## Phase 6 — UI (≈3–4h)

Goal: a usable submission + review surface. Server actions + the App Router are fine; keep client state minimal.

- [ ] `/` submission form:
  - Submitting member is pulled from `auth()` (the logged-in `MEMBER`); ops users get a member picker populated from the policy roster.
  - Claim category dropdown.
  - Treatment date, claimed amount, hospital name (optional).
  - File upload (multi-file, images + PDF).
  - On submit, POST to a server action / route handler that runs the pipeline.
- [ ] `/claims/[id]` decision review:
  - Decision banner (`APPROVED` / `PARTIAL` / `REJECTED` / `MANUAL_REVIEW`) with color cue.
  - Approved amount + financial breakdown (line items, discount, co-pay) sourced from the `apply_financials` tool call in the trace.
  - Trace viewer: stages with PASS/FAIL/DEGRADED chips, expand to see each agent's transcript — every model turn and every tool call (name, args, result) rendered inline. This is the multi-agent demo surface; make it look good.
  - Rejection / problem messages rendered prominently and verbatim from the pipeline (so the TC001-style specificity survives to the user).
- [ ] `/eval` page: button that runs all 12 test cases server-side and renders a table of expected vs. actual. Useful for the demo video.
- [ ] Manual browser test of the golden path and at least one rejection path before declaring this phase done.

**Exit:** A claim can be submitted via the browser and its full trace inspected on a separate page. Eval page works.

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
