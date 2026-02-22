import { describe, expect, it } from "vitest";
import { formatTranscriptionAsMessage, isVoiceNoteFile } from "./voice-transcription.js";

describe("voice-transcription", () => {
  describe("isVoiceNoteFile", () => {
    it("identifies .ogg files", () => {
      expect(isVoiceNoteFile("/tmp/voice-123.ogg")).toBe(true);
    });

    it("identifies .opus files", () => {
      expect(isVoiceNoteFile("message.opus")).toBe(true);
    });

    it("identifies .mp3 files", () => {
      expect(isVoiceNoteFile("/media/note.mp3")).toBe(true);
    });

    it("identifies .m4a files", () => {
      expect(isVoiceNoteFile("recording.m4a")).toBe(true);
    });

    it("identifies .wav files", () => {
      expect(isVoiceNoteFile("audio.wav")).toBe(true);
    });

    it("rejects non-audio files", () => {
      expect(isVoiceNoteFile("document.pdf")).toBe(false);
      expect(isVoiceNoteFile("image.png")).toBe(false);
      expect(isVoiceNoteFile("script.ts")).toBe(false);
    });

    it("handles files without extension", () => {
      expect(isVoiceNoteFile("noextension")).toBe(false);
    });

    it("is case-insensitive via toLowerCase", () => {
      expect(isVoiceNoteFile("AUDIO.OGG")).toBe(true);
    });
  });

  describe("formatTranscriptionAsMessage", () => {
    it("formats with duration", () => {
      const msg = formatTranscriptionAsMessage({
        text: "Hello, how are you?",
        durationSeconds: 5,
        provider: "whisper-api",
        latencyMs: 1200,
      });
      expect(msg).toBe("[voice note transcribed (5s)] Hello, how are you?");
    });

    it("formats without duration", () => {
      const msg = formatTranscriptionAsMessage({
        text: "Testing",
        provider: "whisper-local",
        latencyMs: 800,
      });
      expect(msg).toBe("[voice note transcribed] Testing");
    });

    it("handles empty transcription", () => {
      const msg = formatTranscriptionAsMessage({
        text: "",
        provider: "whisper-api",
        latencyMs: 500,
      });
      expect(msg).toBe("[voice note: unable to transcribe]");
    });

    it("handles whitespace-only transcription", () => {
      const msg = formatTranscriptionAsMessage({
        text: "   ",
        provider: "whisper-api",
        latencyMs: 500,
      });
      expect(msg).toBe("[voice note: unable to transcribe]");
    });
  });
});
