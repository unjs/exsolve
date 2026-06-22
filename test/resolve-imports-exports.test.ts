import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveModuleURL } from "../src";

describe("package.json imports field", () => {
  const from = new URL("fixture/imports-pkg/index.js", import.meta.url);

  // Regression: a `#/`-prefixed subpath import used to be rejected by
  // `packageImportsResolve` with ERR_INVALID_MODULE_SPECIFIER. The guard was
  // removed (matching Node upstream) so it now resolves via the imports field.
  it("resolves `#/`-prefixed subpath imports", () => {
    const resolved = resolveModuleURL("#/util.js", { from });
    expect(resolved).toMatch(/imports-pkg\/src\/util\.js$/);
    expect(existsSync(fileURLToPath(resolved))).toBe(true);
  });

  it("does not throw for `#/`-prefixed subpath imports", () => {
    expect(() => resolveModuleURL("#/util.js", { from })).not.toThrow();
  });

  it("resolves a plain `#`-prefixed import", () => {
    const resolved = resolveModuleURL("#internal", { from });
    expect(resolved).toMatch(/imports-pkg\/internal\.js$/);
    expect(existsSync(fileURLToPath(resolved))).toBe(true);
  });
});

describe("package.json conditional exports fall-through", () => {
  const from = new URL("fixture/exports-pkg/index.js", import.meta.url);

  // Regression: a nested conditions object that matches no condition used to
  // return `null`, causing the parent to stop and throw
  // ERR_PACKAGE_PATH_NOT_EXPORTED. It now returns `undefined`, letting the
  // parent fall through to the next key (`default`).
  it("falls through to `default` when nested conditions do not match", () => {
    const resolved = resolveModuleURL("exports-pkg", {
      from,
      conditions: ["node", "import"],
    });
    expect(resolved).toMatch(/exports-pkg\/default\.js$/);
    expect(existsSync(fileURLToPath(resolved))).toBe(true);
  });

  it("does not throw when nested conditions do not match", () => {
    expect(() =>
      resolveModuleURL("exports-pkg", {
        from,
        conditions: ["node", "import"],
      }),
    ).not.toThrow();
  });

  // Positive control: when the `worker` condition is present, the nested
  // object matches and resolves to `worker.js` instead of `default.js`.
  it("resolves to the matched nested condition when present", () => {
    const resolved = resolveModuleURL("exports-pkg", {
      from,
      conditions: ["node", "import", "worker"],
    });
    expect(resolved).toMatch(/exports-pkg\/worker\.js$/);
    expect(existsSync(fileURLToPath(resolved))).toBe(true);
  });
});
