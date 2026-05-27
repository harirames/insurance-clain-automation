"use client";

import { useState } from "react";
import type { DecisionTrace, TraceStage, ToolCall } from "@/lib/types";

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

          <div className="space-y-2">
            {toolCalls.map((tc, j) => (
              <ToolCallRow key={j} call={tc} callIndex={j} stageIndex={index} />
            ))}
          </div>
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
