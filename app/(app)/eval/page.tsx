"use client";

import { useState } from "react";
import type { EvalResult } from "@/app/api/eval/route";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Play, ChevronDown, ChevronUp } from "lucide-react";

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
                <p className="text-sm font-semibold text-foreground">
                  Eval Harness
                </p>
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
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
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
                    <span className="text-muted-foreground text-2xl">
                      /{total}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Test cases passed
                  </p>
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
                      style={{
                        width: `${total > 0 ? (passed / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {allPassed
                      ? "✓ All tests passing"
                      : `${total - passed} failing`}
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
                Click &ldquo;Run All Test Cases&rdquo; to test all 12 scenarios
                end-to-end.
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
  const hasNotes =
    r.notes.length > 0 || (r.rejectionReasons && r.rejectionReasons.length > 0);

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-accent/40 transition-colors ${
          index % 2 === 0 ? "" : "bg-muted/20"
        }`}
        onClick={() => hasNotes && setOpen((o) => !o)}
        id={`eval-row-${r.caseId}`}
      >
        <td className="px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">
            {r.caseId}
          </span>
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
          {Math.round(r.confidence * 100)}%
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
            {hasNotes &&
              (open ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ))}
          </div>
        </td>
      </tr>
      {open && hasNotes && (
        <tr className="bg-amber-50/50 dark:bg-amber-900/10">
          <td colSpan={7} className="px-4 py-2.5 border-b border-amber-200/40">
            {r.notes.map((note, j) => (
              <p key={j} className="text-xs text-amber-700 dark:text-amber-400">
                ↳ {note}
              </p>
            ))}
            {r.rejectionReasons && r.rejectionReasons.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Rejection reasons: {r.rejectionReasons.join(", ")}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    APPROVED:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    PARTIAL:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    REJECTED: "bg-destructive/10 text-destructive",
    MANUAL_REVIEW:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    HALTED:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    ERROR: "bg-destructive/20 text-destructive font-semibold",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        cfg[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
