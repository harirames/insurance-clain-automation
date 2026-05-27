import { describe, it, expect } from "vitest";

import {
  lookupRequiredTypesForCategory,
  checkRequiredDocumentTypes,
  checkDocumentQuality,
  checkPatientNameConsistency,
} from "@/lib/agents/documentVerifier/tools";

describe("documentVerifier tools", () => {
  // ─── lookupRequiredTypesForCategory ─────────────────────────────────────────

  describe("lookupRequiredTypesForCategory", () => {
    it("returns PRESCRIPTION and HOSPITAL_BILL as required for CONSULTATION", async () => {
      const result = await lookupRequiredTypesForCategory.run({
        claimCategory: "CONSULTATION",
      });
      expect(result.required).toContain("PRESCRIPTION");
      expect(result.required).toContain("HOSPITAL_BILL");
    });

    it("returns PRESCRIPTION and PHARMACY_BILL as required for PHARMACY", async () => {
      const result = await lookupRequiredTypesForCategory.run({
        claimCategory: "PHARMACY",
      });
      expect(result.required).toContain("PRESCRIPTION");
      expect(result.required).toContain("PHARMACY_BILL");
    });

    it("returns PRESCRIPTION, LAB_REPORT, HOSPITAL_BILL as required for DIAGNOSTIC", async () => {
      const result = await lookupRequiredTypesForCategory.run({
        claimCategory: "DIAGNOSTIC",
      });
      expect(result.required).toContain("PRESCRIPTION");
      expect(result.required).toContain("LAB_REPORT");
      expect(result.required).toContain("HOSPITAL_BILL");
    });
  });

  // ─── checkRequiredDocumentTypes ─────────────────────────────────────────────

  describe("checkRequiredDocumentTypes", () => {
    it("TC001: detects missing HOSPITAL_BILL when two PRESCRIPTIONs uploaded for CONSULTATION", async () => {
      const result = await checkRequiredDocumentTypes.run({
        claimCategory: "CONSULTATION",
        uploadedTypes: ["PRESCRIPTION", "PRESCRIPTION"],
      });
      expect(result.missing).toContain("HOSPITAL_BILL");
      expect(result.missing).not.toContain("PRESCRIPTION");
    });

    it("returns empty arrays when all required types are present", async () => {
      const result = await checkRequiredDocumentTypes.run({
        claimCategory: "CONSULTATION",
        uploadedTypes: ["PRESCRIPTION", "HOSPITAL_BILL"],
      });
      expect(result.missing).toHaveLength(0);
      expect(result.extraNonOptional).toHaveLength(0);
    });

    it("detects extra non-optional types not allowed for the category", async () => {
      const result = await checkRequiredDocumentTypes.run({
        claimCategory: "CONSULTATION",
        uploadedTypes: ["PRESCRIPTION", "HOSPITAL_BILL", "PHARMACY_BILL"],
      });
      expect(result.extraNonOptional).toContain("PHARMACY_BILL");
    });

    it("allows optional types without flagging them as extra", async () => {
      const result = await checkRequiredDocumentTypes.run({
        claimCategory: "CONSULTATION",
        uploadedTypes: ["PRESCRIPTION", "HOSPITAL_BILL", "LAB_REPORT"],
      });
      expect(result.extraNonOptional).not.toContain("LAB_REPORT");
    });

    it("detects all missing types for DIAGNOSTIC", async () => {
      const result = await checkRequiredDocumentTypes.run({
        claimCategory: "DIAGNOSTIC",
        uploadedTypes: ["PRESCRIPTION"],
      });
      expect(result.missing).toContain("LAB_REPORT");
      expect(result.missing).toContain("HOSPITAL_BILL");
    });
  });

  // ─── checkDocumentQuality ────────────────────────────────────────────────────

  describe("checkDocumentQuality", () => {
    it("TC002: flags UNREADABLE documents by fileId and fileName", async () => {
      const result = await checkDocumentQuality.run({
        documents: [
          { fileId: "F003", fileName: "prescription.jpg", quality: "GOOD" },
          { fileId: "F004", fileName: "blurry_bill.jpg", quality: "UNREADABLE" },
        ],
      });
      expect(result.unreadable).toHaveLength(1);
      expect(result.unreadable[0].fileId).toBe("F004");
      expect(result.unreadable[0].fileName).toBe("blurry_bill.jpg");
    });

    it("returns empty unreadable when all documents are GOOD", async () => {
      const result = await checkDocumentQuality.run({
        documents: [
          { fileId: "F001", fileName: "prescription.jpg", quality: "GOOD" },
          { fileId: "F002", fileName: "bill.jpg", quality: "GOOD" },
        ],
      });
      expect(result.unreadable).toHaveLength(0);
    });

    it("POOR quality does not count as unreadable", async () => {
      const result = await checkDocumentQuality.run({
        documents: [{ fileId: "F001", fileName: "doc.jpg", quality: "POOR" }],
      });
      expect(result.unreadable).toHaveLength(0);
    });

    it("documents without quality field are not flagged", async () => {
      const result = await checkDocumentQuality.run({
        documents: [{ fileId: "F001", fileName: "doc.jpg" }],
      });
      expect(result.unreadable).toHaveLength(0);
    });

    it("flags multiple unreadable documents", async () => {
      const result = await checkDocumentQuality.run({
        documents: [
          { fileId: "F001", fileName: "a.jpg", quality: "UNREADABLE" },
          { fileId: "F002", fileName: "b.jpg", quality: "UNREADABLE" },
          { fileId: "F003", fileName: "c.jpg", quality: "GOOD" },
        ],
      });
      expect(result.unreadable).toHaveLength(2);
    });
  });

  // ─── checkPatientNameConsistency ─────────────────────────────────────────────

  describe("checkPatientNameConsistency", () => {
    it("TC003: returns matched: false and both names when documents belong to different patients", async () => {
      const result = await checkPatientNameConsistency.run({
        documents: [
          { fileId: "F005", patientNameOnDoc: "Rajesh Kumar" },
          { fileId: "F006", patientNameOnDoc: "Arjun Mehta" },
        ],
      });
      expect(result.matched).toBe(false);
      const names = result.distinctNames.map((n) => n.name);
      expect(names).toContain("Rajesh Kumar");
      expect(names).toContain("Arjun Mehta");
    });

    it("returns matched: true when all names are the same", async () => {
      const result = await checkPatientNameConsistency.run({
        documents: [
          { fileId: "F001", patientNameOnDoc: "Rajesh Kumar" },
          { fileId: "F002", patientNameOnDoc: "Rajesh Kumar" },
        ],
      });
      expect(result.matched).toBe(true);
    });

    it("returns matched: true when no documents carry patient names", async () => {
      const result = await checkPatientNameConsistency.run({
        documents: [{ fileId: "F001" }, { fileId: "F002" }],
      });
      expect(result.matched).toBe(true);
      expect(result.distinctNames).toHaveLength(0);
    });

    it("ignores documents without a patient name when checking consistency", async () => {
      const result = await checkPatientNameConsistency.run({
        documents: [
          { fileId: "F001", patientNameOnDoc: "Rajesh Kumar" },
          { fileId: "F002" }, // no name
          { fileId: "F003", patientNameOnDoc: "Rajesh Kumar" },
        ],
      });
      expect(result.matched).toBe(true);
    });

    it("distinctNames includes fileId for each named document", async () => {
      const result = await checkPatientNameConsistency.run({
        documents: [
          { fileId: "F005", patientNameOnDoc: "Rajesh Kumar" },
          { fileId: "F006", patientNameOnDoc: "Arjun Mehta" },
        ],
      });
      const byFileId = Object.fromEntries(result.distinctNames.map((n) => [n.fileId, n.name]));
      expect(byFileId["F005"]).toBe("Rajesh Kumar");
      expect(byFileId["F006"]).toBe("Arjun Mehta");
    });
  });
});
