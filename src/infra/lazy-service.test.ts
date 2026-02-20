import { describe, expect, it, vi } from "vitest";
import { LazyService } from "./lazy-service.js";

describe("LazyService", () => {
  it("initializes on first get()", async () => {
    const init = vi.fn().mockResolvedValue("hello");
    const service = new LazyService({ name: "test", initializer: init });

    expect(service.initialized).toBe(false);
    const result = await service.get();
    expect(result).toBe("hello");
    expect(service.initialized).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("returns cached instance on subsequent get() calls", async () => {
    const init = vi.fn().mockResolvedValue({ id: 1 });
    const service = new LazyService({ name: "test", initializer: init });

    const a = await service.get();
    const b = await service.get();
    expect(a).toBe(b); // Same reference
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent get() calls", async () => {
    let resolveInit!: (value: string) => void;
    const init = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveInit = resolve;
        }),
    );
    const service = new LazyService({ name: "test", initializer: init });

    const p1 = service.get();
    const p2 = service.get();
    const p3 = service.get();

    resolveInit("shared-result");
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe("shared-result");
    expect(r2).toBe("shared-result");
    expect(r3).toBe("shared-result");
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("caches and re-throws initialization errors", async () => {
    const init = vi.fn().mockRejectedValue(new Error("connection refused"));
    const service = new LazyService({ name: "db", initializer: init });

    await expect(service.get()).rejects.toThrow("connection refused");
    expect(service.failed).toBe(true);

    // Subsequent calls fail without re-calling initializer
    await expect(service.get()).rejects.toThrow("previously failed");
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("reset() allows re-initialization after failure", async () => {
    const init = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce("success");
    const service = new LazyService({ name: "test", initializer: init });

    await expect(service.get()).rejects.toThrow();
    service.reset();
    expect(service.failed).toBe(false);

    const result = await service.get();
    expect(result).toBe("success");
    expect(init).toHaveBeenCalledTimes(2);
  });

  it("dispose() cleans up and resets", async () => {
    const disposer = vi.fn();
    const init = vi.fn().mockResolvedValue("instance");
    const service = new LazyService({ name: "test", initializer: init });

    await service.get();
    expect(service.initialized).toBe(true);

    await service.dispose(disposer);
    expect(disposer).toHaveBeenCalledWith("instance");
    expect(service.initialized).toBe(false);
  });

  it("dispose() is safe when not initialized", async () => {
    const disposer = vi.fn();
    const service = new LazyService({
      name: "test",
      initializer: () => Promise.resolve("x"),
    });

    await service.dispose(disposer);
    expect(disposer).not.toHaveBeenCalled();
  });

  it("handles non-Error rejection values", async () => {
    const init = vi.fn().mockRejectedValue("string error");
    const service = new LazyService({ name: "test", initializer: init });

    await expect(service.get()).rejects.toThrow("string error");
  });
});
