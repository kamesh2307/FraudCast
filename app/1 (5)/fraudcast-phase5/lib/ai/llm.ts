// FraudCast – minimal client for OpenAI or Azure OpenAI using plain fetch (no extra library).
// Server-side only. Every call has a timeout; every failure becomes an LlmError so callers can fall back.

import { aiConfig, aiStatus, type AiConfig } from "./config";

export class LlmError extends Error {
  constructor(message: string, public kind: "disabled" | "timeout" | "http" | "parse" | "dimension") {
    super(message);
  }
}

export type ChatResult = { json: unknown; model: string; latencyMs: number };
export type ChatFn = (system: string, user: string) => Promise<ChatResult>;

function endpoint(cfg: AiConfig, kind: "chat" | "embed"): { url: string; headers: Record<string, string> } {
  if (cfg.provider === "azure") {
    const dep = kind === "chat" ? cfg.chatModel : cfg.embeddingModel;
    const path = kind === "chat" ? "chat/completions" : "embeddings";
    return {
      url: `${cfg.azureEndpoint}/openai/deployments/${encodeURIComponent(dep)}/${path}?api-version=${cfg.azureApiVersion}`,
      headers: { "api-key": cfg.apiKey ?? "", "Content-Type": "application/json" },
    };
  }
  return {
    url: `${cfg.baseUrl}/${kind === "chat" ? "chat/completions" : "embeddings"}`,
    headers: { Authorization: `Bearer ${cfg.apiKey ?? ""}`, "Content-Type": "application/json" },
  };
}

async function post(cfg: AiConfig, kind: "chat" | "embed", body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { url, headers } = endpoint(cfg, kind);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new LlmError(`AI service returned ${res.status}: ${text.slice(0, 300)}`, "http");
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new LlmError("AI service returned a response that is not JSON.", "parse");
    }
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if ((e as { name?: string }).name === "AbortError") throw new LlmError(`AI call timed out after ${cfg.timeoutMs} ms.`, "timeout");
    throw new LlmError(`AI call failed: ${(e as Error).message}`, "http");
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    throw new LlmError("The AI did not return valid JSON.", "parse");
  }
}

/** Ask the chat model for a JSON object. Low temperature (PRD GA-02); retries without it for models that reject it. */
export const chatJSON: ChatFn = async (system, user) => {
  const cfg = aiConfig();
  const status = aiStatus(cfg);
  if (!status.ready) throw new LlmError(status.reason, "disabled");
  const started = Date.now();
  const body: Record<string, unknown> = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  };
  if (cfg.provider === "openai") body.model = cfg.chatModel;

  let data: Record<string, unknown>;
  try {
    data = await post(cfg, "chat", body);
  } catch (e) {
    if (e instanceof LlmError && e.kind === "http" && /temperature/i.test(e.message)) {
      delete body.temperature;
      data = await post(cfg, "chat", body);
    } else throw e;
  }
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new LlmError("The AI returned an empty answer.", "parse");
  return { json: parseJsonContent(content), model: String(data.model ?? cfg.chatModel), latencyMs: Date.now() - started };
};

export const EMBEDDING_DIMENSIONS = 1536; // must match vector(1536) in schema.sql

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

/** Embed a batch of texts. Always returns 1536-dimension vectors or throws. */
export const embed: EmbedFn = async (texts) => {
  const cfg = aiConfig();
  const status = aiStatus(cfg);
  if (!status.ready) throw new LlmError(status.reason, "disabled");
  const body: Record<string, unknown> = { input: texts };
  if (cfg.provider === "openai") body.model = cfg.embeddingModel;
  if (/text-embedding-3/i.test(cfg.embeddingModel)) body.dimensions = EMBEDDING_DIMENSIONS;
  const data = await post(cfg, "embed", body);
  const rows = (data.data as { index: number; embedding: number[] }[] | undefined) ?? [];
  if (rows.length !== texts.length) throw new LlmError("The embedding service returned the wrong number of vectors.", "parse");
  const vectors = [...rows].sort((a, b) => a.index - b.index).map((r) => r.embedding);
  if (vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS)) {
    throw new LlmError(`Embeddings must have ${EMBEDDING_DIMENSIONS} dimensions. Use text-embedding-3-small (or ada-002).`, "dimension");
  }
  return vectors;
};
