"use client";

import { useState } from "react";
import type { EvalResult, EvalStage } from "@/app/api/eval/route";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  FlaskConical,
  Play,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Minus,
} from "lucide-react";

export default function EvalPage() {
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function runEval() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/eval", { method: "POST" });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setResults(data.results);
      setRanAt(new Date().toLocaleTimeString("en-IN"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const passed = results?.filter((r) => r.passed).length ?? 0;
  const total = results?.length ?? 0;
  const allPassed = total > 0 && passed === total;

  return (
    <>
      <AppHeader
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Eval Harness" }]}
      />

      <div className="flex-1 p-6">
        <div className="space-y-6">
          {/* Run bar */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FlaskConical className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Eval Harness</p>
                <p className="text-xs text-muted-foreground">
                  Runs all 12 test cases through the live pipeline
                </p>
              </div>
            </div>
            <button
              id="run-eval"
              onClick={runEval}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run All Test Cases
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Summary */}
          {results && (
            <div className="rounded-xl border border-border bg-card shadow-sm p-5">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-4xl font-bold tabular-nums text-foreground">
                    {passed}
                    <span className="text-muted-foreground text-2xl">/{total}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Test cases passed</p>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${
                        allPassed
                          ? "bg-emerald-500"
                          : passed > total * 0.7
                          ? "bg-amber-400"
                          : "bg-destructive"
                      }`}
                      style={{ width: `${total > 0 ? (passed / total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {allPassed ? "✓ All tests passing" : `${total - passed} failing`}
                    {ranAt && <span className="ml-2">· Ran at {ranAt}</span>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!results && !loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <FlaskConical className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">Ready to evaluate</p>
              <p className="text-xs mt-1 opacity-70">
                Click &ldquo;Run All Test Cases&rdquo; to test all 12 scenarios end-to-end.
              </p>
            </div>
          )}

          {/* Results table */}
          {results && (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground font-medium">
                    <th className="px-4 py-3 w-24">Case ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3 w-32">Expected</th>
                    <th className="px-4 py-3 w-32">Actual</th>
                    <th className="px-4 py-3 w-28 text-right">Amount</th>
                    <th className="px-4 py-3 w-20 text-right">Conf.</th>
                    <th className="px-4 py-3 w-16 text-center">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r, i) => (
                    <EvalRow key={r.caseId} result={r} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EvalRow({ result: r, index }: { result: EvalResult; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-accent/40 transition-colors ${
          index % 2 === 0 ? "" : "bg-muted/20"
        }`}
        onClick={() => setOpen((o) => !o)}
        id={`eval-row-${r.caseId}`}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">{r.caseId}</span>
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-foreground text-xs">{r.caseName}</p>
          <p className="text-[10px] text-muted-foreground">{r.durationMs}ms</p>
        </td>
        <td className="px-4 py-3">
          <StatusChip status={r.expected} />
        </td>
        <td className="px-4 py-3">
          <StatusChip status={r.actual ?? "—"} />
        </td>
        <td className="px-4 py-3 text-right text-xs">
          {r.approvedAmount != null ? (
            <div>
              <span className="text-foreground font-medium">
                ₹{r.approvedAmount.toLocaleString("en-IN")}
              </span>
              {r.expectedAmount != null &&
                Math.abs(r.approvedAmount - r.expectedAmount) > 1 && (
                  <p className="text-[10px] text-destructive">
                    exp ₹{r.expectedAmount.toLocaleString("en-IN")}
                  </p>
                )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
          {Math.round(r.confidence.overall * 100)}%
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-center gap-1">
            {r.passed ? (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold dark:bg-emerald-900/40 dark:text-emerald-400">
                ✓
              </span>
            ) : (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xs font-bold">
                ✕
              </span>
            )}
            {open ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={7} className="px-0 py-0">
            <DetailPanel result={r} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailPanel({ result: r }: { result: EvalResult }) {
  return (
    <div
      className={`border-b px-5 py-4 space-y-4 text-xs ${
        r.passed
          ? "bg-emerald-50/40 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800/30"
          : "bg-destructive/5 border-destructive/20"
      }`}
    >
      {/* Description */}
      <p className="text-muted-foreground italic">{r.description}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          {/* Decision outcome */}
          <Section title="Decision">
            <div className="flex items-center gap-3">
              <div>
                <span className="text-muted-foreground mr-1">Expected:</span>
                <StatusChip status={r.expected} />
              </div>
              <span className="text-muted-foreground">→</span>
              <div>
                <span className="text-muted-foreground mr-1">Actual:</span>
                <StatusChip status={r.actual ?? "—"} />
              </div>
              {!r.passed && (
                <span className="ml-auto text-destructive font-semibold flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> FAIL
                </span>
              )}
              {r.passed && (
                <span className="ml-auto text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> PASS
                </span>
              )}
            </div>

            {/* Amount comparison */}
            {(r.approvedAmount != null || r.expectedAmount != null) && (
              <div className="mt-2 flex items-center gap-4">
                {r.expectedAmount != null && (
                  <span className="text-muted-foreground">
                    Expected amount: <strong>₹{r.expectedAmount.toLocaleString("en-IN")}</strong>
                  </span>
                )}
                {r.approvedAmount != null && (
                  <span
                    className={
                      r.expectedAmount != null &&
                      Math.abs(r.approvedAmount - r.expectedAmount) > 1
                        ? "text-destructive"
                        : "text-foreground"
                    }
                  >
                    Actual amount:{" "}
                    <strong>₹{r.approvedAmount.toLocaleString("en-IN")}</strong>
                  </span>
                )}
              </div>
            )}
          </Section>

          {/* Rationale */}
          {r.rationale && (
            <Section title="Rationale">
              <p className="text-foreground leading-relaxed">{r.rationale}</p>
            </Section>
          )}

          {/* Document problem (HALTED) */}
          {r.documentProblem && (
            <Section title="Document Problem">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-orange-700 dark:text-orange-400">
                    {r.documentProblem.type.replace(/_/g, " ")}
                  </p>
                  <p className="text-muted-foreground mt-0.5">{r.documentProblem.detail}</p>
                  {r.documentProblem.affectedFiles && r.documentProblem.affectedFiles.length > 0 && (
                    <p className="mt-1 text-muted-foreground">
                      Files: {r.documentProblem.affectedFiles.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Rejection reasons */}
          {r.rejectionReasons && r.rejectionReasons.length > 0 && (
            <Section title="Rejection Reasons">
              <ul className="space-y-1">
                {r.rejectionReasons.map((reason, i) => (
                  <li key={i} className="flex gap-2">
                    <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{reason}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* What system must do */}
          {r.expectedSystemMust && r.expectedSystemMust.length > 0 && (
            <Section title="System Requirements">
              <ul className="space-y-1">
                {r.expectedSystemMust.map((req, i) => (
                  <li key={i} className="flex gap-2 text-muted-foreground">
                    <Minus className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Notes */}
          {r.notes.length > 0 && (
            <Section title="Notes">
              {r.notes.map((note, i) => (
                <p key={i} className="text-amber-700 dark:text-amber-400">↳ {note}</p>
              ))}
            </Section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Financial breakdown */}
          {r.financials && (
            <Section title="Financial Breakdown">
              <table className="w-full">
                <tbody className="divide-y divide-border/50">
                  <FinRow label="Gross claimed" value={r.financials.gross} />
                  {r.financials.networkDiscountPercent > 0 && (
                    <FinRow
                      label={`Network discount (${r.financials.networkDiscountPercent}%)`}
                      value={-r.financials.networkDiscountAmount}
                      className="text-emerald-600"
                    />
                  )}
                  {r.financials.networkDiscountPercent > 0 && (
                    <FinRow label="After discount" value={r.financials.afterDiscount} className="font-medium" />
                  )}
                  {r.financials.copayPercent > 0 && (
                    <FinRow
                      label={`Co-pay (${r.financials.copayPercent}%)`}
                      value={-r.financials.copayAmount}
                      className="text-amber-600"
                    />
                  )}
                  <FinRow
                    label="Payable"
                    value={r.financials.payable}
                    className="font-semibold text-emerald-700 dark:text-emerald-400"
                    border
                  />
                </tbody>
              </table>
            </Section>
          )}

          {/* Line items */}
          {r.lineItems && r.lineItems.length > 0 && (
            <Section title="Line Items">
              <table className="w-full">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/50">
                    <th className="text-left pb-1 font-medium">Item</th>
                    <th className="text-right pb-1 font-medium">Amount</th>
                    <th className="text-right pb-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {r.lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2">
                        <p className="text-foreground">{li.description}</p>
                        {li.reason && <p className="text-[10px] text-muted-foreground">{li.reason}</p>}
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        ₹{li.amount.toLocaleString("en-IN")}
                      </td>
                      <td className="py-1 text-right">
                        <StatusChip status={li.status} small />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Confidence */}
          <Section title="Confidence">
            <div className="space-y-2">
              <ConfBar label="Overall" value={r.confidence.overall} />
              <ConfBar label="Documents" value={r.confidence.documents} />
              <ConfBar label="Fraud" value={r.confidence.fraud} />
            </div>
          </Section>

          {/* Pipeline stages */}
          {r.stages.length > 0 && (
            <Section title="Pipeline Stages">
              <div className="space-y-1">
                {r.stages.map((s) => (
                  <StageRow key={s.name} stage={s} />
                ))}
              </div>
            </Section>
          )}

          {/* Component failures */}
          {r.componentFailureDetails.length > 0 && (
            <Section title="Component Failures">
              {r.componentFailureDetails.map((f, i) => (
                <div key={i} className="rounded border border-destructive/20 bg-destructive/5 p-2 space-y-0.5">
                  <p className="font-medium text-destructive">{f.component}</p>
                  <p className="text-muted-foreground">{f.error}</p>
                  <p className="text-blue-600 dark:text-blue-400">↳ Fallback: {f.fallback}</p>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {title}
      </p>
      <div>{children}</div>
    </div>
  );
}

function FinRow({
  label,
  value,
  className = "",
  border = false,
}: {
  label: string;
  value: number;
  className?: string;
  border?: boolean;
}) {
  return (
    <tr className={border ? "border-t-2 border-border" : ""}>
      <td className="py-1 text-muted-foreground">{label}</td>
      <td className={`py-1 text-right tabular-nums ${className}`}>
        {value < 0 ? "−" : ""}₹{Math.abs(value).toLocaleString("en-IN")}
      </td>
    </tr>
  );
}

function ConfBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-destructive";
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StageRow({ stage }: { stage: EvalStage }) {
  const cfg: Record<string, { icon: React.ReactNode; cls: string }> = {
    PASS: {
      icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
      cls: "text-emerald-600",
    },
    FAIL: {
      icon: <XCircle className="h-3 w-3 text-destructive" />,
      cls: "text-destructive",
    },
    DEGRADED: {
      icon: <AlertTriangle className="h-3 w-3 text-amber-500" />,
      cls: "text-amber-600",
    },
    SKIPPED: {
      icon: <Minus className="h-3 w-3 text-muted-foreground" />,
      cls: "text-muted-foreground",
    },
  };
  const c = cfg[stage.status] ?? cfg.SKIPPED;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        {c.icon}
        <span className="text-foreground font-mono">{stage.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${c.cls}`}>{stage.status}</span>
        <span className="text-muted-foreground tabular-nums">{stage.durationMs}ms</span>
      </div>
    </div>
  );
}

function StatusChip({ status, small = false }: { status: string; small?: boolean }) {
  const cfg: Record<string, string> = {
    APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    PARTIAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    REJECTED: "bg-destructive/10 text-destructive",
    MANUAL_REVIEW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    HALTED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    COVERED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    EXCLUDED: "bg-destructive/10 text-destructive",
    ERROR: "bg-destructive/20 text-destructive font-semibold",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
        small ? "text-[9px]" : "text-[10px]"
      } ${cfg[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
