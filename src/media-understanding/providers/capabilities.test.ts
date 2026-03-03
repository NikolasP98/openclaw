import { describe, expect, it } from "vitest";
import { anthropicProvider } from "./anthropic/index.js";
import { deepgramProvider } from "./deepgram/index.js";
import { googleProvider } from "./google/index.js";
import { groqProvider } from "./groq/index.js";
import { minimaxProvider } from "./minimax/index.js";
import { openaiProvider } from "./openai/index.js";
import { zaiProvider } from "./zai/index.js";

const ALL_PROVIDERS = [
  anthropicProvider,
  deepgramProvider,
  googleProvider,
  groqProvider,
  minimaxProvider,
  openaiProvider,
  zaiProvider,
];

describe("media-understanding provider capabilities", () => {
  for (const provider of ALL_PROVIDERS) {
    describe(provider.id, () => {
      if (provider.describeImage) {
        it('declares "image" capability', () => {
          expect(provider.capabilities).toContain("image");
        });
      }
      if (provider.transcribeAudio) {
        it('declares "audio" capability', () => {
          expect(provider.capabilities).toContain("audio");
        });
      }
      if (provider.describeVideo) {
        it('declares "video" capability', () => {
          expect(provider.capabilities).toContain("video");
        });
      }
    });
  }
});
