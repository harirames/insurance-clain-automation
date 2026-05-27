import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/session";
import { getPolicy } from "@/lib/policy/loader";
import { AppHeader } from "@/components/layout/AppHeader";
import { ClaimSubmissionForm } from "@/components/claim/ClaimSubmissionForm";
import { FileUp } from "lucide-react";

export default async function NewClaimPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user;
  const policy = getPolicy();
  const memberIds = policy.members.map((m) => m.member_id);

  return (
    <>
      <AppHeader
        crumbs={[{ label: "Claims", href: "/claims" }, { label: "New Claim" }]}
      />

      <div className="flex-1 p-6">
        <div className="">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <FileUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-foreground">
                  Submit a Claim
                </h1>
                <p className="text-xs text-muted-foreground">
                  Upload your documents and we&apos;ll process your claim
                  automatically
                </p>
              </div>
            </div>

            <div className="p-6">
              <ClaimSubmissionForm
                userRole={user.role}
                memberId={user.memberId}
                memberIds={memberIds}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
