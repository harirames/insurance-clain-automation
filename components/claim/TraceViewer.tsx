"use client";

import { useState } from "react";
import type { DecisionTrace, TraceStage, ToolCall, ExtractedDocument } from "@/lib/types";

const STATUS_CHIP: Record<string, { bg: string; text: string }> = {
  PASS: { bg: "bg-emerald-100", text: "text-emerald-700" },
  FAIL: { bg: "bg-red-100", text: "text-red-700" },
  DEGRADED: { bg: "bg-orange-100", text: "text-orange-700" },
  SKIPPED: { bg: "bg-gray-100", text: "text-gray-500" },
};

interface Props {
  trace: DecisionTrace;
}

export function TraceViewer({ trace }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 text-base">Pipeline Trace</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <ConfidenceBar label="Docs" value={trace.confidence.documents} />
          <ConfidenceBar label="Fraud" value={trace.confidence.fraud} />
          <ConfidenceBar label="Overall" value={trace.confidence.overall} bold />
        </div>
      </div>

      {trace.componentFailures.length > 0 && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="text-xs font-semibold text-orange-800 mb-1">
            Component Failures ({trace.componentFailures.length})
          </p>
          {trace.componentFailures.map((f, i) => (
            <div key={i} className="text-xs text-orange-700 mt-1">
              <strong>{f.component}:</strong> {f.error}
              <span className="text-orange-500"> → {f.fallback}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {trace.stages.map((stage, i) => (
          <StageRow key={i} stage={stage} index={i} />
        ))}
      </div>
    </div>
  );
}

function ConfidenceBar({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1">
      <span className={bold ? "font-semibold text-gray-700" : ""}>{label}</span>
      <div className="w-12 h-1.5 rounded-full bg-gray-200">
        <div
          className={`h-1.5 rounded-full ${
            pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={bold ? "font-semibold text-gray-700" : ""}>{pct}%</span>
    </div>
  );
}

function StageRow({ stage, index }: { stage: TraceStage; index: number }) {
  const [open, setOpen] = useState(false);
  const chip = STATUS_CHIP[stage.status] ?? STATUS_CHIP.SKIPPED;
  const hasTranscript = !!stage.agentTranscript;
  const toolCalls = stage.agentTranscript?.toolCalls ?? [];

  const latencyMs = stage.agentTranscript?.latencyMs;

  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <button
        id={`stage-${index}-toggle`}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs text-gray-400 w-4">{index + 1}</span>
        <span className="font-medium text-sm text-gray-800 flex-1">{stage.name}</span>
        {latencyMs != null && (
          <span className="text-xs text-gray-400">{latencyMs}ms</span>
        )}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${chip.bg} ${chip.text}`}
        >
          {stage.status}
        </span>
        {hasTranscript && (
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && hasTranscript && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-400 mb-3">
            {stage.agentTranscript!.agentName} · {stage.agentTranscript!.model} ·{" "}
            {stage.agentTranscript!.turns} turns
            {stage.agentTranscript!.degraded && (
              <span className="ml-2 text-orange-500 font-medium">DEGRADED</span>
            )}
          </p>

          {/* Extractor: show extracted documents instead of tool calls */}
          {stage.name === "extractor" ? (
            <ExtractorResult stage={stage} />
          ) : (
            <div className="space-y-2">
              {toolCalls.map((tc, j) => (
                <ToolCallRow key={j} call={tc} callIndex={j} stageIndex={index} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExtractorResult({ stage }: { stage: TraceStage }) {
  const result = stage.result as { documents?: ExtractedDocument[] } | null;
  const docs = result?.documents ?? [];

  if (docs.length === 0) {
    return (
      <p className="text-xs text-orange-500 italic">
        No documents extracted — extractor may have degraded or received no input.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((doc, i) => (
        <ExtractedDocCard key={i} doc={doc} index={i} />
      ))}
    </div>
  );
}

function ExtractedDocCard({ doc, index }: { doc: ExtractedDocument; index: number }) {
  const [open, setOpen] = useState(false);

  const conf = (v: number | undefined) =>
    v != null ? `${Math.round(v * 100)}%` : null;

  const fieldColor = (v: number | undefined) => {
    if (v == null) return "text-gray-500";
    if (v >= 0.9) return "text-emerald-600";
    if (v >= 0.7) return "text-amber-600";
    return "text-red-500";
  };

  const fields: Array<{ label: string; value: unknown; confidence?: number }> = [
    { label: "Patient Name",    value: doc.patientName?.value,          confidence: doc.patientName?.confidence },
    { label: "Doctor Name",     value: doc.doctorName?.value,           confidence: doc.doctorName?.confidence },
    { label: "Registration No", value: doc.doctorRegistration?.value,   confidence: doc.doctorRegistration?.confidence },
    { label: "Hospital",        value: doc.hospitalName?.value,         confidence: doc.hospitalName?.confidence },
    { label: "Date",            value: doc.date?.value,                 confidence: doc.date?.confidence },
    { label: "Diagnosis",       value: doc.diagnosis?.value,            confidence: doc.diagnosis?.confidence },
    { label: "Treatment",       value: doc.treatment?.value,            confidence: doc.treatment?.confidence },
    { label: "Total Amount",    value: doc.totalAmount?.value != null ? `₹${Number(doc.totalAmount.value).toLocaleString("en-IN")}` : null, confidence: doc.totalAmount?.confidence },
  ].filter((f) => f.value != null && f.value !== "");

  const docConfPct = Math.round((doc.documentConfidence ?? 0) * 100);
  const docConfColor = docConfPct >= 80 ? "text-emerald-600" : docConfPct >= 50 ? "text-amber-600" : "text-red-500";

  return (
    <div className="rounded border border-gray-200 bg-white overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs text-gray-400 w-4">{index + 1}</span>
        <span className="font-mono text-xs font-medium text-gray-700 flex-1">
          {doc.documentType}
        </span>
        {doc.flags && doc.flags.length > 0 && (
          <div className="flex gap-1">
            {doc.flags.map((f) => (
              <span key={f} className="text-[10px] bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 font-medium">
                {f}
              </span>
            ))}
          </div>
        )}
        <span className={`text-xs font-semibold ${docConfColor}`}>
          {docConfPct}% conf
        </span>
        <svg
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-3">
          {/* Fields grid */}
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {fields.map((f) => (
                <div key={f.label}>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">{f.label}</p>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-xs font-medium text-gray-800">{String(f.value)}</p>
                    {f.confidence != null && (
                      <span className={`text-[10px] font-semibold ${fieldColor(f.confidence)}`}>
                        {conf(f.confidence)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Medicines */}
          {doc.medicines && doc.medicines.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Medicines</p>
              <div className="flex flex-wrap gap-1.5">
                {doc.medicines.map((m, i) => (
                  <span key={i} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tests ordered */}
          {doc.testsOrdered && doc.testsOrdered.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Tests Ordered</p>
              <div className="flex flex-wrap gap-1.5">
                {doc.testsOrdered.map((t, i) => (
                  <span key={i} className="text-[11px] bg-purple-50 text-purple-700 border border-purple-100 rounded px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Line items */}
          {doc.lineItems && doc.lineItems.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Line Items</p>
              <table className="w-full text-xs">
                <tbody>
                  {doc.lineItems.map((li, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-1 pr-3 text-gray-700">{li.description}</td>
                      <td className="py-1 text-right tabular-nums text-gray-800 font-medium">
                        ₹{Number(li.amount).toLocaleString("en-IN")}
                      </td>
                      <td className="py-1 pl-3 text-right">
                        <span className={`text-[10px] font-semibold ${fieldColor(li.confidence)}`}>
                          {conf(li.confidence)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({
  call,
  callIndex,
  stageIndex,
}: {
  call: ToolCall;
  callIndex: number;
  stageIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const isSubmit =
    call.toolName.startsWith("submit_") || call.toolName.startsWith("submit");

  return (
    <div className={`rounded border ${isSubmit ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"}`}>
      <button
        id={`stage-${stageIndex}-tool-${callIndex}`}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
            isSubmit ? "bg-blue-400" : "bg-gray-300"
          }`}
        />
        <span className="font-mono text-xs text-gray-700 flex-1">{call.toolName}</span>
        <span className="text-xs text-gray-400">{call.latencyMs}ms</span>
        <svg
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Args</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Result</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all leading-relaxed">
              {JSON.stringify(call.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
