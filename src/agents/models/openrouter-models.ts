import type { ModelDefinitionConfig } from "../../config/types.models.js";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Curated catalog of OpenRouter models with confirmed tool-calling support.
 * Sorted by cost (cheapest first) for quick reference.
 * Pricing source: openrouter.ai (March 2026)
 */
export const OPENROUTER_MODEL_CATALOG: ModelDefinitionConfig[] = [
  {
    id: "google/gemma-3-27b-it",
    name: "Gemma 3 27B",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.04, output: 0.15, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 65536,
  },
  {
    id: "qwen/qwen3-30b-a3b",
    name: "Qwen3 30B (MoE)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.08, output: 0.28, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 40960,
    maxTokens: 40960,
  },
  {
    id: "meta-llama/llama-4-scout",
    name: "Llama 4 Scout",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.08, output: 0.3, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 327680,
    maxTokens: 16384,
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 8192,
  },
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.0 Flash",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 8192,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  },
  {
    id: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 16384,
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3 (Mar 2025)",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.2, output: 0.77, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 163840,
    maxTokens: 8192,
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.25, output: 0.4, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 163840,
    maxTokens: 8192,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.3, output: 2.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 8192,
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.4, output: 1.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1047576,
    maxTokens: 16384,
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.47, output: 2.0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.45, output: 2.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 8192,
  },
  {
    id: "moonshotai/kimi-k2",
    name: "Kimi K2",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.55, output: 2.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 2.5, output: 10.0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  },
];

/**
 * Short aliases for quick model switching, keyed by alias name.
 * Values are full OpenRouter model refs (openrouter/<provider>/<model-id>).
 */
export const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  gemma: "openrouter/google/gemma-3-27b-it",
  qwen: "openrouter/qwen/qwen3-30b-a3b",
  scout: "openrouter/meta-llama/llama-4-scout",
  "gemini-lite": "openrouter/google/gemini-2.5-flash-lite",
  "gemini-flash": "openrouter/google/gemini-2.0-flash-001",
  "gpt-mini": "openrouter/openai/gpt-4o-mini",
  maverick: "openrouter/meta-llama/llama-4-maverick",
  deepseek: "openrouter/deepseek/deepseek-chat-v3-0324",
  "deepseek-v3": "openrouter/deepseek/deepseek-v3.2",
  gemini: "openrouter/google/gemini-2.5-flash",
  "gpt41-mini": "openrouter/openai/gpt-4.1-mini",
  "kimi-thinking": "openrouter/moonshotai/kimi-k2-thinking",
  "kimi-turbo": "openrouter/moonshotai/kimi-k2.5",
  kimi: "openrouter/moonshotai/kimi-k2",
  gpt4o: "openrouter/openai/gpt-4o",
};
