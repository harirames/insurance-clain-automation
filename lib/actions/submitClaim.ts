"use server";

import { createId } from "@paralleldrive/cuid2";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth/session";
import { uploadDocument, isAllowedMimeType } from "@/lib/storage/cloudinary";
import { createClaim } from "@/lib/storage/claimsRepo";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { ClaimCategorySchema } from "@/lib/types";

export interface SubmitClaimState {
  error?: string;
  claimId?: string;
}

export async function submitClaim(
  _prev: SubmitClaimState,
  formData: FormData
): Promise<SubmitClaimState> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized. Please log in." };

  // ── Parse metadata ────────────────────────────────────────────────────────
  const categoryParse = ClaimCategorySchema.safeParse(formData.get("claimCategory"));
  if (!categoryParse.success) return { error: "Invalid claim category." };

  const treatmentDate = formData.get("treatmentDate") as string;
  if (!treatmentDate) return { error: "Treatment date is required." };

  const claimedAmount = Number(formData.get("claimedAmount"));
  if (!claimedAmount || claimedAmount <= 0) return { error: "Claimed amount must be positive." };

  const hospitalName = (formData.get("hospitalName") as string) || undefined;

  const memberId =
    session.user.role === "MEMBER"
      ? session.user.memberId!
      : (formData.get("memberId") as string);

  if (!memberId) return { error: "Member ID is required." };

  // ── Upload documents ──────────────────────────────────────────────────────
  const files = formData.getAll("documents") as File[];
  if (files.length === 0) return { error: "At least one document is required." };

  const claimId = createId();
  const uploadedDocs: Array<{
    fileId: string;
    fileName: string;
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    mimeType: string;
  }> = [];

  for (const file of files) {
    if (!isAllowedMimeType(file.type)) {
      return {
        error: `File "${file.name}" type "${file.type}" is not allowed. Use JPEG, PNG, or PDF.`,
      };
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

  // ── Build ClaimSubmission and run pipeline ─────────────────────────────────
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
    return { error: `Pipeline error: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── Persist to DB ─────────────────────────────────────────────────────────
  const finalStatus = trace.decision?.status ?? "MANUAL_REVIEW";
  const approvedAmount = trace.decision?.approvedAmount ?? undefined;
  const submittedByUser = session.user.id ?? session.user.memberId ?? "unknown";

  const claim = await createClaim({
    memberId,
    policyId: "PLUM_GHI_2024",
    claimCategory: categoryParse.data,
    treatmentDate: new Date(treatmentDate),
    claimedAmount,
    hospitalName,
    submittedBy: submittedByUser,
    status: finalStatus,
    approvedAmount,
    decisionTrace: trace,
    documents: uploadedDocs.map((d) => ({
      fileName: d.fileName,
      actualType: "PRESCRIPTION", // will be detected by verifier
      mimeType: d.mimeType,
      cloudinaryPublicId: d.cloudinaryPublicId,
      cloudinaryUrl: d.cloudinaryUrl,
      uploadedBy: submittedByUser,
    })),
  });

  revalidatePath("/");
  redirect(`/claims/${claim.id}`);
}
