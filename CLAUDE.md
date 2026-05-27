@AGENTS.md

# Project: Plum Health Insurance Claims Processing System

This repo is the Plum AI Engineer assignment: build a system that automates review of employee health insurance claims (member details + treatment + claimed amount + uploaded documents → `APPROVED` / `PARTIAL` / `REJECTED` / `MANUAL_REVIEW`).

Read `assignment.md` for the full brief. Do not deviate from its non-negotiable behaviors.

## Tech stack
- Next.js 16.2.6 (App Router, `app/`) with React 19.2 and TypeScript (strict). See `AGENTS.md` — this is NOT the Next.js in your training data; consult `node_modules/next/dist/docs/` before writing framework code.
- Tailwind v4 via `@tailwindcss/postcss`.
- Package scripts: `dev`, `build`, `start`, `lint`. No test runner is configured yet — adding one is expected (assignment requires tests on every significant component).

## Source-of-truth files (do not duplicate or paraphrase their content in code)
- `policy_terms.json` — policy config: coverage categories, sub-limits, co-pay, network discounts, waiting periods, exclusions, pre-auth rules, fraud thresholds, document requirements per claim category, member roster. **All policy logic must be read from this file at runtime. Do not hardcode rules, limits, member IDs, or category names.**
- `test_cases.json` — 12 scenarios (TC001–TC012) with expected outcomes. The eval report must run every case through the system. Notable invariants:
  - TC001–TC003: document problems must stop the pipeline before any claim decision is made; error messages must name the specific uploaded type and the required type / unreadable file / mismatched patient names.
  - TC010: network discount is applied **before** co-pay, not after. Both must be shown in the decision breakdown.
  - TC011: when `simulate_component_failure: true`, the pipeline must continue, mark the failed component in the trace, lower confidence, and recommend manual review — never crash.
- `sample_documents_guide.md` — Indian medical document formats (prescription, hospital bill, lab report, pharmacy bill), doctor registration number patterns per state, common diagnoses, and the messy real-world variations (handwriting, stamps over text, multilingual, blurry phone photos, alterations) the extraction layer must tolerate.
- `README.md` — package overview and timeline (2–3 days).

## Non-negotiable system behaviors (from `assignment.md`)
1. **Accept a claim submission** — member details, treatment type, claimed amount, one or more document files (images/PDFs).
2. **Catch document problems early** — validate uploaded document types against `document_requirements` for the claim category in `policy_terms.json` *before* any extraction or decisioning. On failure, return a specific actionable message (which type was uploaded, which is required). Generic errors fail the case.
3. **Extract structured information** — patient, diagnosis, treatment, amounts, dates, doctor details. Handle dirty inputs; flag low-confidence fields rather than dropping the whole document.
4. **Make a claim decision** — `APPROVED` | `PARTIAL` | `REJECTED` | `MANUAL_REVIEW`, always with approved amount (if any), reason, and confidence score.
5. **Every decision is explainable** — emit a full trace: what was checked, what passed, what failed, why. Ops should be able to reconstruct any decision from the trace alone.
6. **Graceful degradation** — individual component failures (LLM timeout, parse error, bad input) must not crash the pipeline. Continue with what's available, reflect the degraded state in output, and reduce confidence accordingly.

## Design preferences
- **Multi-agent architecture is a bonus** under the System Design rubric (30% of grade). Favor cleanly separated agents/components (e.g., document verifier, extractor, policy evaluator, decision composer, fraud detector) with explicit input/output contracts.
- **Component contracts are a deliverable.** For every significant component define input shape, output shape, and the errors it can raise — precise enough that another engineer could reimplement it without reading the code.
- Use LLMs thoughtfully: structured output (JSON schema / typed responses), validation on every model call, defined fallback on failure. Do not let raw model output reach the decision step unvalidated.
- **LLM / vision provider: Google Gemini** via `@google/genai`. Use `responseMimeType: "application/json"` with a `responseSchema` so extraction returns typed JSON; Gemini handles both text and vision (images + PDFs) in one call. Default to `gemini-2.5-flash`; escalate to `gemini-2.5-pro` for handwritten or low-quality documents. All calls go through `lib/llm/` so they can be mocked in tests. Env var: `GEMINI_API_KEY`.
- Async where it matters (parallel document extraction, parallel rule checks). Don't async for its own sake.

