/**
 * Inbound voice note transcription.
 *
 * Transcribes WhatsApp/Telegram .ogg voice notes to text via:
 * 1. Whisper API (OpenAI) — default
 * 2. Local whisper.cpp — fallback/cost-free alternative
 *
 * Transcribed text is injected into the conversation as the user's message
 * with a `[voice note transcribed]` prefix.
 *
 * From the improvement mining gap analysis (TTS done, ASR is the natural pair).
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("media/voice-transcription");

// ── Types ────────────────────────────────────────────────────────────

export interface TranscriptionConfig {
  /** Transcription provider. */
  provider: "whisper-api" | "whisper-local" | "disabled";
  /** OpenAI API key (for whisper-api). */
  apiKey?: string;
  /** OpenAI API base URL (for whisper-api). */
  baseUrl?: string;
  /** Path to whisper.cpp binary (for whisper-local). */
  whisperBinary?: string;
  /** Path to whisper model file (for whisper-local). */
  whisperModel?: string;
  /** Language hint (ISO 639-1 code, e.g. "en", "es"). */
  language?: string;
  /** Maximum file size to transcribe in bytes (default: 25MB). */
  maxFileSizeBytes?: number;
}

export interface TranscriptionResult {
  /** Transcribed text. */
  text: string;
  /** Language detected/used. */
  language?: string;
  /** Duration of the audio in seconds. */
  durationSeconds?: number;
  /** Provider used. */
  provider: string;
  /** Time taken to transcribe (ms). */
  latencyMs: number;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (Whisper API limit)
const DEFAULT_WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-1";

// ── Implementation ───────────────────────────────────────────────────

/**
 * Transcribe an audio file to text.
 *
 * @param filePath - Path to the audio file (.ogg, .mp3, .wav, .m4a)
 * @param config - Transcription configuration
 * @returns Transcription result, or undefined if transcription is disabled/failed
 */
export async function transcribeAudio(
  filePath: string,
  config: TranscriptionConfig,
): Promise<TranscriptionResult | undefined> {
  if (config.provider === "disabled") {
    return undefined;
  }

  // Check file size.
  const maxSize = config.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > maxSize) {
      log.warn(`Audio file too large: ${stat.size} bytes (max: ${maxSize})`);
      return undefined;
    }
  } catch (err) {
    log.warn(`Cannot stat audio file: ${filePath}: ${err}`);
    return undefined;
  }

  const startMs = performance.now();

  if (config.provider === "whisper-api") {
    return transcribeViaApi(filePath, config, startMs);
  }

  if (config.provider === "whisper-local") {
    return transcribeViaLocal(filePath, config, startMs);
  }

  return undefined;
}

/**
 * Transcribe via OpenAI Whisper API.
 */
async function transcribeViaApi(
  filePath: string,
  config: TranscriptionConfig,
  startMs: number,
): Promise<TranscriptionResult | undefined> {
  if (!config.apiKey) {
    log.warn("Whisper API transcription requires apiKey");
    return undefined;
  }

  try {
    const fileData = await fs.readFile(filePath);
    const fileName = filePath.split("/").pop() ?? "audio.ogg";

    const formData = new FormData();
    formData.append("file", new Blob([fileData]), fileName);
    formData.append("model", WHISPER_MODEL);
    if (config.language) {
      formData.append("language", config.language);
    }

    const baseUrl = config.baseUrl ?? DEFAULT_WHISPER_API_URL;
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      log.warn(`Whisper API error ${response.status}: ${errBody.slice(0, 200)}`);
      return undefined;
    }

    const data = (await response.json()) as { text?: string; language?: string; duration?: number };
    const latencyMs = Math.round(performance.now() - startMs);

    log.debug(`Whisper API transcription: ${data.text?.length ?? 0} chars in ${latencyMs}ms`);

    return {
      text: data.text ?? "",
      language: data.language ?? config.language,
      durationSeconds: data.duration,
      provider: "whisper-api",
      latencyMs,
    };
  } catch (err) {
    log.warn(`Whisper API transcription failed: ${err}`);
    return undefined;
  }
}

/**
 * Transcribe via local whisper.cpp binary.
 */
async function transcribeViaLocal(
  filePath: string,
  config: TranscriptionConfig,
  startMs: number,
): Promise<TranscriptionResult | undefined> {
  const binary = config.whisperBinary ?? "whisper";
  const model = config.whisperModel ?? "";

  if (!model) {
    log.warn("Local whisper transcription requires whisperModel path");
    return undefined;
  }

  try {
    const langArg = config.language ? `-l ${config.language}` : "";
    const cmd = `${binary} -m ${model} ${langArg} -f ${filePath} --no-timestamps -otxt 2>/dev/null`;
    const output = execSync(cmd, { timeout: 120_000, encoding: "utf-8" });
    const latencyMs = Math.round(performance.now() - startMs);

    log.debug(`Local whisper transcription: ${output.length} chars in ${latencyMs}ms`);

    return {
      text: output.trim(),
      language: config.language,
      provider: "whisper-local",
      latencyMs,
    };
  } catch (err) {
    log.warn(`Local whisper transcription failed: ${err}`);
    return undefined;
  }
}

/**
 * Format a transcription result for injection into the conversation.
 */
export function formatTranscriptionAsMessage(result: TranscriptionResult): string {
  if (!result.text.trim()) {
    return "[voice note: unable to transcribe]";
  }
  const duration = result.durationSeconds
    ? ` (${Math.round(result.durationSeconds)}s)`
    : "";
  return `[voice note transcribed${duration}] ${result.text}`;
}

/**
 * Check if a file is likely a voice note based on extension.
 */
export function isVoiceNoteFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ["ogg", "oga", "opus", "mp3", "m4a", "wav", "aac", "wma"].includes(ext ?? "");
}
