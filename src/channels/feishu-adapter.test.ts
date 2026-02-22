import { describe, expect, it } from "vitest";
import {
  buildStreamingUpdate,
  createStreamingCardState,
  extractTextContent,
  resolveApiBaseUrl,
} from "./feishu-adapter.js";

describe("feishu-adapter", () => {
  describe("resolveApiBaseUrl", () => {
    it("returns feishu.cn for feishu domain", () => {
      expect(resolveApiBaseUrl("feishu")).toContain("feishu.cn");
    });

    it("returns larksuite.com for lark domain", () => {
      expect(resolveApiBaseUrl("lark")).toContain("larksuite.com");
    });
  });

  describe("extractTextContent", () => {
    it("extracts text from text message", () => {
      expect(extractTextContent("text", '{"text":"Hello world"}')).toBe("Hello world");
    });

    it("extracts text from post message", () => {
      const postContent = JSON.stringify({
        title: "Post Title",
        content: [[{ tag: "text", text: "First line" }, { tag: "at", user_id: "123" }], [{ tag: "text", text: "Second line" }]],
      });
      const result = extractTextContent("post", postContent);
      expect(result).toContain("Post Title");
      expect(result).toContain("First line");
      expect(result).toContain("Second line");
    });

    it("returns placeholder for image messages", () => {
      expect(extractTextContent("image", "{}"  )).toBe("[Image]");
    });

    it("returns placeholder for audio messages", () => {
      expect(extractTextContent("audio", "{}")).toBe("[Voice Message]");
    });

    it("handles invalid JSON gracefully", () => {
      expect(extractTextContent("text", "not json")).toBe("not json");
    });
  });

  describe("streaming card", () => {
    it("creates initial state with sequence 0", () => {
      const state = createStreamingCardState("card-123");
      expect(state.cardId).toBe("card-123");
      expect(state.sequenceNo).toBe(0);
      expect(state.uuid).toBeTruthy();
    });

    it("increments sequence on each update", () => {
      let state = createStreamingCardState("card-1");
      const update1 = buildStreamingUpdate(state, "Hello");
      expect(update1.payload.sequence).toBe(1);
      state = update1.nextState;

      const update2 = buildStreamingUpdate(state, "Hello world");
      expect(update2.payload.sequence).toBe(2);
    });

    it("includes card_id and uuid in payload", () => {
      const state = createStreamingCardState("card-abc");
      const { payload } = buildStreamingUpdate(state, "text");
      expect(payload.card_id).toBe("card-abc");
      expect(payload.uuid).toBe(state.uuid);
      expect(payload.content).toBe("text");
    });
  });
});
