import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/session";
import { getClaim } from "@/lib/storage/claimsRepo";
import { AppHeader } from "@/components/layout/AppHeader";
import { DecisionBanner } from "@/components/claim/DecisionBanner";
import { FinancialBreakdownCard } from "@/components/claim/FinancialBreakdownCard";
import { TraceViewer } from "@/components/claim/TraceViewer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClaimPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const claim = await getClaim(id);

  if (!claim) notFound();

  if (session.user.role === "MEMBER" && claim.memberId !== session.user.memberId) {
    notFound();
  }

  const trace = claim.decisionTrace;
  const decision = trace.decision ?? null;
  const documentProblem = (trace as { documentProblem?: unknown }).documentProblem as
    | import("@/lib/types").DocumentProblem
    | null
    | undefined;

  const shortId = claim.id.slice(0, 8).toUpperCase();

  return (
    <>
      <AppHeader
        crumbs={[
          { label: "Dashboard", href: "/" },
          { label: `Claim ${shortId}…` },
        ]}
        badge={claim.status.replace(/_/g, " ")}
      />

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* Decision Banner */}
          <DecisionBanner decision={decision} documentProblem={documentProblem} />

          {/* Financial Breakdown */}
          {decision?.financialBreakdown && (
            <FinancialBreakdownCard
              breakdown={decision.financialBreakdown}
              lineItems={decision.lineItemsDecision}
            />
          )}

          {/* Claim Metadata */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Claim Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <MetaField label="Member" value={claim.memberId} />
              <MetaField label="Category" value={claim.claimCategory.replace(/_/g, " ")} />
              <MetaField
                label="Treatment Date"
                value={new Date(claim.treatmentDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              />
              <MetaField
                label="Claimed"
                value={`₹${claim.claimedAmount.toLocaleString("en-IN")}`}
              />
              {claim.hospitalName && (
                <MetaField label="Hospital" value={claim.hospitalName} />
              )}
              {claim.approvedAmount != null && (
                <MetaField
                  label="Approved"
                  value={`₹${claim.approvedAmount.toLocaleString("en-IN")}`}
                  highlight
                />
              )}
            </div>
          </div>

          {/* Documents */}
          {claim.documents.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-sm p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Documents{" "}
                <span className="text-muted-foreground font-normal">
                  ({claim.documents.length})
                </span>
              </h3>
              <div className="space-y-2">
                {claim.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <svg
                        className="h-4 w-4 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">{doc.actualType}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {doc.mimeType.split("/")[1]?.toUpperCase() ?? "FILE"}
                    </Badge>
                    <a
                      href={doc.cloudinaryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      id={`doc-${doc.id}`}
                      className="text-xs font-medium text-primary hover:underline shrink-0"
                    >
                      View ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Pipeline Trace */}
          <TraceViewer trace={trace} />
        </div>
      </div>
    </>
  );
}

function MetaField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
      <p
        className={`text-sm font-medium ${
          highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
