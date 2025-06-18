// @vitest-environment happy-dom

import { existsSync } from "node:fs";
import { resolve as nodeResolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveModuleURL } from "../src";

const tests = [
  {
    input: pathToFileURL(nodeResolve(__dirname, "fixture", "foo")),
    action: "resolves",
  },
  {
    input: pathToFileURL(nodeResolve(__dirname, "fixture", "cjs")),
    action: "resolves",
  },
] as const;

const extensions = [".mjs", ".cjs", ".js", ".mts", ".cts", ".ts", ".json"];

const suffixes = ["", "/index"];

describe("resolveModuleURL", () => {
  for (const test of tests) {
    it(`${test.input} should ${test.action}`, () => {
      const resolved = resolveModuleURL(test.input, {
        from: __filename,
        extensions,
        suffixes,
      });
      expect(existsSync(fileURLToPath(resolved))).toBe(true);
    });
  }
});
