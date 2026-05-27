import { z } from "zod";
import type { AgentTranscript } from "@/lib/types";

// ─── Tool definition ─────────────────────────────────────────────────────────

export type Tool<I = unknown, O = unknown> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  run: (input: I) => Promise<O>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolRegistry = Record<string, Tool<any, any>>;

// ─── Runner config ────────────────────────────────────────────────────────────

export type RunnerConfig<TOutput> = {
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolRegistry;
  finalResponseSchema: z.ZodType<TOutput>;
  /** Name of the tool the model must call to submit its final answer */
  finalToolName: string;
  maxTurns?: number;
  model?: string;
};

// ─── Runner result ────────────────────────────────────────────────────────────

export type RunnerSuccess<T> = {
  ok: true;
  output: T;
  transcript: AgentTranscript;
};

export type RunnerFailure = {
  ok: false;
  error: string;
  transcript: AgentTranscript;
};

export type RunnerResult<T> = RunnerSuccess<T> | RunnerFailure;
