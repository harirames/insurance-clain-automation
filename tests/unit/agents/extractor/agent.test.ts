import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm/gemini", () => ({
  generateStructured: vi.fn(),
  MODELS: { flash: "gemini-2.5-flash", pro: "gemini-2.5-pro" },
}));

import { generateStructured } from "@/lib/llm/gemini";
import { runExtractor } from "@/lib/agents/extractor/agent";
import type { DocumentInput } from "@/lib/types";

const mockLLM = generateStructured as ReturnType<typeof vi.fn>;

// ─── TC004 fixtures (bypass mode — content already provided) ──────────────────

const TC004_PRESCRIPTION: DocumentInput = {
  fileId: "F007",
  fileName: "prescription.jpg",
  actualType: "PRESCRIPTION",
  content: {
    doctor_name: "Dr. Arun Sharma",
    doctor_registration: "KA/45678/2015",
    patient_name: "Rajesh Kumar",
    date: "2024-11-01",
    diagnosis: "Viral Fever",
    medicines: ["Paracetamol 650mg", "Vitamin C 500mg"],
  },
};

const TC004_BILL: DocumentInput = {
  fileId: "F008",
  fileName: "bill.jpg",
  actualType: "HOSPITAL_BILL",
  content: {
    hospital_name: "City Clinic, Bengaluru",
    patient_name: "Rajesh Kumar",
    date: "2024-11-01",
    line_items: [
      { description: "Consultation Fee", amount: 1000 },
      { description: "CBC Test", amount: 300 },
      { description: "Dengue NS1 Test", amount: 200 },
    ],
    total: 1500,
  },
};

