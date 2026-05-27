import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/session";
import { getClaim } from "@/lib/storage/claimsRepo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const claim = await getClaim(id);

  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  // MEMBER can only see their own claims
  if (session.user.role === "MEMBER" && claim.memberId !== session.user.memberId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ claim });
}