## UI conventions — shadcn/ui (mandatory)
- **Every UI primitive comes from shadcn/ui.** Do not write a raw `<button>`, `<input>`, `<select>`, `<dialog>`, toast, table, card, badge, tabs, or form layout by hand. If the primitive does not exist yet, run `npx shadcn@latest add <component>` and import from `@/components/ui/<component>`. Custom UI is composed *from* shadcn primitives, not in place of them.
- Initialize once via `npx shadcn@latest init` (style: default, base color: neutral, CSS variables: on). Confirm the generated `components.json`, `lib/utils.ts` (for `cn`), and `app/globals.css` (with the shadcn variables) are checked in.
- Icons: `lucide-react` only. No mixing icon libraries.
- Styling: Tailwind v4 utility classes, composed with `cn(...)` from `lib/utils.ts`. No inline `style={}` except for genuinely dynamic values (e.g., progress bar widths). No CSS modules, no styled-components.
- Forms: `react-hook-form` + `zod` + shadcn `Form` components. Same Zod schemas used by the pipeline drive the form — schema lives in `lib/types.ts`, never duplicated in the component.
- Feedback: shadcn `Toast` / `Sonner` for transient messages; shadcn `Alert` for persistent inline errors (e.g., the TC001-style document-problem messages). Never `alert()` or `console.log` as user-facing feedback.
- Accessibility: shadcn primitives are Radix-based — keep their `aria-*` props and `<Label htmlFor>` wiring intact. Do not strip props to "clean up" markup.
- Theming: dark mode via the `class` strategy. All colors come from CSS variables defined by shadcn — no hard-coded hex values in components.

## Folder & file structure (single source of truth)
This layout is mandatory. Do not invent parallel directories (`src/`, `services/`, `utils/`, etc.) — extend the ones below.

```
app/
  layout.tsx                # root layout, fonts, Toaster mount
  page.tsx                  # claim submission entry
  globals.css               # Tailwind + shadcn variables (only global stylesheet)
  claims/
    [id]/page.tsx           # decision review (trace viewer)
  eval/page.tsx             # runs all 12 test cases
  api/
    claims/route.ts         # POST submit, GET list
    claims/[id]/route.ts    # GET one
    eval/route.ts           # runs the harness
components/
  ui/                       # shadcn-generated primitives — do not hand-edit
  claim/                    # feature components (ClaimForm, DecisionBanner, TraceViewer, LineItemsTable)
  layout/                   # app shell (Header, Sidebar, ThemeToggle)
lib/
  agents/                   # one file per agent: documentVerifier.ts, extractor.ts, policyEvaluator.ts, fraudDetector.ts
  pipeline/                 # orchestrator.ts, trace.ts, decisionComposer.ts
  policy/                   # loader.ts + rule modules (waitingPeriod.ts, exclusions.ts, limits.ts, preAuth.ts, financials.ts)
  llm/                      # gemini provider, prompt templates, response schemas
  utils.ts                  # `cn` and other pure helpers
  types.ts                  # canonical domain types + Zod schemas (single source)
tests/
  fixtures/                 # sample documents, claim inputs
  unit/                     # mirrors lib/ structure
  integration/              # full pipeline runs incl. all 12 test cases
public/                     # static assets only
```

