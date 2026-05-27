import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma singleton before importing the repo
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockTx)),
    claim: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const mockTx = {
  claim: {
    create: vi.fn(),
  },
};

import { getClaim, listByMember } from "@/lib/storage/claimsRepo";
import { prisma } from "@/lib/db";

const mockClaim = {
  id: "clm_001",
  memberId: "EMP001",
  policyId: "PLUM_GHI_2024",
  claimCategory: "CONSULTATION",
  treatmentDate: new Date("2024-11-01"),
  claimedAmount: { toNumber: () => 1500 },
  hospitalName: null,
  submittedBy: "EMP001",
  status: "APPROVED",
  approvedAmount: { toNumber: () => 1350 },
  decisionTrace: {},
  documents: [
    {
      id: "doc_001",
      claimId: "clm_001",
      uploadedBy: "usr_emp001",
      fileName: "prescription.jpg",
      actualType: "PRESCRIPTION",
      mimeType: "image/jpeg",
      cloudinaryPublicId: "claims/clm_001/prescription",
      cloudinaryUrl: "https://res.cloudinary.com/example/image/upload/prescription.jpg",
      quality: null,
      patientNameOnDoc: null,
      extractedContent: null,
      confidence: null,
      createdAt: new Date("2024-11-01"),
    },
  ],
  createdAt: new Date("2024-11-01"),
  updatedAt: new Date("2024-11-01"),
};

describe("claimsRepo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getClaim returns null when not found", async () => {
    (prisma.claim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await getClaim("nonexistent");
    expect(result).toBeNull();
  });

  it("getClaim serialises Decimal to number", async () => {
    (prisma.claim.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockClaim,
      claimedAmount: { toNumber: () => 1500 },
      approvedAmount: { toNumber: () => 1350 },
    });
    const result = await getClaim("clm_001");
    expect(result?.claimedAmount).toBe(1500);
    expect(result?.approvedAmount).toBe(1350);
  });

  it("listByMember filters by memberId", async () => {
    (prisma.claim.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockClaim]);
    const results = await listByMember("EMP001");
    expect(prisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ memberId: "EMP001" }) })
    );
    expect(results).toHaveLength(1);
  });
});
