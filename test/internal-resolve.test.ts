import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

describe("unreadable package.json", () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "exsolve-"));
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "target.mjs"), "");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ imports: { "#target": "./target.mjs" } }),
    );
    return {
      pjson: join(dir, "nested", "package.json"),
      base: pathToFileURL(join(dir, "nested", "index.mjs")),
      [Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
    };
  }

  it("ignores a directory named package.json", () => {
    using pkg = setup();
    mkdirSync(pkg.pjson);
    expect(moduleResolve("#target", pkg.base).href).toMatch(/\/target\.mjs$/);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a package.json that cannot be read",
    () => {
      using pkg = setup();
      writeFileSync(pkg.pjson, "{}");
      chmodSync(pkg.pjson, 0o000);
      try {
        expect(() => moduleResolve("#target", pkg.base)).toThrow(
          expect.objectContaining({
            code: "ERR_INVALID_PACKAGE_CONFIG",
            message: expect.stringContaining(
              `Invalid package config ${pkg.pjson} while importing ${fileURLToPath(pkg.base)}. Cannot read package config: EACCES`,
            ),
            cause: expect.objectContaining({ code: "EACCES" }),
          }),
        );
      } finally {
        chmodSync(pkg.pjson, 0o644);
      }
    },
  );
});