### File & symbol naming
- **Files:** `camelCase.ts` for `lib/` modules and agents; `PascalCase.tsx` for React components in `components/`; `kebab-case` for Next.js route folders (`app/claims/[id]`).
- **shadcn primitives:** keep the generator's `kebab-case.tsx` names (e.g., `components/ui/button.tsx`) — do not rename.
- **Tests:** `<sibling>.test.ts` co-located conceptually under `tests/unit/<same-path>`; integration tests live in `tests/integration/<scenario>.test.ts`.
- **Exports:** prefer named exports. Default exports only where Next.js requires them (`page.tsx`, `layout.tsx`, `route.ts`).
- **Types & Zod:** every domain type is declared once in `lib/types.ts` as `export const FooSchema = z.object({...})` plus `export type Foo = z.infer<typeof FooSchema>`. Never re-declare a type elsewhere.

### Component pattern
- Server Components by default. Add `"use client"` only when the component needs state, effects, or browser APIs — and push that boundary as deep as possible (leaf components, not whole pages).
- Data fetching happens in Server Components or Route Handlers. Client components receive data via props, not by calling APIs themselves, unless interaction requires it.
- One component per file. Co-located sub-components only if private and small (<30 lines). Otherwise promote to its own file in the same folder.
- Props typed via an `interface FooProps` declared immediately above the component. No `React.FC`.

### Import order
1. React / Next built-ins
2. Third-party packages
3. `@/components/ui/*`
4. `@/components/*` (feature)
5. `@/lib/*`
6. Relative imports (`./`, `../`) — only for genuinely local siblings
Blank line between groups. `@/*` is the only path alias.

## Persistence — Prisma + Postgres + Cloudinary
- **Database: Postgres via Prisma.** Schema in `prisma/schema.prisma`; generated client imported only via `lib/db.ts` (singleton, HMR-safe). Migrations live in `prisma/migrations/` and are committed. Connection string in `DATABASE_URL`; if using a pooler (Neon, Supabase, Vercel Postgres) also set `DIRECT_URL` for migrations.
- **Schema (minimum viable):**
  - `Claim` — `id`, `memberId`, `policyId`, `claimCategory`, `treatmentDate`, `claimedAmount`, `hospitalName?`, `submittedBy`, `status` (enum incl. `HALTED` for document-problem stops), `approvedAmount?`, `decisionTrace` (`Json`), `createdAt`, `updatedAt`.
  - `Document` — `id`, `claimId` (FK → `Claim.id`, cascade delete), `fileName`, `actualType` (enum), `mimeType`, `cloudinaryPublicId`, `cloudinaryUrl`, `quality?`, `patientNameOnDoc?`, `extractedContent?` (`Json`), `confidence?` (`Json`), `createdAt`.
  - Enums: `ClaimCategory`, `DocumentType`, `ClaimStatus`. Values must match the strings in `policy_terms.json` / `test_cases.json` exactly. Members are *not* a DB table — they come from `policy_terms.json`.
- **DB access rules:** call Prisma only from Route Handlers, Server Actions, and Server Components — never from client code or from inside agents. Agents receive plain data; the orchestrator is the only thing that reads/writes claims.
- **Repository layer:** thin wrappers in `lib/storage/claimsRepo.ts` (`createClaim`, `getClaim`, `listByMember`, `listAll`) — keeps Prisma calls out of route handlers and gives one place to add caching later.
- **Document storage: Cloudinary.** Server-side uploads via the `cloudinary` SDK; never expose `CLOUDINARY_API_SECRET` to the client. Wrapper in `lib/storage/cloudinary.ts` exposes `uploadDocument(claimId, file)` → `{ publicId, url, mimeType }` and `getDocumentUrl(publicId)`. Use a `claims/<claimId>/` folder convention. Allowed types: `image/jpeg`, `image/png`, `application/pdf`. Document URLs are passed to the Gemini extractor as remote `fileData` parts (Gemini fetches them directly — no need to download server-side first).
- **Env vars** (add to `.env.example`):
  - `DATABASE_URL` — Postgres connection string (pooled if applicable).
  - `DIRECT_URL` — direct connection for `prisma migrate` (optional, only with poolers).
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Vercel deploy:** all three services work on Vercel serverless. Use Vercel Postgres / Neon for `DATABASE_URL`. Add `"postinstall": "prisma generate"` to `package.json` so the client is generated during Vercel builds.

