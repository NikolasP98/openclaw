/**
 * Browser-based DuckDuckGo search fallback for environments without a search API key.
 * Uses the headless browser to navigate DuckDuckGo Lite and parse results.
 */

import { browserNavigate } from "../../browser/client-actions-core.js";
import { browserSnapshot, browserStart, browserStatus } from "../../browser/client.js";
import { resolveBrowserConfig } from "../../browser/config.js";
import { loadConfig } from "../../config/config.js";
import { wrapWebContent } from "../../security/external-content.js";
import type { CacheEntry } from "./web-shared.js";
import { normalizeCacheKey, readCache, writeCache } from "./web-shared.js";

const PROFILE = "minion";
const DDG_LITE_BASE = "https://lite.duckduckgo.com/lite/";
const SNAPSHOT_MAX_CHARS = 30_000;
const NAVIGATE_SETTLE_MS = 1500;

export type BrowserSearchResult = {
  title: string;
  url: string;
  description: string;
  siteName: string;
};

export type BrowserSearchResponse = {
  query: string;
  provider: "browser";
  count: number;
  tookMs: number;
  results: BrowserSearchResult[];
  rawContent?: string;
  externalContent: {
    untrusted: true;
    source: "web_search";
    provider: "browser";
    wrapped: true;
  };
};

const cache = new Map<string, CacheEntry<BrowserSearchResponse>>();

/** Check whether the browser fallback can be used (browser.enabled in config). */
export function isBrowserSearchAvailable(): boolean {
  try {
    const cfg = loadConfig();
    const resolved = resolveBrowserConfig(cfg.browser, cfg);
    return resolved.enabled;
  } catch {
    return false;
  }
}

/** Ensure the minion browser profile is running, starting it if needed. */
async function ensureBrowserRunning(): Promise<void> {
  try {
    const status = await browserStatus(undefined, { profile: PROFILE });
    if (status.running) {
      return;
    }
  } catch {
    // status endpoint failed — try starting
  }
  await browserStart(undefined, { profile: PROFILE });
  // Give it a moment to settle
  await new Promise((r) => setTimeout(r, 1000));
}

/**
 * Parse DuckDuckGo Lite AI snapshot text into structured search results.
 *
 * DDG Lite renders plain HTML tables. The AI snapshot typically produces
 * numbered text blocks like:
 *   1. Result Title
 *      https://example.com/path
 *      Description snippet...
 *
 * We split on numbered lines and extract title, URL, and description.
 */
export function parseDuckDuckGoLiteSnapshot(
  text: string,
  maxResults: number,
): BrowserSearchResult[] {
  const results: BrowserSearchResult[] = [];

  // Match numbered entries: "1. Title\n   url\n   description..."
  // Use a regex that captures each numbered block up to the next numbered block or end.
  const entryRegex = /(?:^|\n)\s*\d+\.\s+(.+?)(?=\n\s*\d+\.\s+|\s*$)/gs;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(text)) !== null) {
    if (results.length >= maxResults) {
      break;
    }

    const content = match[1];
    if (!content) {
      continue;
    }

    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    const title = lines[0];

    // Find the first URL in the content
    const urlMatch = content.match(/https?:\/\/[^\s)\]]+/);
    const url = urlMatch ? urlMatch[0] : "";

    // Description: everything except the title and the URL line
    const descLines = lines.slice(1).filter((l) => l !== url);
    const description = descLines.join(" ").trim();

    // Extract site name from URL hostname
    let siteName = "";
    try {
      siteName = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // invalid URL — leave empty
    }

    if (title && url) {
      results.push({
        title: wrapWebContent(title, "web_search"),
        url,
        description: description ? wrapWebContent(description, "web_search") : "",
        siteName,
      });
    }
  }

  return results;
}

/**
 * Run a web search via DuckDuckGo Lite using the headless browser.
 */
export async function runBrowserSearch(opts: {
  query: string;
  count: number;
  cacheTtlMs: number;
}): Promise<BrowserSearchResponse> {
  const { query, count, cacheTtlMs } = opts;

  // Check cache
  const cacheKey = normalizeCacheKey(`browser:${query}:${count}`);
  const cached = readCache(cache, cacheKey);
  if (cached) {
    return cached.value;
  }

  const t0 = Date.now();

  await ensureBrowserRunning();

  // Navigate to DuckDuckGo Lite
  const searchUrl = `${DDG_LITE_BASE}?q=${encodeURIComponent(query)}`;
  await browserNavigate(undefined, { url: searchUrl, profile: PROFILE });

  // Wait for the page to settle
  await new Promise((r) => setTimeout(r, NAVIGATE_SETTLE_MS));

  // Take AI snapshot
  const snapshot = await browserSnapshot(undefined, {
    format: "ai",
    maxChars: SNAPSHOT_MAX_CHARS,
    profile: PROFILE,
  });

  const snapshotText = snapshot.ok && snapshot.format === "ai" ? snapshot.snapshot : "";
  const tookMs = Date.now() - t0;

  // Parse results
  const results = parseDuckDuckGoLiteSnapshot(snapshotText, count);

  const response: BrowserSearchResponse = {
    query,
    provider: "browser",
    count: results.length,
    tookMs,
    results,
    ...(results.length === 0 ? { rawContent: snapshotText.slice(0, 5000) } : {}),
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "browser",
      wrapped: true,
    },
  };

  writeCache(cache, cacheKey, response, cacheTtlMs);
  return response;
}
