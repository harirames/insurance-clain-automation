import {
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Tool,
} from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

// Lazily initialised — avoids build-time errors when the env var is absent
let _client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!_client) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export const MODELS = {
  flash: "gemini-2.5-flash",
  pro: "gemini-2.5-pro",
} as const;

export type GeminiModel = (typeof MODELS)[keyof typeof MODELS];

// ─── Tool-use generation ──────────────────────────────────────────────────────

export type GenerateWithToolsParams = {
  model: GeminiModel;
  systemPrompt: string;
  history: Content[];
  tools: FunctionDeclaration[];
};

export async function generateWithTools(
  params: GenerateWithToolsParams
): Promise<GenerateContentResponse> {
  const ai = getClient();
  const toolDef: Tool = { functionDeclarations: params.tools };

  return ai.models.generateContent({
    model: params.model,
    config: {
      systemInstruction: params.systemPrompt,
      tools: [toolDef],
    },
    contents: params.history,
  });
}

// ─── Structured output generation (no tools) ─────────────────────────────────

export type GenerateStructuredParams = {
  model: GeminiModel;
  systemPrompt: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  // Optional inline file parts (images / PDFs for the extractor)
  inlineParts?: Array<{ mimeType: string; data: string }>;
  // Optional remote file URLs (Cloudinary URLs → Gemini fetches them)
  fileUrls?: Array<{ mimeType: string; url: string }>;
};

export async function generateStructured<T>(
  params: GenerateStructuredParams
): Promise<T> {
  const ai = getClient();

  // Build user content parts
  const userParts: Array<unknown> = [{ text: params.userPrompt }];
  for (const part of params.inlineParts ?? []) {
    userParts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
  }
  for (const f of params.fileUrls ?? []) {
    userParts.push({ fileData: { mimeType: f.mimeType, fileUri: f.url } });
  }

  const response = await ai.models.generateContent({
    model: params.model,
    config: {
      systemInstruction: params.systemPrompt,
      responseMimeType: "application/json",
      responseSchema: params.responseSchema,
    },
    contents: [{ role: "user", parts: userParts as Content["parts"] }],
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty structured response");
  return JSON.parse(text) as T;
}