## Authentication — NextAuth (Auth.js v5) Credentials provider
- **Use NextAuth v5 (`next-auth@beta`, App Router style).** Credentials provider only — no OAuth, no email magic links, no database adapter for this assignment. Sessions via JWT (`session: { strategy: "jwt" }`).
- **Two roles:** `MEMBER` (submits claims, sees only their own) and `OPS` (reviews all claims, can run the eval harness). Role is stored in the JWT and surfaced via `session.user.role`.
- **User source:** `MEMBER` accounts are derived from the `members[]` array in `policy_terms.json` — `member_id` is the username. `OPS` accounts live in a small `lib/auth/opsUsers.ts` (one or two demo users is enough). Passwords are hashed with `bcryptjs`; commit only the hashes, never plaintext. Provide demo credentials in `README.md`.
- **Files (extend the locked folder structure):**
  ```
  app/
    api/auth/[...nextauth]/route.ts   # NextAuth handler
    (auth)/login/page.tsx             # login screen (route group, no shell)
  lib/
    auth/
      config.ts                       # authOptions: providers, callbacks, pages
      session.ts                      # `auth()`, `getCurrentUser()`, role guards
      opsUsers.ts                     # demo ops accounts (hashed)
  middleware.ts                       # protects /claims, /eval, /api/claims, /api/eval
  types/next-auth.d.ts                # module-augment Session/JWT with `role` and `memberId`
  ```
- **Route protection:**
  - `middleware.ts` redirects unauthenticated users to `/login` for any non-public route. Public: `/login`, `/api/auth/*`, static assets.
  - `/eval` and `/api/eval` are `OPS`-only. Enforce in both middleware and the route handler (defense in depth).
  - In `app/claims/[id]/page.tsx`, a `MEMBER` may only view their own claims; check `session.user.memberId` against the claim's `member_id` server-side. Never trust client checks.
- **Server-side access:** call `auth()` from `lib/auth/session.ts` in Server Components, Server Actions, and Route Handlers. Do not import the NextAuth client hooks in server code.
- **Client-side access:** wrap the app in `<SessionProvider>` in a thin client component mounted from `app/layout.tsx`; use `useSession()` only where genuinely needed (e.g., a header avatar). Prefer passing `session` down from a Server Component.
- **Forms:** the login screen uses shadcn `Form` + `react-hook-form` + a Zod schema in `lib/types.ts` (`LoginSchema`), and calls `signIn("credentials", { ... })`. Error states use shadcn `Alert`.
- **Env vars:** `AUTH_SECRET` (required, generate with `openssl rand -base64 32`), `AUTH_URL` for non-localhost deploys. Add both to `.env.example`.
- **Audit trail:** every claim record stores `submitted_by` (user id) and every ops action on a claim stores the acting ops user id. This data flows into the `DecisionTrace`.

## Evaluation weighting (informs trade-off calls)
| Area | Weight |
|---|---|
| System Design | 30% |
| Engineering Quality | 25% |
| Observability | 20% |
| AI Integration | 15% |
| Document Verification | 10% |

When two designs trade off, prioritize observability + clean separation over micro-optimizations.

## Deliverables checklist
1. Working app with UI for claim submission and decision review (deployed URL or local setup).
2. Architecture document — components, interactions, rejected alternatives, limitations, 10× scaling plan.
3. Component contracts (per significant component).
4. Eval report — all 12 test cases with decisions, traces, and pass/fail vs. expected.
5. Demo video (8–12 min): a document-problem stop, a clean end-to-end approval with trace, one proud decision and one regret.

## Assumptions policy
If stuck >2h on any item, make an assumption, document it (in the architecture doc or an `ASSUMPTIONS.md`), and move on. Document trade-offs explicitly — the judgment about what to cut is graded.
