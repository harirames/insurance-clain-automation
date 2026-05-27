import { z } from "zod";
import { DocumentTypeSchema } from "@/lib/types";

// ─── Per-field confidence wrapper (mirrors FieldConfidenceSchema from types.ts) ─

const ConfidentString = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const ConfidentNumber = z.object({
  value: z.number().nullable(),
  confidence: z.number().min(0).max(1),
});

// ─── Gemini response schema (single schema for all document types) ─────────────
// Used both as the Zod validator and, via z.toJSONSchema(), as the Gemini
// responseSchema. Optional fields are omitted when not present in the document.

export const GeminiExtractionSchema = z.object({
  documentType: DocumentTypeSchema,
  patientName: ConfidentString.optional(),
  doctorName: ConfidentString.optional(),
  doctorRegistration: ConfidentString.optional(),
  specialization: ConfidentString.optional(),
  hospitalName: ConfidentString.optional(),
  date: ConfidentString.optional(),
  diagnosis: ConfidentString.optional(),
  treatment: ConfidentString.optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number(),
        confidence: z.number().min(0).max(1),
      })
    )
    .optional(),
  totalAmount: ConfidentNumber.optional(),
  medicines: z.array(z.string()).optional(),
  testsOrdered: z.array(z.string()).optional(),
  documentConfidence: z.number().min(0).max(1),
  flags: z.array(z.string()).optional(),
});

export type GeminiExtraction = z.infer<typeof GeminiExtractionSchema>;

// ─── Doctor registration number validator ─────────────────────────────────────
// Formats: KA/12345/2015, MH/12345/2015, ..., AYUR/KL/2345/2019

const REGISTRATION_RE = /^(?:AYUR\/[A-Z]{2}\/\d{3,6}\/\d{4}|[A-Z]{2}\/\d{3,6}\/\d{4})$/;

export function isValidDoctorRegistration(reg: string): boolean {
  return REGISTRATION_RE.test(reg.trim());
}
