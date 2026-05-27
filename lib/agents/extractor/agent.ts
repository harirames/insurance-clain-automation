import { z } from "zod";

import type { DocumentInput, ExtractedDocument, AgentTranscript } from "@/lib/types";
import { generateStructured, MODELS } from "@/lib/llm/gemini";
import { EXTRACTOR_SYSTEM, buildExtractorUserPrompt } from "@/lib/llm/prompts/extractor";
import {
  GeminiExtractionSchema,
  isValidDoctorRegistration,
  type GeminiExtraction,
} from "./schema";

// ─── Public output ─────────────────────────────────────────────────────────────

export interface ExtractionResult {
  documents: ExtractedDocument[];
  transcript: AgentTranscript;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runExtractor(docs: DocumentInput[]): Promise<ExtractionResult> {
  const start = Date.now();
  const extracted: ExtractedDocument[] = [];
  let anyDegraded = false;

  for (const doc of docs) {
    try {
      const result = await extractOne(doc);
      extracted.push(result);
    } catch (err) {
      anyDegraded = true;
      // Degrade gracefully — return empty ExtractedDocument with zero confidence
      extracted.push(emptyExtraction(doc.fileId, doc.actualType ?? "PRESCRIPTION"));
    }
  }

  const transcript: AgentTranscript = {
    agentName: "extractor",
    model: MODELS.flash,
    turns: docs.length,
    toolCalls: [],
    finalOutput: extracted,
    latencyMs: Date.now() - start,
    degraded: anyDegraded,
  };

  return { documents: extracted, transcript };
}

// ─── Single-document extraction ───────────────────────────────────────────────

async function extractOne(doc: DocumentInput): Promise<ExtractedDocument> {
  // Bypass mode: fixture already provides pre-extracted content
  if (doc.content) {
    return contentToExtractedDocument(doc.fileId, doc.actualType ?? "PRESCRIPTION", doc.content);
  }

  // LLM mode: call Gemini with the document URL or inline bytes
  if (!doc.cloudinaryUrl && !doc.mimeType) {
    // No content and no URL — degrade
    return emptyExtraction(doc.fileId, doc.actualType ?? "PRESCRIPTION");
  }

  const docType = doc.actualType ?? "PRESCRIPTION";
  const model = doc.quality === "POOR" ? MODELS.pro : MODELS.flash;

  const fileUrls = doc.cloudinaryUrl
    ? [{ mimeType: doc.mimeType ?? "image/jpeg", url: doc.cloudinaryUrl }]
    : undefined;

  const raw = await generateStructured<GeminiExtraction>({
    model,
    systemPrompt: EXTRACTOR_SYSTEM,
    userPrompt: buildExtractorUserPrompt(docType),
    responseSchema: z.toJSONSchema(GeminiExtractionSchema) as Record<string, unknown>,
    fileUrls,
  });

  const parsed = GeminiExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return emptyExtraction(doc.fileId, docType);
  }

  return geminiToExtractedDocument(doc.fileId, parsed.data);
}

// ─── Bypass mode: map raw content → ExtractedDocument ─────────────────────────

function contentToExtractedDocument(
  fileId: string,
  docType: string,
  content: Record<string, unknown>
): ExtractedDocument {
  const HIGH = 0.95;
  const flags: string[] = [];

  const reg = content.doctor_registration as string | undefined;
  if (reg && !isValidDoctorRegistration(reg)) {
    flags.push("INVALID_REGISTRATION");
  }

  const lineItems = (content.line_items as Array<{ description: string; amount: number }> | undefined)?.map(
    (li) => ({ description: li.description, amount: li.amount, confidence: HIGH })
  );

  const totalRaw = content.total ?? content.total_amount;

  return {
    fileId,
    documentType: docType as ExtractedDocument["documentType"],
    patientName: content.patient_name
      ? { value: content.patient_name as string, confidence: HIGH }
      : undefined,
    doctorName: content.doctor_name
      ? { value: content.doctor_name as string, confidence: HIGH }
      : undefined,
    doctorRegistration: reg
      ? { value: reg, confidence: flags.includes("INVALID_REGISTRATION") ? 0.5 : HIGH }
      : undefined,
    hospitalName: content.hospital_name
      ? { value: content.hospital_name as string, confidence: HIGH }
      : undefined,
    date: content.date
      ? { value: content.date as string, confidence: HIGH }
      : undefined,
    diagnosis: content.diagnosis
      ? { value: content.diagnosis as string, confidence: HIGH }
      : undefined,
    treatment: content.treatment
      ? { value: content.treatment as string, confidence: HIGH }
      : undefined,
    lineItems,
    totalAmount: totalRaw != null
      ? { value: totalRaw as number, confidence: HIGH }
      : undefined,
    medicines: content.medicines as string[] | undefined,
    testsOrdered: (content.tests_ordered ?? content.testsOrdered) as string[] | undefined,
    documentConfidence: HIGH,
    flags: flags.length > 0 ? flags : undefined,
    rawContent: content,
  };
}

// ─── LLM mode: map GeminiExtraction → ExtractedDocument ──────────────────────

function geminiToExtractedDocument(fileId: string, raw: GeminiExtraction): ExtractedDocument {
  const flags = [...(raw.flags ?? [])];

  if (raw.doctorRegistration?.value && !isValidDoctorRegistration(raw.doctorRegistration.value)) {
    if (!flags.includes("INVALID_REGISTRATION")) flags.push("INVALID_REGISTRATION");
  }

  return {
    fileId,
    documentType: raw.documentType,
    patientName: raw.patientName,
    doctorName: raw.doctorName,
    doctorRegistration: raw.doctorRegistration,
    hospitalName: raw.hospitalName,
    date: raw.date,
    diagnosis: raw.diagnosis,
    treatment: raw.treatment,
    lineItems: raw.lineItems,
    totalAmount: raw.totalAmount,
    medicines: raw.medicines,
    testsOrdered: raw.testsOrdered,
    documentConfidence: raw.documentConfidence,
    flags: flags.length > 0 ? flags : undefined,
  };
}

// ─── Empty / degraded extraction ──────────────────────────────────────────────

function emptyExtraction(fileId: string, docType: string): ExtractedDocument {
  return {
    fileId,
    documentType: docType as ExtractedDocument["documentType"],
    documentConfidence: 0,
    flags: ["EXTRACTION_FAILED"],
  };
}
