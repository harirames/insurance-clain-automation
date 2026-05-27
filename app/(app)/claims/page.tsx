import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import { listByMember, listAll } from "@/lib/storage/claimsRepo";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus } from "lucide-react";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  APPROVED: { label: "Approved", variant: "default" },
  PARTIAL: { label: "Partial", variant: "secondary" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  MANUAL_REVIEW: { label: "Review", variant: "outline" },
  HALTED: { label: "Halted", variant: "destructive" },
};

export default async function ClaimsListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;

  const claims =
    user.role === "OPS"
      ? await listAll()
      : await listByMember(user.memberId!, { limit: 100 });

  return (
    <>
      <AppHeader crumbs={[{ label: "Claims" }]} />

      <div className="flex-1 p-6">
        <div className="">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {user.role === "OPS" ? "All Claims" : "My Claims"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {claims.length} claim{claims.length !== 1 ? "s" : ""}
              </p>
            </div>
            <a
              href="/claims/new"
              id="btn-new-claim"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Claim
            </a>
          </div>

          {/* Claims list */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {claims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <FileText className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No claims yet</p>
                <a
                  href="/claims/new"
                  className="mt-3 text-sm text-primary hover:underline"
                >
                  Submit your first claim →
                </a>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {claims.map((claim) => {
                  const statusCfg = STATUS_MAP[claim.status] ?? {
                    label: claim.status,
                    variant: "secondary" as const,
                  };
                  return (
                    <a
                      key={claim.id}
                      href={`/claims/${claim.id}`}
                      id={`claim-${claim.id}`}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-accent/40 transition-colors group"
                    >
                      {/* Icon */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground">
                            {claim.claimCategory.replace(/_/g, " ")}
                          </p>
                          {user.role === "OPS" && (
                            <span className="text-xs text-muted-foreground">
                              · {claim.memberId}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(claim.treatmentDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                          {claim.hospitalName && ` · ${claim.hospitalName}`}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">
                          ₹{claim.claimedAmount.toLocaleString("en-IN")}
                        </p>
                        {claim.approvedAmount != null && (
                          <p className="text-xs text-emerald-600">
                            ₹{claim.approvedAmount.toLocaleString("en-IN")}{" "}
                            approved
                          </p>
                        )}
                      </div>

                      {/* Status */}
                      <div className="shrink-0">
                        <Badge variant={statusCfg.variant} className="text-xs">
                          {statusCfg.label}
                        </Badge>
                      </div>

                      {/* Arrow */}
                      <svg
                        className="h-4 w-4 text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
