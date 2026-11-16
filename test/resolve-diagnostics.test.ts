import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createResolver, resolveModulePath, resolveModuleURL } from "../src";
import type { ResolveError, ResolveOptions } from "../src";

const NOT_FOUND = "ERR_MODULE_NOT_FOUND";
const NOT_EXPORTED = "ERR_PACKAGE_PATH_NOT_EXPORTED";
const INVALID_TARGET = "ERR_INVALID_PACKAGE_TARGET";
const INVALID_CONFIG = "ERR_INVALID_PACKAGE_CONFIG";

const exportsMap = {
  ".": { require: "./a.js" },
  "./import-null": { import: null, default: "./a.js" },
  "./default-null": { custom: "./a.js", default: null },
  "./unmatched": { custom: "./a.js" },
  "./u": { custom: "./a.js" },
  "./u.js": { custom: "./a.js" },
  "./invalid": "a.js",
  "./invalid.js": "a.js",
  "./missing": "./missing.js",
  "./import-first": { import: "./a.js", require: "./b.js" },
  "./require-first": { require: "./b.js", import: "./a.js" },
  "./nested-fallthrough": { node: { custom: "./b.js" }, default: "./a.js" },
  "./nested-null": { node: { import: null }, default: "./a.js" },
  "./nested-unmatched": { node: { custom: "./b.js" } },
  "./null-valid": [null, "./a.js"],
  "./invalid-valid": ["a.js", "./b.js"],
  "./invalid-null": ["a.js", null],
  "./null-invalid": [null, "a.js"],
  "./array-unmatched": [{ custom: "./a.js" }],
  "./empty": [],
  "./missing-valid": ["./missing.js", "./a.js"],
  "./p/*": "./*.js",
  "./p/b": null,
  "./p/private/*": null,
  "./p/require/*": { require: "./*.js" },
};

