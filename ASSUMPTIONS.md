# ASSUMPTIONS.md — Cuts, Trade-offs, and Constraints

This document records every assumption, deliberate cut, and trade-off made during development. A reviewer should be able to read this alongside the code and understand why things work the way they do.

---

## 1. Authentication & Authorisation

**Assumption:** Username + bcrypt password authentication is sufficient for a demo/prototype. NextAuth v5 is used with a Credentials provider.

**Cut:** No OAuth, SSO, or MFA. In a production system, members would authenticate via the insurer's identity provider (e.g., Auth0, Okta).

**Cut:** No refresh token rotation. The NextAuth JWT strategy is used with default settings.

**Trade-off:** The OPS role is identified by a single DB flag (`UserRole.OPS`). In production, this would be a more granular RBAC system with separate reviewer, admin, and ops-read roles.

---

## 2. Document Upload & Storage

**Assumption:** Documents are uploaded directly to Cloudinary from the browser via a signed upload widget. The server never receives raw file bytes.

**Cut:** No virus scanning or malware detection on uploaded documents.

**Cut:** No OCR is performed server-side at upload time. Document content is optionally provided inline in the submission (for tests) or left for the Extractor agent to infer from file metadata and context.

**Trade-off:** Cloudinary public URLs are used. In production, signed URLs with a short expiry (e.g., 1 hour) would be required to prevent unauthorized document access.

---

## 3. Extractor Bypass Mode

**Assumption:** In the test harness (eval route, integration tests), document `content` is pre-populated inline in the `ClaimSubmission.documents[].content` field, bypassing actual OCR/LLM extraction.

**Reason:** Running real OCR on every test case would require Cloudinary-hosted test documents, incur real LLM API costs, and make tests non-deterministic (LLM output can vary between runs).

**Impact:** The Extractor agent in test mode records the pre-supplied content as if it extracted it. The agent transcript marks `degraded: false` even in bypass mode because the content is valid — it just came from the submission rather than LLM inference.

---

## 4. Claims History for Fraud Detection

**Assumption:** The fraud detector's claims history is sourced entirely from the local PostgreSQL database (same-insurer, same-system claims only).

**Cut:** No cross-policy or cross-insurer fraud detection. In production, fraud databases (e.g., IIB in India) would be queried.

**Cut:** Claims submitted in the same pipeline run are not counted against each other. Each claim is evaluated independently against the existing DB history at the time of submission.

---

## 5. Policy as Static JSON

**Assumption:** `policy_terms.json` is the single source of truth for all policy rules. It is loaded once at module initialization and held in memory.

**Trade-off:** A policy update (e.g., changing a sub-limit or adding a new excluded condition) requires a server restart to take effect. In a production system, policy terms would be versioned in a database with effective dates and cached in Redis.

**Constraint enforced in code:** No policy rule, limit, member ID, or category string is hardcoded in TypeScript. All values are read from `policy_terms.json` via typed accessors in `lib/policy/loader.ts`.

---

## 6. Synchronous Pipeline Processing

**Assumption:** The pipeline runs synchronously within the HTTP request lifecycle. The user waits for the full pipeline to complete before seeing any result.

**Implication:** For a typical claim (3 agents running concurrently), the pipeline takes 3–10 seconds depending on LLM latency. This is acceptable for a demo but would require a background job queue in production.

**Mitigation applied:** Stages 2–4 (Extractor, PolicyEvaluator, FraudDetector) run concurrently via `Promise.allSettled` to minimize wall-clock time.

---

## 7. Financial Precision

**Assumption:** All financial values are stored as `Decimal` in PostgreSQL (via Prisma) and converted to `number` (float64) in TypeScript. For Indian rupees with no sub-rupee precision, float64 is sufficient.

**Trade-off:** The integration tests use a ±₹1 tolerance on amount assertions to account for floating-point rounding in the `Decimal` → `number` conversion.

---

## 8. LLM Provider & Model

**Assumption:** Google Gemini (`gemini-2.5-flash`) is the sole LLM provider. The `@google/genai` SDK is used directly.

**Cut:** No fallback to a different model or provider on timeout or rate-limit error. If the LLM call fails, the agent throws and the orchestrator records a component failure.

**Trade-off:** `gemini-2.5-flash` is used for all agents rather than a smaller/cheaper model for simple tasks (e.g., Extractor). This simplifies configuration but increases per-claim cost.

---

## 9. No Streaming UI

**Assumption:** The UI polls for the completed claim record after submission. There is no real-time streaming of agent progress.

**Cut:** Streamed Server-Sent Events or WebSocket updates showing which pipeline stage is running. In production this would significantly improve perceived performance.

---

## 10. Concurrent Evaluator + Extractor Context Gap

**Assumption:** The PolicyEvaluator receives document context from the *submission* (pre-extraction content field) rather than from the Extractor's output. Because stages 2–4 run concurrently, the Extractor has not finished by the time the PolicyEvaluator starts.

**Impact:** For real claims (no bypass content), the PolicyEvaluator may not have access to extracted diagnosis text when checking excluded conditions. The DocumentVerifier has already confirmed that the right document types are present.

**Mitigation:** In production, the Extractor would run first (Stage 2), and its output would be injected into the PolicyEvaluator and FraudDetector inputs before they start (sequential stages 2→3,4).

---

## 11. No Rate Limiting on API Routes

**Assumption:** The `/api/claims` and `/api/eval` routes are not rate-limited. Any authenticated user can submit unlimited claims.

**Cut:** No per-user or per-IP rate limiting. In production, the `/api/eval` route would be OPS-only at the route level (currently enforced at the UI level only) and rate-limited to prevent abuse.

---

## 12. Member ID Immutability

**Assumption:** `memberId` is set at user creation and never changes. It maps 1:1 to a member in `policy_terms.json`.

**Cut:** No mid-year member transfers, dependent additions, or coverage amendments. All policy lookups use the member_id from the session token.

---

## 13. Confidence Score Calculation

**Assumption:** The `confidence.overall` in `DecisionTrace` is computed by the `trace.ts` helper as a weighted combination of:
- Document extraction confidence (average across documents, default 0.85 if no documents)
- Fraud confidence (derived from fraud score: `1 - fraud.score`)
- A penalty of `−0.15` per degraded component

The agent's stated confidence (from `submit_policy_decision`) is recorded in `PolicyDecision.confidence` separately and is not used in `confidence.overall`. This separation ensures that the overall confidence reflects pipeline health, not just the evaluator's self-assessment.
