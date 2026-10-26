// FraudCast – AI settings, read from environment variables (.env.local and Vercel).
// LLM_ENABLED is the kill switch (PRD SF-07): anything other than "true" = template mode, no AI calls.

export type AiConfig = {
  enabled: boolean;
  provider: "openai" | "azure";
  apiKey: string | undefined;
  chatModel: string; // OpenAI model name, or Azure chat deployment name
  embeddingModel: string; // OpenAI model name, or Azure embedding deployment name
  baseUrl: string; // OpenAI only
  azureEndpoint: string | undefined;
  azureApiVersion: string;
  timeoutMs: number;
  ragMinSimilarity: number; // vector retrieval: below this = abstain
  keywordMinScore: number; // keyword retrieval: below this = abstain
};

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

export function aiConfig(): AiConfig {
  const provider = process.env.LLM_PROVIDER === "azure" ? "azure" : "openai";
  return {
    enabled: process.env.LLM_ENABLED === "true",
    provider,
    apiKey: provider === "azure" ? process.env.AZURE_OPENAI_API_KEY : process.env.OPENAI_API_KEY,
    chatModel: (provider === "azure" ? process.env.AZURE_OPENAI_CHAT_DEPLOYMENT : process.env.LLM_MODEL) ?? "gpt-4o-mini",
    embeddingModel: (provider === "azure" ? process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT : process.env.EMBEDDING_MODEL) ?? "text-embedding-3-small",
    baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, ""),
    azureApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 20000),
    ragMinSimilarity: num(process.env.RAG_MIN_SIMILARITY, 0.3),
    keywordMinScore: num(process.env.RAG_KEYWORD_MIN_SCORE, 0.34),
  };
}

/** Is AI usable right now? Returns a plain-English reason when it is not. */
export function aiStatus(cfg = aiConfig()): { ready: boolean; reason: string } {
  if (!cfg.enabled) return { ready: false, reason: "AI is switched off (LLM_ENABLED is not \"true\"). Template mode is active." };
  if (!cfg.apiKey) return { ready: false, reason: `AI is switched on but no API key is set (${cfg.provider === "azure" ? "AZURE_OPENAI_API_KEY" : "OPENAI_API_KEY"}). Template mode is active.` };
  if (cfg.provider === "azure" && !cfg.azureEndpoint) return { ready: false, reason: "AZURE_OPENAI_ENDPOINT is missing. Template mode is active." };
  return { ready: true, reason: `AI is on (${cfg.provider}, ${cfg.chatModel}).` };
}
