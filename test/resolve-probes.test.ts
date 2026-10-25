import { describe, it, expect, vi } from "vitest";
import { resolveModuleURL } from "../src";

// Records every path for which `statSync` threw.
const statThrows = vi.hoisted(() => [] as string[]);

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const statSync = ((...args: Parameters<typeof fs.statSync>) => {
    try {
      return fs.statSync(...args);
    } catch (error) {
      statThrows.push(String(args[0]));
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
});
