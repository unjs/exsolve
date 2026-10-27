import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { resolveModuleURL } from "../src";

// Records every path passed to `statSync`, and those for which it threw ENOENT.
const statCalls = vi.hoisted(() => [] as string[]);
const statThrows = vi.hoisted(() => [] as string[]);

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const statSync = ((...args: Parameters<typeof fs.statSync>) => {
    statCalls.push(String(args[0]));
    try {
      return fs.statSync(...args);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        statThrows.push(String(args[0]));
      }
      throw error;
    }
  }) as typeof fs.statSync;
  return { ...fs, statSync };
});

describe("probing missing paths", () => {
  it.each(["missing-pkg/sub/index.mjs", "./fixture/missing"])(
    "%s does not throw in statSync",
    (id) => {
      statThrows.length = 0;
      const resolved = resolveModuleURL(id, {
        from: import.meta.url,
        try: true,
        cache: false,
        suffixes: ["", "/index"],
        extensions: [".mjs", ".js"],
      });
      expect(resolved).toBeUndefined();
      expect(statThrows).toEqual([]);
    },
  );

  it("probes absolute inputs once, regardless of `from`", () => {
    const missing = fileURLToPath(new URL("fixture/missing", import.meta.url));
    const probes = (from: URL[]) => {
      statCalls.length = 0;
      resolveModuleURL(missing, { from, extensions: [".mjs"], cache: false, try: true });
      return statCalls.filter((path) => path.startsWith(missing)).length;
    };
    const bases = ["fixture/", "fixture/foo/", "fixture/exports-pkg/"].map(
      (path) => new URL(path, import.meta.url),
    );
    const single = probes(bases.slice(0, 1));
    expect(single).toBeGreaterThan(1);
    expect(probes(bases)).toBe(single);
  });
});