const cases: [id: string, expected: string | [code: string, reason?: string]][] = [
  ["@scope/diag", [NOT_EXPORTED, "unmatched-conditions"]],
  ["@scope/diag/import-null", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/default-null", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/unmatched", [NOT_EXPORTED, "unmatched-conditions"]],
  ["@scope/diag/no-key", [NOT_EXPORTED, "not-exported"]],
  ["@scope/diag/invalid", [INVALID_TARGET]],
  ["@scope/diag/missing", [NOT_FOUND, "missing-target"]],
  ["@scope/diag/import-first", "a.js"],
  ["@scope/diag/require-first", "a.js"],
  ["@scope/diag/nested-fallthrough", "a.js"],
  ["@scope/diag/nested-null", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/nested-unmatched", [NOT_EXPORTED, "unmatched-conditions"]],
  ["@scope/diag/null-valid", "a.js"],
  ["@scope/diag/invalid-valid", "b.js"],
  ["@scope/diag/invalid-null", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/null-invalid", [INVALID_TARGET]],
  ["@scope/diag/array-unmatched", [NOT_EXPORTED, "unmatched-conditions"]],
  ["@scope/diag/empty", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/missing-valid", [NOT_FOUND, "missing-target"]],
  ["@scope/diag/p/a", "a.js"],
  ["@scope/diag/p/b", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/p/private/a", [NOT_EXPORTED, "blocked"]],
  ["@scope/diag/p/require/a", [NOT_EXPORTED, "unmatched-conditions"]],
  ["@scope/diag/p/gone", [NOT_FOUND, "missing-target"]],
  ["./gone.js", [NOT_FOUND, "missing-target"]],
  ["bad-json", [INVALID_CONFIG]],
  ["mixed-keys", [INVALID_CONFIG]],
  ["legacy", [NOT_FOUND]],
  ["@scope/absent", [NOT_FOUND]],
];

// `import.meta.resolve()` can return a missing file, so also import the result.
const nativeProbe = `const results = [];
for (const id of process.argv.slice(2)) {
  try {
    const url = import.meta.resolve(id);
    await import(url);
    results.push(url);
  } catch (error) {
    results.push(error.code);
  }
}
process.stdout.write(JSON.stringify(results));
`;

let dir: string;
let from: URL;
const url = (path: string) => pathToFileURL(join(dir, path)).href;

function writeFiles(files: Record<string, string | object>) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  }
}

function writeManifest(exports: object) {
  writeFiles({ "package.json": { name: "@scope/diag", type: "module", exports } });
}

function outcome(
  id: string,
  options?: ResolveOptions,
  resolve: (id: string, options: ResolveOptions) => string | undefined = resolveModuleURL,
) {
  try {
    return resolve(id, { from, cache: false, ...options });
  } catch (error) {
    const { code, resolveCode, resolveReason } = error as ResolveError;
    return { code, resolveCode, resolveReason };
  }
}

function failure(resolveCode?: string, resolveReason?: string) {
  return { code: NOT_FOUND, resolveCode, resolveReason };
}

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "exsolve-diagnostics-")));
  from = pathToFileURL(join(dir, "probe.mjs"));
  writeManifest(exportsMap);
  writeFiles({
    "a.js": "export default 1;\n",
    "b.js": "export default 2;\n",
    "probe.mjs": nativeProbe,
    "node_modules/bad-json/package.json": "{",
    "node_modules/mixed-keys/package.json": { exports: { ".": "./a.js", node: "./a.js" } },
    "node_modules/legacy/package.json": { main: "./gone.js" },
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolve error metadata", () => {
  it("reports the code and reason of export map and package failures", () => {
    expect(cases.map(([id]) => outcome(id))).toEqual(
      cases.map(([, expected]) =>
        typeof expected === "string" ? url(expected) : failure(...expected),
      ),
    );
  });

  it("matches Node.js target selection and error codes", () => {
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(from), ...cases.map(([id]) => id)],
      { cwd: dir, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
    );
    expect(JSON.parse(output)).toEqual(
      cases.map(([, expected]) => (typeof expected === "string" ? url(expected) : expected[0])),
    );
  });

  it("selects the first export map key matching the active conditions", () => {
    for (const conditions of [
      ["import", "require"],
      ["require", "import"],
    ]) {
      expect(outcome("@scope/diag/import-first", { conditions })).toBe(url("a.js"));
      expect(outcome("@scope/diag/require-first", { conditions })).toBe(url("b.js"));
    }
    expect(outcome("@scope/diag", { conditions: ["require"] })).toBe(url("a.js"));
    expect(outcome("@scope/diag/p/require/a", { conditions: ["require"] })).toBe(url("a.js"));
  });

  it("keeps a code and reason shared by every attempt", () => {
    const sub = pathToFileURL(join(dir, "sub/"));
    expect(outcome("@scope/diag/unmatched", { from: [from, sub] })).toEqual(
      failure(NOT_EXPORTED, "unmatched-conditions"),
    );
    expect(outcome("./gone", { extensions: [".js"] })).toEqual(
      failure(NOT_FOUND, "missing-target"),
    );
  });

  it("does not restore a reason after attempts disagree", () => {
    expect(outcome("@scope/diag/unmatched", { suffixes: ["", "/x"] })).toEqual(
      failure(NOT_EXPORTED),
    );
    expect(outcome("@scope/diag/u", { extensions: [".mjs", ".js"] })).toEqual(
      failure(NOT_EXPORTED),
    );
    expect(outcome("@scope/diag", { suffixes: ["/unmatched", "/p/b", "/u"] })).toEqual(
      failure(NOT_EXPORTED),
    );
  });

  it("omits diagnostic metadata for conflicting codes or no attempts", () => {
    expect(outcome("@scope/diag/invalid", { extensions: [".mjs", ".js"] })).toEqual(failure());
    const outside = pathToFileURL(join(tmpdir(), "/"));
    expect(outcome("@scope/diag/unmatched", { from: [from, outside] })).toEqual(failure());
    expect(outcome("@scope/diag/unmatched", { suffixes: [] })).toEqual(failure());
    expect(
      resolveModuleURL("@scope/diag/unmatched", { from, suffixes: [], try: true }),
    ).toBeUndefined();
  });

  it("adds the metadata to errors of resolveModulePath and resolvers", () => {
    const resolver = createResolver({ from, cache: false });
    expect(relative(dir, resolver.resolveModulePath("@scope/diag/p/a", {}))).toBe("a.js");
    expect(outcome("@scope/diag/default-null", {}, resolver.resolveModuleURL)).toEqual(
      failure(NOT_EXPORTED, "blocked"),
    );
    expect(outcome("@scope/diag/missing", {}, resolveModulePath)).toEqual(
      failure(NOT_FOUND, "missing-target"),
    );
    expect(resolveModulePath("@scope/diag/missing", { from, try: true })).toBeUndefined();
  });

  it("caches the metadata in the existing cache entry until it is cleared", () => {
    const cache = new Map<string, unknown>();
    const options = { cache };
    const first = outcome("@scope/diag/unmatched", options);
    expect(first).toEqual(failure(NOT_EXPORTED, "unmatched-conditions"));
    expect(cache.size).toBe(1);

    let thrown: ResolveError | undefined;
    try {
      resolveModuleURL("@scope/diag/unmatched", { from, cache });
    } catch (error) {
      thrown = error as ResolveError;
    }
    expect(Object.keys(thrown!)).toEqual(["code"]);
    for (const [key, value] of [
      ["resolveCode", NOT_EXPORTED],
      ["resolveReason", "unmatched-conditions"],
    ] as const) {
      expect(Object.getOwnPropertyDescriptor(thrown, key)).toEqual({
        value,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
    thrown!.resolveCode = "CHANGED";
    thrown!.resolveReason = "blocked";
    expect(resolveModuleURL("@scope/diag/unmatched", { from, cache, try: true })).toBeUndefined();

    try {
      writeManifest({ ...exportsMap, "./unmatched": null });
      expect(outcome("@scope/diag/unmatched", options)).toEqual(first);
      expect(outcome("@scope/diag/unmatched")).toEqual(failure(NOT_EXPORTED, "blocked"));
      cache.clear();
      expect(outcome("@scope/diag/unmatched", options)).toEqual(failure(NOT_EXPORTED, "blocked"));
    } finally {
      writeManifest(exportsMap);
    }
  });
});
