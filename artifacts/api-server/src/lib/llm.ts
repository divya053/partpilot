import OpenAI from "openai";

/**
 * Provider-agnostic LLM client.
 *
 * The portal's AI features are designed to run on a *free* or *local* model, but
 * stay compatible with paid OpenAI too. Every supported provider speaks the
 * OpenAI-compatible **chat completions** API, so we only vary the base URL, key,
 * and model name via environment variables.
 *
 * Resolution order (first match wins):
 *   1. AI_BASE_URL set  → custom / local (Ollama, LM Studio, vLLM, …)
 *   2. GROQ_API_KEY set → Groq free API      (https://api.groq.com/openai/v1)
 *   3. OPENAI_API_KEY   → OpenAI
 *
 * Env vars:
 *   AI_BASE_URL   Override the OpenAI-compatible endpoint (e.g. http://localhost:11434/v1)
 *   AI_API_KEY    Key for the custom endpoint (local servers usually ignore it)
 *   AI_MODEL      Override the model name for any provider
 *   GROQ_API_KEY  Free Groq key (get one at https://console.groq.com/keys)
 *   OPENAI_API_KEY / OPENAI_MODEL  Classic OpenAI setup
 */

export type AiProvider = "groq" | "openai" | "custom" | "none";

export interface AiConfig {
  provider: AiProvider;
  baseURL?: string;
  apiKey: string;
  model: string;
}

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const LOCAL_DEFAULT_MODEL = "llama3.1";

function resolveConfig(): AiConfig {
  const modelOverride = process.env.AI_MODEL?.trim();

  // 1. Explicit custom / local endpoint.
  const baseURL = process.env.AI_BASE_URL?.trim();
  if (baseURL) {
    return {
      provider: "custom",
      baseURL,
      // Local servers (Ollama/LM Studio) accept any non-empty key.
      apiKey: process.env.AI_API_KEY?.trim() || "local-no-key-required",
      model: modelOverride || LOCAL_DEFAULT_MODEL,
    };
  }

  // 2. Groq free API.
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    return {
      provider: "groq",
      baseURL: GROQ_BASE_URL,
      apiKey: groqKey,
      model: modelOverride || GROQ_DEFAULT_MODEL,
    };
  }

  // 3. OpenAI.
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      model: modelOverride || process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL,
    };
  }

  return { provider: "none", apiKey: "", model: "" };
}

let cached: { client: OpenAI; config: AiConfig } | null = null;

export function getAiConfig(): AiConfig {
  return resolveConfig();
}

export function isAiConfigured(): boolean {
  return resolveConfig().provider !== "none";
}

/** Human-readable hint shown when AI features are requested but not configured. */
export const AI_SETUP_HINT =
  "AI is not configured. Add a free GROQ_API_KEY (https://console.groq.com/keys), " +
  "or point AI_BASE_URL at a local model, in artifacts/api-server/.env.";

function getClient(): { client: OpenAI; config: AiConfig } {
  const config = resolveConfig();
  if (config.provider === "none") {
    throw new Error(AI_SETUP_HINT);
  }

  if (cached && cached.config.baseURL === config.baseURL && cached.config.apiKey === config.apiKey) {
    return cached;
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });
  cached = { client, config };
  return cached;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Remove ```json fences some models wrap around structured output. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

/** Extract the first balanced JSON object/array from a noisy string. */
function extractJson(text: string): string {
  const cleaned = stripCodeFences(text);
  const firstBrace = cleaned.search(/[[{]/);
  if (firstBrace === -1) return cleaned;
  const open = cleaned[firstBrace];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = firstBrace; i < cleaned.length; i += 1) {
    if (cleaned[i] === open) depth += 1;
    else if (cleaned[i] === close) {
      depth -= 1;
      if (depth === 0) return cleaned.slice(firstBrace, i + 1);
    }
  }
  return cleaned.slice(firstBrace);
}

/** Free-form chat completion returning plain text. */
export async function chatText(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const { client, config } = getClient();
  const completion = await client.chat.completions.create({
    model: config.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 700,
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Chat completion constrained to a JSON object. Uses provider-native JSON mode
 * (`response_format: json_object`) which Groq and OpenAI both honor; falls back
 * to tolerant parsing for local models that ignore the flag. Returns the parsed
 * value — caller should validate the shape (e.g. with Zod).
 */
export async function chatJson<T = unknown>(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T> {
  const { client, config } = getClient();

  let raw = "";
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1200,
      response_format: { type: "json_object" },
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch {
    // Some models/endpoints reject response_format — retry without it.
    const completion = await client.chat.completions.create({
      model: config.model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1200,
    });
    raw = completion.choices[0]?.message?.content ?? "";
  }

  if (!raw.trim()) {
    throw new Error("AI returned an empty response.");
  }

  return JSON.parse(extractJson(raw)) as T;
}
