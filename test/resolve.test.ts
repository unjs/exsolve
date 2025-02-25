import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveModuleURL, resolveModulePath } from "../src";

const tests = [
  // Resolve to path
  { input: "vitest", action: "resolves" },
  { input: "./fixture/cjs.mjs", action: "resolves" },
  { input: "./fixture/foo", action: "resolves" },
  {
    input: fileURLToPath(new URL("fixture/foo", import.meta.url)),
    action: "resolves",
  },
  // Return same input as-is
  { input: "https://foo.com/a/b.js?a=1", action: "same" },
  // Throw error
  // { input: 'script:alert("a")', action: "throws" }, // TODO: fixture from mlly
  { input: "/non/existent", action: "throws" },
] as const;

const extensions = [".mjs", ".cjs", ".js", ".mts", ".cts", ".ts", ".json"];

const suffixes = ["", "/index"];

describe("resolveModuleURL", () => {
  for (const test of tests) {
    it(`${test.input} should ${test.action}`, () => {
      switch (test.action) {
        case "resolves": {
          const resolved = resolveModuleURL(test.input, {
            from: import.meta.url,
            extensions,
            suffixes,
          });
          expect(existsSync(fileURLToPath(resolved))).toBe(true);
          break;
        }
        case "same": {
          const resolved = resolveModuleURL(test.input, {
            from: import.meta.url,
            extensions,
            suffixes,
          });
          expect(resolved).toBe(test.input);
          break;
        }
        case "throws": {
          expect(() => resolveModuleURL(test.input)).toThrow();
          break;
        }
      }
    });
  }

  it("follows symlinks", () => {
    const resolved = resolveModuleURL("./fixture/hello.link.mjs", {
      from: import.meta.url,
    });
    expect(fileURLToPath(resolved)).match(/fixture[/\\]hello\.mjs$/);

    const resolved2 = resolveModuleURL("./fixture/test.link.txt", {
      from: import.meta.url,
    });
    expect(fileURLToPath(resolved2)).match(/fixture[/\\]test.txt$/);
  });

  it("handles missing subpath imports", () => {
    const resolved = resolveModuleURL("#build/auth.js", {
      from: import.meta.url,
      try: true,
    });
    expect(resolved).toMatchInlineSnapshot();
  });

  it("resolves node built-ins", () => {
  it("should resolve suffixes fully on windows", () => {
    const res = resolveModuleURL(
      fileURLToPath(new URL("fixture/foo", import.meta.url)),
      {
        from: import.meta.url,
        suffixes: ["/index"],
        extensions: [".mjs"],
      },
    );
    expect(res).toMatch(/\.mjs$/);
  });

  it("resolves node built-ints", () => {
    expect(resolveModuleURL("node:fs")).toBe("node:fs");
    expect(resolveModuleURL("fs")).toBe("node:fs");
    expect(resolveModuleURL("node:foo")).toBe("node:foo");
  });
});

describe("resolveModulePath", () => {
  for (const test of tests) {
    it(`${test.input} should ${test.action}`, () => {
      const action = test.input.startsWith("https://") ? "throws" : test.action;
      switch (action) {
        case "resolves": {
          const resolved = resolveModulePath(test.input, {
            from: import.meta.url,
            extensions,
            suffixes,
          });
          expect(existsSync(resolved)).toBe(true);
          break;
        }
        case "same": {
          const resolved = resolveModulePath(test.input, {
            from: import.meta.url,
            extensions,
            suffixes,
          });
          expect(resolved).toBe(test.input);
          break;
        }
        case "throws": {
          expect(() => resolveModulePath(test.input)).toThrow();
          break;
        }
      }
    });
  }
});

describe("normalized parent urls", () => {
  const cannotResolveError = (id: string, urls: (string | URL)[]) =>
    Object.assign(
      new Error(
        `Cannot resolve module "${id}" (from: ${urls.map((u) => fileURLToPath(u)).join(", ")})`,
      ),
      { code: "ERR_MODULE_NOT_FOUND" },
    );

  const commonCases = [
    [[undefined, false, 123] as unknown, [pathToFileURL("./")]],
    [import.meta.url, [import.meta.url]],
    [new URL(import.meta.url), [import.meta.url]],
    [__filename, [pathToFileURL(__filename)]],
    [__dirname, [pathToFileURL(__dirname) + "/"]],
  ];

  const posixCases = [
    ["file:///project/index.js", ["file:///project/index.js"]],
    ["file:///project/", ["file:///project/"]],
    ["file:///project", ["file:///project"]],
    ["/non/existent", ["file:///non/existent/", "file:///non/existent"]],
  ];

  const windowsCases = [
    [
      String.raw`C:\non\existent`,
      ["file:///C:/non/existent/", "file:///C:/non/existent"],
    ],
  ];

  const testCases = [
    ...commonCases,
    ...(process.platform === "win32" ? windowsCases : posixCases),
  ] as Array<[string | string[], string[]]>;

  for (const [input, expected] of testCases) {
    it(JSON.stringify(input), () => {
      expect(() => resolveModuleURL("xyz", { from: input })).toThrow(
        cannotResolveError("xyz", expected),
      );
    });
  }
});
