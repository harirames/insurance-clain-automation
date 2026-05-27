# Task Plan — Plum Health Insurance Claims Processing

Phased breakdown of work for the assignment. Each phase has an exit criterion — do not move on until it is met. Target total: 2–3 days.

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
- [ ] Add a `lib/policy.ts` loader that reads `policy_terms.json` once and exposes typed accessors (no hardcoded rules anywhere else).
- [ ] Stand up the folder layout:
  ```
  app/                # Next.js routes (UI + API)
  lib/
    agents/           # one file per agent
    pipeline/         # orchestrator + trace builder
    policy/           # loader + rule evaluators
    llm/              # provider wrapper, prompt templates, JSON schema
    types.ts
  tests/
    fixtures/         # sample documents and claims
    integration/      # full pipeline runs (TC001–TC012)
    unit/             # per-component tests
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

## Phase 1 — Document Verifier Agent (≈3h) — covers TC001, TC002, TC003

Goal: stop bad submissions before any decisioning happens. This is graded at 10% but gates the rest of the pipeline.

- [ ] Input contract: `ClaimSubmission` (with `claim_category` and `documents[]` carrying `actual_type`, `quality`, `patient_name_on_doc`).
- [ ] Output contract: `{ ok: true } | { ok: false, error: DocumentProblem }` where `DocumentProblem` is a discriminated union of:
  - `WRONG_DOCUMENT_TYPE` — names uploaded type(s) and required type(s).
  - `UNREADABLE_DOCUMENT` — names the specific `file_id` / `file_name` to re-upload.
  - `PATIENT_NAME_MISMATCH` — lists every distinct name found across documents.
  - (Reserve room for: `MISSING_REQUIRED_DOC`, `EXPIRED_DOCUMENT`.)
- [ ] Rules to enforce, sourced from `policy_terms.json → document_requirements`:
  - Every `required[]` type for the claim category must be present in `documents[].actual_type`.
  - No document may have `quality === "UNREADABLE"`.
  - All non-empty `patient_name_on_doc` values must match (case-insensitive, trimmed). On mismatch, surface every distinct name.
- [ ] Error message rule: messages must reference the actual file names / types found. Generic strings fail the TC001 grading.
- [ ] Unit tests for each error path against the TC001/TC002/TC003 fixtures.

**Exit:** TC001/TC002/TC003 produce the correct halt + actionable message; pipeline never reaches the extractor for these cases.

---

## Phase 2 — Document Extractor Agent (≈3–4h)

Goal: turn raw documents into validated structured data. Most test cases provide pre-extracted `content` objects; the real extractor must still exist for the UI flow and to satisfy the assignment's vision/handwriting requirements.

- [ ] Dual-mode design:
  - **Bypass mode** — if a test fixture already supplies `content`, pass it through after schema validation. Lets the eval run deterministically.
  - **LLM mode** — call Gemini (`gemini-2.5-flash` for routine pages, `gemini-2.5-pro` for handwritten / low-quality ones) with `responseMimeType: "application/json"` and a `responseSchema` so output is structured JSON, not free text. Images / PDFs go in as inline parts; multi-page PDFs can be passed directly.
- [ ] Per-document Zod schemas for `PRESCRIPTION`, `HOSPITAL_BILL`, `LAB_REPORT`, `PHARMACY_BILL`, `DENTAL_REPORT`, `DISCHARGE_SUMMARY` — fields per `sample_documents_guide.md`.
- [ ] Doctor registration validator covering the state formats listed in `sample_documents_guide.md` (`KA/XXXXX/YYYY`, `AYUR/[STATE]/XXXXX/YYYY`, etc.). Invalid → low-confidence flag, not a hard fail.
- [ ] Confidence model: per-field confidence (0–1). Aggregate to a per-document score; aggregate again to a per-claim score.
- [ ] Failure handling: on LLM timeout or JSON-validation failure, return a partial `ExtractedDocument` with the failed fields set to `null` and a `component_failures[]` entry in the trace. Never throw out of the pipeline.
- [ ] Unit tests with golden fixtures from `sample_documents_guide.md`.

**Exit:** Extractor returns a fully typed `ExtractedDocument` for every test-case input; component failures surface in the trace without crashing.

---

## Phase 3 — Policy Evaluator (≈4h) — covers TC004–TC008, TC010, TC012

Goal: a pure, fully testable rule engine driven entirely by `policy_terms.json`.

Implement each rule as an isolated checker so the trace can record pass/fail per rule:

- [ ] **Member eligibility** — member exists in `members[]`, policy `renewal_status === "ACTIVE"`, treatment date within policy window.
- [ ] **Waiting periods** — `initial_waiting_period_days`, `pre_existing_conditions_days`, and `specific_conditions{}`. Match diagnosis text to condition keys (`Type 2 Diabetes Mellitus` → `diabetes`). On rejection, **output the date the member becomes eligible** (TC005 grading).
- [ ] **Coverage category** — pick the matching `opd_categories.*` entry; if `covered === false` → reject.
- [ ] **Exclusions** — match `exclusions.conditions[]` and category-specific exclusion lists against diagnosis/treatment text (TC012: bariatric/obesity).
- [ ] **Per-line-item rules (dental, vision, alternative medicine)** — split the bill against `covered_procedures` / `covered_items` / `excluded_procedures` lists. TC006: root canal approved, teeth whitening rejected, itemized in output.
- [ ] **Limits** — `per_claim_limit`, `sub_limit` for the category, `annual_opd_limit` (using `ytd_claims_amount` from the input), `sum_insured_per_employee`, family floater. TC008: reject when claimed > per-claim limit; quote both numbers in the message.
- [ ] **Pre-authorization** — `pre_authorization.required_for[]` and `high_value_tests_requiring_pre_auth[]` × `pre_auth_threshold`. TC007: MRI > ₹10,000 without pre-auth → `PRE_AUTH_MISSING`, with resubmission instructions.
- [ ] **Network discount + co-pay math** — **discount first, then co-pay** (TC010 invariant). Helper: `applyFinancials(amount, { networkHospital, copayPercent, networkDiscountPercent })`. Return every intermediate value for the trace.
- [ ] **Submission rules** — deadline (`deadline_days_from_treatment`), `minimum_claim_amount`.

Each rule returns `{ rule: string, passed: boolean, detail: string, data?: unknown }`. The trace concatenates these in evaluation order.

**Exit:** TC004 produces ₹1,350 with itemized discount/co-pay; TC005/TC007/TC008/TC012 produce the expected rejection reason; TC006 produces ₹8,000 with line-item breakdown; TC010 produces ₹3,240 with the documented breakdown.

---

## Phase 4 — Fraud Detector Agent (≈1.5h) — covers TC009

Goal: surface fraud signals as a separate component so they enter the trace independently of policy rules.

- [ ] Signals from `policy_terms.json → fraud_thresholds`:
  - `same_day_claims_limit` exceeded → flag.
  - `monthly_claims_limit` exceeded → flag.
  - `claimed_amount >= high_value_claim_threshold` → flag (auto manual review per `auto_manual_review_above`).
  - Document-alteration signals from the extractor.
- [ ] Output: `{ score: 0–1, signals: FraudSignal[] }`.
- [ ] Route to `MANUAL_REVIEW` when `score >= fraud_score_manual_review_threshold` or any auto-review threshold fires.

**Exit:** TC009 returns `MANUAL_REVIEW` with the same-day-claims signal named explicitly.

---

## Phase 5 — Pipeline Orchestrator & Trace (≈2h) — covers TC011

Goal: tie agents together; produce one explainable `DecisionTrace` per claim.

- [ ] Order: `verify documents → extract → evaluate policy ∥ detect fraud → compose decision`.
- [ ] Trace shape:
  ```
  {
    claim_id, started_at, ended_at,
    stages: [
      { name, status: PASS|FAIL|SKIPPED|DEGRADED, started_at, ended_at, detail, data }
    ],
    component_failures: [ { component, error, fallback } ],
    confidence: { documents, fraud, overall },
    decision: { status, approved_amount?, reasons[], notes? }
  }
  ```
- [ ] Decision composer logic:
  - Any `REJECTED` rule → `REJECTED` with its reason(s).
  - Fraud / high-value → `MANUAL_REVIEW`.
  - Some line items covered, some excluded → `PARTIAL` with itemized breakdown.
  - All passed → `APPROVED`.
  - Component failure present → drop confidence and add a recommend-manual-review note.
- [ ] **Graceful degradation**: when `simulate_component_failure === true` (TC011), the extractor (or a designated stage) returns a degraded result. The pipeline continues to a decision, marks the stage `DEGRADED`, lowers overall confidence, and emits the recommended-manual-review note — never throws.
- [ ] Each agent call is wrapped: `try/catch` → log to `component_failures` → continue with a typed empty result.

**Exit:** TC011 returns `APPROVED` (or the correct degraded decision per the data), confidence is visibly lower than TC004, and the failed component is named in the trace. No test case throws.

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
  - Approved amount + financial breakdown (line items, discount, co-pay).
  - Trace viewer: stages with PASS/FAIL/DEGRADED chips, expand for detail.
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
- [ ] Every agent has at least one unit test; the pipeline has integration tests for all 12 cases.
- [ ] Every decision output is reconstructible from its trace alone.
- [ ] Network discount is applied before co-pay everywhere it appears.
- [ ] No code path can crash the pipeline; failures land in `component_failures[]`.
