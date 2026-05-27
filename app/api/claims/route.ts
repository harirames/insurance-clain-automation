import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";

import { auth } from "@/lib/auth/session";
import { uploadDocument, isAllowedMimeType } from "@/lib/storage/cloudinary";
import { listByMember, listAll, createClaim } from "@/lib/storage/claimsRepo";
import { ClaimCategorySchema } from "@/lib/types";
import { runPipeline } from "@/lib/pipeline/orchestrator";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();

  // Parse claim metadata
  const categoryParse = ClaimCategorySchema.safeParse(formData.get("claimCategory"));
  if (!categoryParse.success) {
    return NextResponse.json({ error: "Invalid claimCategory" }, { status: 400 });
  }

  const treatmentDate = formData.get("treatmentDate") as string;
  const claimedAmount = Number(formData.get("claimedAmount"));
  const hospitalName = (formData.get("hospitalName") as string) || undefined;
  const memberId =
    session.user.role === "MEMBER" ? session.user.memberId! : (formData.get("memberId") as string);

  if (!memberId) {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }

  // Upload documents to Cloudinary
  const claimId = createId();
  const files = formData.getAll("documents") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one document is required" }, { status: 400 });
  }

  const uploadedDocs: Array<{
    fileId: string;
    fileName: string;
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    mimeType: string;
  }> = [];

  for (const file of files) {
    if (!isAllowedMimeType(file.type)) {
      return NextResponse.json(
        { error: `File "${file.name}" has unsupported type "${file.type}". Allowed: JPEG, PNG, PDF.` },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadDocument(claimId, {
      name: file.name,
      bytes,
      mimeType: file.type,
    });

    uploadedDocs.push({
      fileId: createId(),
      fileName: file.name,
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryUrl: uploaded.url,
      mimeType: uploaded.mimeType,
    });
  }

  // Run the pipeline
  const submission = {
    memberId,
    policyId: "PLUM_GHI_2024",
    claimCategory: categoryParse.data,
    treatmentDate,
    claimedAmount,
    hospitalName,
    submittedBy: session.user.id ?? session.user.memberId ?? "unknown",
    documents: uploadedDocs.map((d) => ({
      fileId: d.fileId,
      fileName: d.fileName,
      cloudinaryPublicId: d.cloudinaryPublicId,
      cloudinaryUrl: d.cloudinaryUrl,
      mimeType: d.mimeType,
    })),
  };

  let trace;
  try {
    trace = await runPipeline(claimId, submission);
  } catch (err) {
    return NextResponse.json(
      { error: `Pipeline error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const finalStatus = trace.decision?.status ?? "MANUAL_REVIEW";
  const approvedAmount = trace.decision?.approvedAmount ?? undefined;
  const submittedBy = session.user.id ?? session.user.memberId ?? "unknown";

  const claim = await createClaim({
    memberId,
    policyId: "PLUM_GHI_2024",
    claimCategory: categoryParse.data,
    treatmentDate: new Date(treatmentDate),
    claimedAmount,
    hospitalName,
    submittedBy,
    status: finalStatus,
    approvedAmount,
    decisionTrace: trace,
    documents: uploadedDocs.map((d) => ({
      fileName: d.fileName,
      actualType: "PRESCRIPTION", // detected by verifier agent
      mimeType: d.mimeType,
      cloudinaryPublicId: d.cloudinaryPublicId,
      cloudinaryUrl: d.cloudinaryUrl,
      uploadedBy: submittedBy,
    })),
  });

  return NextResponse.json({ claimId: claim.id }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claims =
    session.user.role === "OPS"
      ? await listAll()
      : await listByMember(session.user.memberId!);

  return NextResponse.json({ claims });
}
