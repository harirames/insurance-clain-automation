import type { ClaimStatus, DocumentProblem, PolicyDecision } from "@/lib/types";

const STATUS_CONFIG: Record<
  ClaimStatus,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  APPROVED: {
    label: "Approved",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    icon: "✓",
  },
  PARTIAL: {
    label: "Partially Approved",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    icon: "◑",
  },
  REJECTED: {
    label: "Rejected",
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    icon: "✕",
  },
  MANUAL_REVIEW: {
    label: "Manual Review Required",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    icon: "⚑",
  },
  HALTED: {
    label: "Halted",
    bg: "bg-orange-50",
    text: "text-orange-800",
    border: "border-orange-200",
    icon: "⊘",
  },
};

interface Props {
  decision: PolicyDecision | null;
  documentProblem?: DocumentProblem | null;
}

export function DecisionBanner({ decision, documentProblem }: Props) {
  // Document verifier halted the pipeline
  if (!decision && documentProblem) {
    return (
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-6 mb-6">
        <div className="flex items-start gap-4">
          <span className="text-2xl">⊘</span>
          <div>
            <p className="font-semibold text-orange-800 text-lg">Submission Halted</p>
            <p className="text-orange-700 mt-1 text-sm">{documentProblem.message}</p>
            <div className="mt-3 space-y-1">
              {documentProblem.type === "WRONG_DOCUMENT_TYPE" && (
                <>
                  <p className="text-xs text-orange-600">
                    <strong>Uploaded:</strong> {documentProblem.uploadedTypes.join(", ")}
                  </p>
                  <p className="text-xs text-orange-600">
                    <strong>Required:</strong> {documentProblem.requiredTypes.join(", ")}
                  </p>
                </>
              )}
              {documentProblem.type === "UNREADABLE_DOCUMENT" && (
                <p className="text-xs text-orange-600">
                  <strong>Files to re-upload:</strong>{" "}
                  {documentProblem.documents.map((d) => d.fileName).join(", ")}
                </p>
              )}
              {documentProblem.type === "PATIENT_NAME_MISMATCH" && (
                <p className="text-xs text-orange-600">
                  <strong>Names found:</strong>{" "}
                  {[...new Set(documentProblem.names.map((n) => n.name))].join(" / ")}
                </p>
              )}
              {documentProblem.type === "MISSING_REQUIRED_DOC" && (
                <p className="text-xs text-orange-600">
                  <strong>Missing:</strong> {documentProblem.missingTypes.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!decision) return null;

  const cfg = STATUS_CONFIG[decision.status];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-6 mb-6`}>
      <div className="flex items-start gap-4">
        <span className="text-2xl">{cfg.icon}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className={`font-semibold text-lg ${cfg.text}`}>{cfg.label}</p>
            {decision.approvedAmount != null && (
              <p className={`text-2xl font-bold ${cfg.text}`}>
                ₹{decision.approvedAmount.toLocaleString("en-IN")}
              </p>
            )}
          </div>
          <p className={`mt-2 text-sm ${cfg.text} opacity-80`}>{decision.rationale}</p>

          {decision.rejectionReasons && decision.rejectionReasons.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {decision.rejectionReasons.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700"
                >
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Confidence</span>
            <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-current opacity-40"
                style={{ width: `${Math.round(decision.confidence * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {Math.round(decision.confidence * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
