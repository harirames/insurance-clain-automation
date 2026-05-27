import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/session";
import { getClaim } from "@/lib/storage/claimsRepo";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClaimPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const claim = await getClaim(id);

  if (!claim) notFound();

  // MEMBER may only view their own claims
  if (session.user.role === "MEMBER" && claim.memberId !== session.user.memberId) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Claim {claim.id}</h1>
      {/* DecisionBanner + TraceViewer will be wired in Phase 6 */}
      <pre className="text-xs bg-muted rounded p-4 overflow-auto">
        {JSON.stringify(claim, null, 2)}
      </pre>
    </main>
  );
}
