import { describe, it, expect } from "vitest";
import {
  ClaimCategorySchema,
  DocumentTypeSchema,
  ClaimStatusSchema,
  ClaimSubmissionSchema,
} from "@/lib/types";

describe("canonical types", () => {
  it("ClaimCategorySchema accepts valid values", () => {
    expect(() => ClaimCategorySchema.parse("CONSULTATION")).not.toThrow();
    expect(() => ClaimCategorySchema.parse("PHARMACY")).not.toThrow();
  });

  it("ClaimCategorySchema rejects unknown values", () => {
    expect(() => ClaimCategorySchema.parse("SURGERY")).toThrow();
  });

  it("DocumentTypeSchema covers all expected types", () => {
    const expected = ["PRESCRIPTION", "HOSPITAL_BILL", "LAB_REPORT", "PHARMACY_BILL"];
    expected.forEach((t) =>
      expect(() => DocumentTypeSchema.parse(t)).not.toThrow()
    );
  });

  it("ClaimStatusSchema includes HALTED", () => {
    expect(() => ClaimStatusSchema.parse("HALTED")).not.toThrow();
  });

  it("ClaimSubmissionSchema parses a minimal valid submission", () => {
    const result = ClaimSubmissionSchema.safeParse({
      memberId: "EMP001",
      policyId: "PLUM_GHI_2024",
      claimCategory: "CONSULTATION",
      treatmentDate: "2024-11-01",
      claimedAmount: 1500,
      submittedBy: "EMP001",
      documents: [
        {
          fileId: "F001",
          fileName: "prescription.jpg",
          actualType: "PRESCRIPTION",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
