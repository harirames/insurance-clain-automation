import { auth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { listByMember, listAll } from "@/lib/storage/claimsRepo";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
} from "lucide-react";

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

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;

  const claims =
    user.role === "OPS"
      ? await listAll()
      : await listByMember(user.memberId!, { limit: 50 });


  // Compute stats
  const approved = claims.filter(
    (c) => c.status === "APPROVED" || c.status === "PARTIAL",
  );
  const pending = claims.filter((c) => c.status === "MANUAL_REVIEW");
  const rejected = claims.filter(
    (c) => c.status === "REJECTED" || c.status === "HALTED",
  );
  const totalApproved = approved.reduce(
    (s, c) => s + (c.approvedAmount ?? 0),
    0,
  );

  const recent = claims.slice(0, 8);

  return (
    <>
      <AppHeader crumbs={[{ label: "Dashboard" }]} />

      <div className="flex-1 p-6 space-y-6">
        <div className="space-y-6">
          {/* Welcome + CTA */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {user.role === "OPS"
                  ? "Manage and review all member claims"
                  : "Track and submit your health insurance claims"}
              </p>
            </div>
            <a
              href="/claims/new"
              id="btn-new-claim"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors active:scale-95"
            >
              <Plus className="h-4 w-4" />
              New Claim
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<FileText className="h-4 w-4 text-primary" />}
              label="Total Claims"
              value={claims.length.toString()}
              bg="bg-primary/10"
            />
            <StatCard
              icon={<CheckCircle className="h-4 w-4 text-emerald-600" />}
              label="Approved"
              value={approved.length.toString()}
              sub={
                totalApproved > 0
                  ? `₹${totalApproved.toLocaleString("en-IN")}`
                  : undefined
              }
              bg="bg-emerald-50 dark:bg-emerald-900/20"
            />
            <StatCard
              icon={<Clock className="h-4 w-4 text-amber-600" />}
              label="Pending Review"
              value={pending.length.toString()}
              bg="bg-amber-50 dark:bg-amber-900/20"
            />
            <StatCard
              icon={<XCircle className="h-4 w-4 text-destructive" />}
              label="Rejected"
              value={rejected.length.toString()}
              bg="bg-destructive/10"
            />
          </div>

          {/* Recent claims */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Recent Claims
                </h2>
              </div>
              <a
                href="/claims"
                id="link-all-claims"
                className="text-xs text-primary hover:underline"
              >
                View all →
              </a>
            </div>

            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="h-8 w-8 mb-3 opacity-20" />
                <p className="text-sm">No claims yet</p>
                <a
                  href="/claims/new"
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Submit your first claim →
                </a>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recent.map((claim) => {
                  const statusCfg = STATUS_MAP[claim.status] ?? {
                    label: claim.status,
                    variant: "secondary" as const,
                  };
                  return (
                    <a
                      key={claim.id}
                      href={`/claims/${claim.id}`}
                      id={`claim-${claim.id}`}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-accent/40 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {claim.claimCategory.replace(/_/g, " ")}
                          </p>
                          {user.role === "OPS" && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {claim.memberId}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(claim.treatmentDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "numeric",
                              month: "short",
                            },
                          )}
                          {claim.hospitalName && ` · ${claim.hospitalName}`}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-foreground shrink-0">
                        ₹{claim.claimedAmount.toLocaleString("en-IN")}
                      </p>
                      <Badge
                        variant={statusCfg.variant}
                        className="text-xs shrink-0"
                      >
                        {statusCfg.label}
                      </Badge>
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

function StatCard({
  icon,
  label,
  value,
  sub,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4">
      <div
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${bg} mb-3`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && (
        <p className="text-xs text-emerald-600 font-medium mt-0.5">{sub}</p>
      )}
    </div>
  );
}
