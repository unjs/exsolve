import { describe, it, expect } from "vitest";
import { moduleResolve } from "../src/internal/resolve.ts";

describe("finalizeResolution trailing slash", () => {
  const base = new URL("fixture/", import.meta.url);

  it("reports a directory import for an existing directory", () => {
    expect(() => moduleResolve("./foo/", base)).toThrow(
      expect.objectContaining({ code: "ERR_UNSUPPORTED_DIR_IMPORT" }),
    );
  });

  it("reports module not found for a missing path", () => {
    expect(() => moduleResolve("./missing/", base)).toThrow(
      expect.objectContaining({ code: "ERR_MODULE_NOT_FOUND" }),
    );
  });

  it("does not resolve a file with a trailing slash", () => {
    expect(() => moduleResolve("./hello.mjs/", base)).toThrow(
      expect.objectContaining({ code: "ERR_MODULE_NOT_FOUND" }),
    );
  });

  it.skipIf(process.platform === "win32")("reports a directory import for the root", () => {
    expect(() => moduleResolve("/", base)).toThrow(
      expect.objectContaining({ code: "ERR_UNSUPPORTED_DIR_IMPORT" }),
    );
  });
});