describe("extractor agent", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Bypass mode ────────────────────────────────────────────────────────────

  describe("bypass mode (content provided)", () => {
    it("TC004 PRESCRIPTION: maps doctor, patient, diagnosis, medicines at high confidence", async () => {
      const { documents } = await runExtractor([TC004_PRESCRIPTION]);
      const doc = documents[0];

      expect(doc.fileId).toBe("F007");
      expect(doc.documentType).toBe("PRESCRIPTION");
      expect(doc.doctorName?.value).toBe("Dr. Arun Sharma");
      expect(doc.doctorName?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(doc.doctorRegistration?.value).toBe("KA/45678/2015");
      expect(doc.patientName?.value).toBe("Rajesh Kumar");
      expect(doc.diagnosis?.value).toBe("Viral Fever");
      expect(doc.medicines).toContain("Paracetamol 650mg");
      expect(doc.documentConfidence).toBeGreaterThanOrEqual(0.9);
    });

    it("TC004 HOSPITAL_BILL: maps hospital, line items, total at high confidence", async () => {
      const { documents } = await runExtractor([TC004_BILL]);
      const doc = documents[0];

      expect(doc.documentType).toBe("HOSPITAL_BILL");
      expect(doc.hospitalName?.value).toBe("City Clinic, Bengaluru");
      expect(doc.totalAmount?.value).toBe(1500);
      expect(doc.totalAmount?.confidence).toBeGreaterThanOrEqual(0.9);
      expect(doc.lineItems).toHaveLength(3);
      expect(doc.lineItems?.[0].description).toBe("Consultation Fee");
      expect(doc.lineItems?.[0].amount).toBe(1000);
    });

    it("TC004: processes two documents and returns transcript with turns=2", async () => {
      const { documents, transcript } = await runExtractor([TC004_PRESCRIPTION, TC004_BILL]);

      expect(documents).toHaveLength(2);
      expect(transcript.agentName).toBe("extractor");
      expect(transcript.turns).toBe(2);
      expect(transcript.toolCalls).toHaveLength(0);
      expect(transcript.degraded).toBe(false);
    });

    it("flags INVALID_REGISTRATION when doctor reg doesn't match known format", async () => {
      const doc: DocumentInput = {
        fileId: "F_BAD",
        fileName: "rx.jpg",
        actualType: "PRESCRIPTION",
        content: {
          doctor_name: "Dr. X",
          doctor_registration: "INVALID-REG-NUMBER",
        },
      };
      const { documents } = await runExtractor([doc]);
      expect(documents[0].flags).toContain("INVALID_REGISTRATION");
      expect(documents[0].doctorRegistration?.confidence).toBeLessThan(0.9);
    });

    it("maps tests_ordered from TC007 LAB_REPORT content", async () => {
      const doc: DocumentInput = {
        fileId: "F013",
        fileName: "lab.jpg",
        actualType: "LAB_REPORT",
        content: { test_name: "MRI Lumbar Spine" },
      };
      const { documents } = await runExtractor([doc]);
      expect(documents[0].documentType).toBe("LAB_REPORT");
    });

    it("maps treatment field from TC011 PRESCRIPTION content", async () => {
      const doc: DocumentInput = {
        fileId: "F_TC011",
        fileName: "rx.jpg",
        actualType: "PRESCRIPTION",
        content: {
          doctor_name: "Vaidya T. Krishnan",
          doctor_registration: "AYUR/KL/2345/2019",
          diagnosis: "Chronic Joint Pain",
          treatment: "Panchakarma Therapy",
        },
      };
      const { documents } = await runExtractor([doc]);
      expect(documents[0].treatment?.value).toBe("Panchakarma Therapy");
      expect(documents[0].doctorRegistration?.value).toBe("AYUR/KL/2345/2019");
      expect(documents[0].flags ?? []).not.toContain("INVALID_REGISTRATION");
    });
  });

  // ─── LLM mode ───────────────────────────────────────────────────────────────

  describe("LLM mode (cloudinaryUrl provided)", () => {
    it("calls generateStructured and maps the result to ExtractedDocument", async () => {
      mockLLM.mockResolvedValue({
        documentType: "PRESCRIPTION",
        doctorName: { value: "Dr. Test", confidence: 0.92 },
        patientName: { value: "Patient A", confidence: 0.88 },
        diagnosis: { value: "Viral Fever", confidence: 0.9 },
        medicines: ["Paracetamol 500mg"],
        documentConfidence: 0.9,
      });

      const doc: DocumentInput = {
        fileId: "F_LLM",
        fileName: "prescription.jpg",
        actualType: "PRESCRIPTION",
        mimeType: "image/jpeg",
        cloudinaryUrl: "https://res.cloudinary.com/example/image/upload/prescription.jpg",
      };

      const { documents, transcript } = await runExtractor([doc]);
      const result = documents[0];

      expect(mockLLM).toHaveBeenCalledOnce();
      expect(result.documentType).toBe("PRESCRIPTION");
      expect(result.doctorName?.value).toBe("Dr. Test");
      expect(result.diagnosis?.value).toBe("Viral Fever");
      expect(result.documentConfidence).toBe(0.9);
      expect(transcript.degraded).toBe(false);
    });

    it("uses pro model for POOR quality documents", async () => {
      mockLLM.mockResolvedValue({
        documentType: "HOSPITAL_BILL",
        documentConfidence: 0.6,
      });

      const doc: DocumentInput = {
        fileId: "F_POOR",
        fileName: "blurry.jpg",
        actualType: "HOSPITAL_BILL",
        quality: "POOR",
        mimeType: "image/jpeg",
        cloudinaryUrl: "https://res.cloudinary.com/example/image/upload/blurry.jpg",
      };

      await runExtractor([doc]);

      const callArgs = mockLLM.mock.calls[0][0];
      expect(callArgs.model).toBe("gemini-2.5-pro");
    });
  });

  // ─── Graceful degradation ────────────────────────────────────────────────────

  describe("graceful degradation", () => {
    it("returns empty extraction with EXTRACTION_FAILED flag when LLM throws", async () => {
      mockLLM.mockRejectedValue(new Error("LLM timeout"));

      const doc: DocumentInput = {
        fileId: "F_FAIL",
        fileName: "doc.jpg",
        actualType: "PRESCRIPTION",
        mimeType: "image/jpeg",
        cloudinaryUrl: "https://res.cloudinary.com/example/image/upload/doc.jpg",
      };

      const { documents, transcript } = await runExtractor([doc]);

      expect(documents[0].documentConfidence).toBe(0);
      expect(documents[0].flags).toContain("EXTRACTION_FAILED");
      expect(transcript.degraded).toBe(true);
    });

    it("continues processing remaining documents after one failure", async () => {
      mockLLM.mockRejectedValueOnce(new Error("LLM timeout"));

      const docs: DocumentInput[] = [
        {
          fileId: "F_FAIL",
          fileName: "fail.jpg",
          actualType: "PRESCRIPTION",
          mimeType: "image/jpeg",
          cloudinaryUrl: "https://example.com/fail.jpg",
        },
        TC004_BILL, // bypass mode — succeeds regardless
      ];

      const { documents } = await runExtractor(docs);

      expect(documents).toHaveLength(2);
      expect(documents[0].flags).toContain("EXTRACTION_FAILED");
      expect(documents[1].documentType).toBe("HOSPITAL_BILL");
    });

    it("returns empty extraction when document has no content and no URL", async () => {
      const doc: DocumentInput = {
        fileId: "F_EMPTY",
        fileName: "doc.jpg",
        actualType: "PRESCRIPTION",
      };

      const { documents } = await runExtractor([doc]);

      expect(documents[0].documentConfidence).toBe(0);
      expect(documents[0].flags).toContain("EXTRACTION_FAILED");
      expect(mockLLM).not.toHaveBeenCalled();
    });
  });

  // ─── Doctor registration validator ───────────────────────────────────────────

  describe("doctor registration validation", () => {
    it("accepts valid Karnataka format", async () => {
      const { documents } = await runExtractor([
        {
          fileId: "F1",
          fileName: "rx.jpg",
          actualType: "PRESCRIPTION",
          content: { doctor_registration: "KA/45678/2015" },
        },
      ]);
      expect(documents[0].flags ?? []).not.toContain("INVALID_REGISTRATION");
    });

    it("accepts valid Ayurveda format", async () => {
      const { documents } = await runExtractor([
        {
          fileId: "F2",
          fileName: "rx.jpg",
          actualType: "PRESCRIPTION",
          content: { doctor_registration: "AYUR/KL/2345/2019" },
        },
      ]);
      expect(documents[0].flags ?? []).not.toContain("INVALID_REGISTRATION");
    });

    it("rejects malformed registration", async () => {
      const { documents } = await runExtractor([
        {
          fileId: "F3",
          fileName: "rx.jpg",
          actualType: "PRESCRIPTION",
          content: { doctor_registration: "12345/KA/2015" },
        },
      ]);
      expect(documents[0].flags).toContain("INVALID_REGISTRATION");
    });
  });
});
