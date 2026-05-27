# Plum Claims — AI-Powered Health Insurance Processing

An end-to-end multi-agent pipeline that processes health insurance claims using Google Gemini. Upload documents → get a structured decision with full audit trail.

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local or remote)
- Google Gemini API key
- Cloudinary account (free tier is sufficient)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the project root:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/plum_claims"

# Google Gemini
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"

# Cloudinary (for document storage)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# NextAuth
AUTH_SECRET="any-random-32-char-string"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Initialise the Database

```bash
# Apply schema
npx prisma migrate deploy

# Seed demo users (12 members + 1 OPS admin)
npx prisma db seed
```

**Demo credentials after seeding:**

| Role | Username | Password |
|------|----------|----------|
| OPS Admin | `opsadmin` | `opspass123` |
| Member | `EMP001` | `password123` |
| Member | `EMP002` | `password123` |
| *(any member)* | `EMP001`–`EMP012` | `password123` |

### 4. Run the Development Server

```bash
npm run dev
```

App is available at **http://localhost:3000**

---

## Running Tests

```bash
npm test
```

Runs all unit tests and integration tests in a single pass:

```
Test Files  13 passed (13)
     Tests  137 passed (137)
  Duration  ~500ms
```

**No LLM calls are made during tests.** All four agents are mocked at the `vi.mock` boundary.

---

## Application Pages

| URL | Description | Who |
|-----|-------------|-----|
| `/` | Dashboard — stats overview + recent claims | All |
| `/claims` | Full claims list | All |
| `/claims/new` | Submit a new claim | All |
| `/claims/[id]` | Claim detail + full decision trace | All |
| `/eval` | Run all 12 test cases through the live pipeline | OPS only |
| `/login` | Sign in | Public |

---

## Project Structure

```
insurance-clain-automation/
│
├── app/                        # Next.js App Router
│   ├── (app)/                  # Authenticated shell (sidebar layout)
│   │   ├── page.tsx            # Dashboard
│   │   ├── claims/
│   │   │   ├── page.tsx        # Claims list
│   │   │   ├── new/page.tsx    # Submission form
│   │   │   └── [id]/page.tsx   # Claim detail
│   │   └── eval/page.tsx       # Eval harness (OPS)
│   ├── api/
│   │   ├── claims/route.ts     # REST: submit + list claims
│   │   ├── claims/[id]/route.ts # REST: get claim
│   │   └── eval/route.ts       # Run test cases
│   └── login/page.tsx
│
├── lib/
│   ├── agents/
│   │   ├── documentVerifier/   # Agent 1: verify document types + quality
│   │   ├── extractor/          # Agent 2: extract document content
│   │   ├── policyEvaluator/    # Agent 3: evaluate against policy rules
│   │   ├── fraudDetector/      # Agent 4: detect fraud signals
│   │   ├── runner.ts           # Generic agentic loop (≤6 turns)
│   │   └── types.ts            # Agent config types
│   ├── pipeline/
│   │   ├── orchestrator.ts     # Runs all 5 stages
│   │   ├── decisionComposer.ts # Deterministic final decision
│   │   └── trace.ts            # Confidence computation + trace builder
│   ├── policy/
│   │   └── loader.ts           # Typed accessors for policy_terms.json
│   ├── storage/
│   │   └── claimsRepo.ts       # Prisma DB operations
│   ├── auth/                   # NextAuth session helpers
│   └── types.ts                # All shared TypeScript types + Zod schemas
│
├── components/
│   ├── claim/                  # ClaimSubmissionForm, DecisionBanner, TraceViewer, ...
│   └── layout/                 # AppSidebar, AppHeader, SessionProviderWrapper
│
├── tests/
│   ├── unit/                   # Per-agent and per-tool unit tests (LLM mocked)
│   └── integration/
│       ├── orchestrator.test.ts          # Pipeline integration tests
│       └── runAllTestCases.test.ts       # All 12 test cases (Phase 7)
│
├── prisma/
│   ├── schema.prisma           # DB schema
│   └── seed.ts                 # Seed script
│
├── policy_terms.json           # Policy rules (single source of truth)
├── test_cases.json             # 12 test scenarios + expected outcomes
│
├── ARCHITECTURE.md             # System design + sequence diagrams
├── CONTRACTS.md                # Per-component input/output contracts
├── ASSUMPTIONS.md              # Trade-offs and cuts
└── EVAL_REPORT.md              # Test harness results (all 12 cases)
```

---

## How the Pipeline Works

1. **DocumentVerifier** — checks that the right document types are present, all are readable, and all belong to the same patient. Pipeline halts here with an actionable message if anything fails.

2. **Extractor + PolicyEvaluator + FraudDetector** — run concurrently (`Promise.allSettled`). Each is an LLM agent with deterministic tools. No agent restates financial amounts in free text — all amounts flow through tool returns.

3. **DecisionComposer** — deterministic function that combines all agent outputs into a final `PolicyDecision`. Handles fraud overrides, degraded components, and confidence penalties.

4. **Claim saved** — the full `DecisionTrace` (decision, financial breakdown, agent transcripts, tool call log) is saved to PostgreSQL as JSONB.

---

## Key Design Principles

- **No hardcoding** — all policy rules, limits, and member IDs live in `policy_terms.json`
- **Tools calculate, agents reason** — LLM is used for reasoning; deterministic TypeScript tools do all math
- **Graceful degradation** — if any agent throws, it is caught, recorded in `componentFailures[]`, and the pipeline continues to a valid decision
- **Full auditability** — every decision is reconstructible from its trace alone

---

## Further Reading

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Component diagram, sequence diagram, 10× scale plan |
| [CONTRACTS.md](./CONTRACTS.md) | Per-component interface: inputs, outputs, tools, error behaviour |
| [ASSUMPTIONS.md](./ASSUMPTIONS.md) | Every cut and trade-off made during development |
| [EVAL_REPORT.md](./EVAL_REPORT.md) | Results for all 12 test cases |
| [assignment.md](./assignment.md) | Original assignment brief |
