import type {
  ClaimCategory,
  ClaimStatus,
  DocumentType,
  DocumentQuality,
  DecisionTrace,
} from "@/lib/types";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ─── Input / output types (no Prisma types leak past this file) ───────────────

export interface CreateClaimInput {
  memberId: string;
  policyId: string;
  claimCategory: ClaimCategory;
  treatmentDate: Date;
  claimedAmount: number;
  hospitalName?: string;
  submittedBy: string;
  status: ClaimStatus;
  approvedAmount?: number;
  decisionTrace: DecisionTrace;
  documents: CreateDocumentInput[];
}

export interface CreateDocumentInput {
  fileName: string;
  actualType: DocumentType;
  mimeType: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  uploadedBy: string;
  quality?: DocumentQuality;
  patientNameOnDoc?: string;
  extractedContent?: Record<string, unknown>;
  confidence?: Record<string, unknown>;
}

export interface ClaimRecord {
  id: string;
  memberId: string;
  policyId: string;
  claimCategory: ClaimCategory;
  treatmentDate: string;
  claimedAmount: number;
  hospitalName: string | null;
  submittedBy: string;
  status: ClaimStatus;
  approvedAmount: number | null;
  decisionTrace: DecisionTrace;
  documents: DocumentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  claimId: string;
  uploadedBy: string;
  fileName: string;
  actualType: DocumentType;
  mimeType: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  quality: DocumentQuality | null;
  patientNameOnDoc: string | null;
  extractedContent: Record<string, unknown> | null;
  confidence: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListClaimsFilter {
  status?: ClaimStatus;
  limit?: number;
  offset?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serialiseClaim(
  raw: Prisma.ClaimGetPayload<{ include: { documents: true } }>
): ClaimRecord {
  return {
    id: raw.id,
    memberId: raw.memberId,
    policyId: raw.policyId,
    claimCategory: raw.claimCategory as ClaimCategory,
    treatmentDate: raw.treatmentDate.toISOString(),
    claimedAmount: raw.claimedAmount.toNumber(),
    hospitalName: raw.hospitalName,
    submittedBy: raw.submittedBy,
    status: raw.status as ClaimStatus,
    approvedAmount: raw.approvedAmount != null ? raw.approvedAmount.toNumber() : null,
    decisionTrace: raw.decisionTrace as unknown as DecisionTrace,
    documents: raw.documents.map((d) => ({
      id: d.id,
      claimId: d.claimId,
      uploadedBy: d.uploadedBy,
      fileName: d.fileName,
      actualType: d.actualType as DocumentType,
      mimeType: d.mimeType,
      cloudinaryPublicId: d.cloudinaryPublicId,
      cloudinaryUrl: d.cloudinaryUrl,
      quality: (d.quality ?? null) as DocumentQuality | null,
      patientNameOnDoc: d.patientNameOnDoc,
      extractedContent: (d.extractedContent as Record<string, unknown>) ?? null,
      confidence: (d.confidence as Record<string, unknown>) ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  };
}

// ─── Repository functions ─────────────────────────────────────────────────────

export async function createClaim(input: CreateClaimInput): Promise<ClaimRecord> {
  const result = await prisma.$transaction(async (tx) => {
    return tx.claim.create({
      data: {
        memberId: input.memberId,
        policyId: input.policyId,
        claimCategory: input.claimCategory,
        treatmentDate: input.treatmentDate,
        claimedAmount: input.claimedAmount,
        hospitalName: input.hospitalName,
        submittedBy: input.submittedBy,
        status: input.status,
        approvedAmount: input.approvedAmount,
        decisionTrace: input.decisionTrace as unknown as Prisma.InputJsonValue,
        documents: {
          create: input.documents.map((d) => ({
            uploadedBy: d.uploadedBy,
            fileName: d.fileName,
            actualType: d.actualType,
            mimeType: d.mimeType,
            cloudinaryPublicId: d.cloudinaryPublicId,
            cloudinaryUrl: d.cloudinaryUrl,
            quality: d.quality,
            patientNameOnDoc: d.patientNameOnDoc,
            extractedContent: d.extractedContent as Prisma.InputJsonValue | undefined,
            confidence: d.confidence as Prisma.InputJsonValue | undefined,
          })),
        },
      },
      include: { documents: true },
    });
  });

  return serialiseClaim(result);
}

export async function getClaim(id: string): Promise<ClaimRecord | null> {
  const result = await prisma.claim.findUnique({
    where: { id },
    include: { documents: true },
  });
  return result ? serialiseClaim(result) : null;
}

export async function listByMember(
  memberId: string,
  filter: ListClaimsFilter = {}
): Promise<ClaimRecord[]> {
  const results = await prisma.claim.findMany({
    where: {
      memberId,
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: { documents: true },
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 50,
    skip: filter.offset ?? 0,
  });
  return results.map(serialiseClaim);
}

export async function listAll(filter: ListClaimsFilter = {}): Promise<ClaimRecord[]> {
  const results = await prisma.claim.findMany({
    where: filter.status ? { status: filter.status } : undefined,
    include: { documents: true },
    orderBy: { createdAt: "desc" },
    ...(filter.limit != null ? { take: filter.limit } : {}),
    skip: filter.offset ?? 0,
  });
  return results.map(serialiseClaim);
}
