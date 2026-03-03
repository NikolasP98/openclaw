import { describe, expect, it } from "vitest";
import {
  clearLidCache,
  DisconnectBuffer,
  isLidJid,
  registerLidMapping,
  sanitizeOutbound,
  stripInternalTags,
  stripThinkingTags,
  translateJid,
} from "./whatsapp-resilience.js";

describe("whatsapp-resilience", () => {
  describe("LID-to-JID translation", () => {
    it("identifies LID JIDs", () => {
      expect(isLidJid("1234567890@lid")).toBe(true);
      expect(isLidJid("+15551234567@s.whatsapp.net")).toBe(false);
      expect(isLidJid("group@g.us")).toBe(false);
    });

    it("passes through non-LID JIDs unchanged", async () => {
      const jid = "+15551234567@s.whatsapp.net";
      expect(await translateJid(jid)).toBe(jid);
    });

    it("translates LID via lookup function", async () => {
      clearLidCache();
      const lookup = async () => "+15551234567@s.whatsapp.net";
      const result = await translateJid("abc123@lid", lookup);
      expect(result).toBe("+15551234567@s.whatsapp.net");
    });

    it("caches LID translations", async () => {
      clearLidCache();
      let callCount = 0;
      const lookup = async () => {
        callCount++;
        return "+15551234567@s.whatsapp.net";
      };
      await translateJid("abc123@lid", lookup);
      await translateJid("abc123@lid", lookup);
      expect(callCount).toBe(1); // Second call used cache.
    });

    it("uses registered mappings", async () => {
      clearLidCache();
      registerLidMapping("xyz789@lid", "+15559876543@s.whatsapp.net");
      const result = await translateJid("xyz789@lid");
      expect(result).toBe("+15559876543@s.whatsapp.net");
    });

    it("returns LID as-is when no translation available", async () => {
      clearLidCache();
      const result = await translateJid("unknown@lid");
      expect(result).toBe("unknown@lid");
    });

    it("handles lookup function errors gracefully", async () => {
      clearLidCache();
      const lookup = async () => { throw new Error("network error"); };
      const result = await translateJid("fail@lid", lookup as () => Promise<string | undefined>);
      expect(result).toBe("fail@lid");
    });
  });

  describe("DisconnectBuffer", () => {
    it("buffers and flushes messages in order", async () => {
      const buffer = new DisconnectBuffer(10);
      buffer.enqueue({ jid: "a@s.whatsapp.net", content: "msg1" });
      buffer.enqueue({ jid: "b@s.whatsapp.net", content: "msg2" });
      expect(buffer.size).toBe(2);

      const sent: string[] = [];
      await buffer.flush(async (msg) => { sent.push(msg.content); });
      expect(sent).toEqual(["msg1", "msg2"]);
      expect(buffer.isEmpty).toBe(true);
    });

    it("drops oldest when at capacity", () => {
      const buffer = new DisconnectBuffer(3);
      buffer.enqueue({ jid: "a", content: "1" });
      buffer.enqueue({ jid: "b", content: "2" });
      buffer.enqueue({ jid: "c", content: "3" });
      buffer.enqueue({ jid: "d", content: "4" }); // Drops "1".
      expect(buffer.size).toBe(3);
    });

    it("stops flushing on send error, keeps remaining", async () => {
      const buffer = new DisconnectBuffer(10);
      buffer.enqueue({ jid: "a", content: "1" });
      buffer.enqueue({ jid: "b", content: "2" });
      buffer.enqueue({ jid: "c", content: "3" });

      let count = 0;
      await buffer.flush(async () => {
        count++;
        if (count === 2) throw new Error("send failed");
      });
      // First sent OK, second failed, third still buffered.
      expect(buffer.size).toBe(2); // "2" and "3" remain.
    });

    it("handles empty buffer flush", async () => {
      const buffer = new DisconnectBuffer();
      const sent = await buffer.flush(async () => {});
      expect(sent).toBe(0);
    });
  });

  describe("internal tag stripping", () => {
    it("strips <internal> tags", () => {
      const input = "Hello <internal>secret reasoning</internal> World";
      expect(stripInternalTags(input)).toBe("Hello  World");
    });

    it("strips multiline <internal> blocks", () => {
      const input = "Start\n<internal>\nline1\nline2\n</internal>\nEnd";
      expect(stripInternalTags(input)).toBe("Start\n\nEnd");
    });

    it("strips <thinking> tags", () => {
      expect(stripThinkingTags("Before <thinking>chain of thought</thinking> After")).toBe("Before  After");
    });

    it("sanitizeOutbound strips both tag types", () => {
      const input = "<internal>hidden</internal> visible <thinking>thought</thinking> also visible";
      const result = sanitizeOutbound(input);
      expect(result).toBe("visible  also visible");
    });

    it("handles content with no tags", () => {
      expect(sanitizeOutbound("normal message")).toBe("normal message");
    });

    it("handles empty string", () => {
      expect(sanitizeOutbound("")).toBe("");
    });

    it("is case-insensitive", () => {
      expect(stripInternalTags("<INTERNAL>secret</INTERNAL>")).toBe("");
      expect(stripInternalTags("<Internal>secret</Internal>")).toBe("");
    });
  });
});
