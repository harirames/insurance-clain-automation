import { z } from "zod";
import type { Content, FunctionDeclaration, Part } from "@google/genai";

import { generateWithTools, MODELS, type GeminiModel } from "@/lib/llm/gemini";
import type { AgentTranscript, ToolCall } from "@/lib/types";
import type {
  RunnerConfig,
  RunnerResult,
  ToolRegistry,
} from "@/lib/agents/types";

const DEFAULT_MAX_TURNS = 6;
const DEFAULT_MODEL: GeminiModel = MODELS.pro;

// Convert a ToolRegistry into Gemini FunctionDeclarations using Zod v4 built-in
function buildFunctionDeclarations(tools: ToolRegistry): FunctionDeclaration[] {
  return Object.values(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  }));
}

export async function runAgent<TOutput>(
  config: RunnerConfig<TOutput>,
): Promise<RunnerResult<TOutput>> {
  const {
    agentName,
    systemPrompt,
    userPrompt,
    tools,
    finalResponseSchema,
    finalToolName,
    maxTurns = DEFAULT_MAX_TURNS,
    model = DEFAULT_MODEL,
  } = config;

  const toolCalls: ToolCall[] = [];
  const history: Content[] = [{ role: "user", parts: [{ text: userPrompt }] }];
  const functionDeclarations = buildFunctionDeclarations(tools);
  const agentStart = Date.now();

  let turns = 0;
  let finalOutput: TOutput | null = null;

  try {
    while (turns < maxTurns) {
      turns++;

      const response = await generateWithTools({
        model: model as GeminiModel,
        systemPrompt,
        history,
        tools: functionDeclarations,
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content) {
        throw new Error(`No candidate content on turn ${turns}`);
      }

      // Append model turn to history
      history.push(candidate.content);

      // Collect all function call parts from this turn
      const fnCallParts = (candidate.content.parts ?? []).filter(
        (p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
          p.functionCall != null,
      );

      if (fnCallParts.length === 0) {
        // Model returned text instead of a tool call — unexpected but handled
        break;
      }

      // Execute each tool call and collect responses
      const responseParts: Part[] = [];

      for (const part of fnCallParts) {
        const { name, args } = part.functionCall;
        const toolStart = Date.now();

        if (!name) continue;

        // Check for the final-answer tool first
        if (name === finalToolName) {
          const parseResult = finalResponseSchema.safeParse(args);
          if (!parseResult.success) {
            throw new Error(
              `Final tool "${finalToolName}" args failed validation: ${parseResult.error.message}`,
            );
          }
          finalOutput = parseResult.data;
          toolCalls.push({
            toolName: name,
            args: args as Record<string, unknown>,
            result: finalOutput,
            latencyMs: Date.now() - toolStart,
          });
          // Signal loop exit
          responseParts.push({
            functionResponse: {
              name,
              response: { output: "accepted" },
            },
          });
          // Flush remaining parts as no-ops then exit
          break;
        }

        const tool = tools[name];
        if (!tool) {
          const errMsg = `Unknown tool: ${name}`;
          toolCalls.push({
            toolName: name,
            args: args as Record<string, unknown>,
            result: { error: errMsg },
            latencyMs: Date.now() - toolStart,
          });
          responseParts.push({
            functionResponse: { name, response: { error: errMsg } },
          });
          continue;
        }

        // Validate tool inputs
        const parseResult = tool.inputSchema.safeParse(args);
        if (!parseResult.success) {
          const errMsg = `Input validation failed: ${parseResult.error.message}`;
          toolCalls.push({
            toolName: name,
            args: args as Record<string, unknown>,
            result: { error: errMsg },
            latencyMs: Date.now() - toolStart,
          });
          responseParts.push({
            functionResponse: { name, response: { error: errMsg } },
          });
          continue;
        }

        // Run the deterministic tool
        let toolResult: unknown;
        try {
          toolResult = await tool.run(parseResult.data);
          // Validate output
          tool.outputSchema.parse(toolResult);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toolResult = { error: errMsg };
        }

        toolCalls.push({
          toolName: name,
          args: parseResult.data as Record<string, unknown>,
          result: toolResult,
          latencyMs: Date.now() - toolStart,
        });
        responseParts.push({
          functionResponse: {
            name,
            response: toolResult as Record<string, unknown>,
          },
        });
      }

      // Append tool responses to history
      if (responseParts.length > 0) {
        history.push({ role: "user", parts: responseParts });
      }

      // Exit if the final tool was called
      if (finalOutput !== null) break;
    }

    const transcript: AgentTranscript = {
      agentName,
      model,
      turns,
      toolCalls,
      finalOutput,
      latencyMs: Date.now() - agentStart,
      degraded: finalOutput === null,
    };

    if (finalOutput === null) {
      return {
        ok: false,
        error: `Agent "${agentName}" did not call "${finalToolName}" within ${maxTurns} turns`,
        transcript,
      };
    }

    return { ok: true, output: finalOutput, transcript };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const transcript: AgentTranscript = {
      agentName,
      model,
      turns,
      toolCalls,
      finalOutput: null,
      latencyMs: Date.now() - agentStart,
      degraded: true,
    };
    return { ok: false, error, transcript };
  }
}
