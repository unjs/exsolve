import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { resolveModuleURL, resolveModulePath, createResolver, clearResolveCache } from "../src";

const isWindows = process.platform === "win32";

vi.mock("node:module", () => {
  return {
    builtinModules: ["fs", "path", "url", "http", "https", "bun:sqlite"],
  };
});

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

    const absolutePath = fileURLToPath(new URL("fixture/hello.link.mjs", import.meta.url));
    const resolved3 = resolveModuleURL(absolutePath);
    expect(fileURLToPath(resolved3)).match(/fixture[/\\]hello\.mjs$/);

    // Keeps query and hash of absolute symlink inputs
    const resolved4 = resolveModuleURL(pathToFileURL(absolutePath).href + "?v=1#h", {
      suffixes: ["", "/index"],
    });
    expect(resolved4).match(/fixture\/hello\.mjs\?v=1#h$/);
  });

  it("preserves symlinks with preserveSymlinks: true", () => {
    const resolved = resolveModuleURL("./fixture/hello.link.mjs", {
      from: import.meta.url,
      preserveSymlinks: true,
    });
    expect(fileURLToPath(resolved)).match(/fixture[/\\]hello\.link\.mjs$/);

    const resolved2 = resolveModuleURL("./fixture/test.link.txt", {
      from: import.meta.url,
      preserveSymlinks: true,
    });
    expect(fileURLToPath(resolved2)).match(/fixture[/\\]test\.link\.txt$/);

    const absolutePath = fileURLToPath(new URL("fixture/hello.link.mjs", import.meta.url));
    const resolved3 = resolveModuleURL(absolutePath, { preserveSymlinks: true });
    expect(fileURLToPath(resolved3)).match(/fixture[/\\]hello\.link\.mjs$/);

    // Cache must not leak between preserveSymlinks modes
    const resolved4 = resolveModuleURL(absolutePath);
    expect(fileURLToPath(resolved4)).match(/fixture[/\\]hello\.mjs$/);

    // Absolute symlink inputs resolve as-is (no suffix or extension probing)
    const resolved5 = resolveModuleURL(pathToFileURL(absolutePath).href + "?v=1#h", {
      preserveSymlinks: true,
      suffixes: ["/index", ""],
    });
    expect(resolved5).match(/fixture\/hello\.link\.mjs\?v=1#h$/);
  });

  it("resolves node built-ints", () => {
    expect(resolveModuleURL("node:fs")).toBe("node:fs");
    expect(resolveModuleURL("fs")).toBe("node:fs");
    expect(resolveModuleURL("node:foo")).toBe("node:foo");
  });

  it("handles missing subpath imports", () => {
    const resolved = resolveModuleURL("#build/auth.js", {
      from: import.meta.url,
      try: true,
    });
    expect(resolved).toBeUndefined();
  });

  it("should resolve suffixes to real file", () => {
    const res = resolveModuleURL(fileURLToPath(new URL("fixture/foo", import.meta.url)), {
      from: import.meta.url,
      suffixes: ["/index"],
      extensions: [".mjs"],
    });
    expect(res).toMatch(/\.mjs$/);
  });

  it("should resolve `.` with empty suffix", () => {
    const res = resolveModuleURL(".", {
      from: new URL("fixture/foo/", import.meta.url).href,
      suffixes: [""],
      extensions: [".txt"],
    });
    expect(res).toMatch(/\.\.txt$/);
  });

  it("should resolve `.` with empty and additional suffixes", () => {
    const res = resolveModuleURL(".", {
      from: new URL("fixture/foo/", import.meta.url).href,
      suffixes: ["", "/index"],
      extensions: [".mjs"],
    });
    expect(res).toMatch(/index\.mjs$/);
  });

  it("resolve builtin modules", () => {
    expect(() => resolveModuleURL("unknown")).toThrowError();
    expect(resolveModuleURL("node:fs")).toBe("node:fs");
    expect(resolveModuleURL("fs")).toBe("node:fs");

    expect(resolveModuleURL("bun:sqlite")).toBe("bun:sqlite");
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

  it("throws error for built-ins", () => {
    expect(() => resolveModulePath("fs")).toThrow();
    expect(() => resolveModulePath("node:fs")).toThrow();
  });

  it("not throws error for built-ins when try", () => {
    expect(() => resolveModulePath("fs", { try: true })).not.toThrow();
    expect(() => resolveModulePath("node:fs", { try: true })).not.toThrow();

    expect(resolveModulePath("fs", { try: true })).toBeUndefined();
    expect(resolveModulePath("node:fs", { try: true })).toBeUndefined();
  });

  it("not throws error for invalid input when try", () => {
    expect(() => resolveModulePath(".foo", { try: true })).not.toThrow();
    expect(resolveModulePath(".foo", { try: true })).toBeUndefined();
  });
});

describe("resolve cache", () => {
  it("does not mutate conditions", () => {
    const conditions = ["node", "import"];
    Object.freeze(conditions);
    expect(
      resolveModuleURL("vitest", {
        from: import.meta.url,
        conditions,
      }),
    ).toMatch(/vitest/);
    expect(conditions).toEqual(["node", "import"]);
  });

  it("treats conditions as an unordered set", () => {
    const cache = new Map<string, unknown>();
    const conditions = ["development", "node", "import"];
    const options = {
      cache,
      from: import.meta.url,
      try: true,
    } as const;

    resolveModuleURL("missing-cache-entry", {
      ...options,
      conditions,
    });
    conditions.reverse();
    resolveModuleURL("missing-cache-entry", {
      ...options,
      conditions,
    });

    expect(cache).toHaveLength(1);

    conditions[0] = "production";
    resolveModuleURL("missing-cache-entry", {
      ...options,
      conditions,
    });

    expect(cache).toHaveLength(2);
  });

  it("does not keep the caller alive through a cached error", async () => {
    const { gc } = globalThis;
    if (!gc) {
      throw new Error("`gc` is not exposed; `vitest.config.ts` should pass `--expose-gc`");
    }

    const cache = new Map<string, unknown>();
    class Caller {
      resolve() {
        return resolveModuleURL("missing-retained-caller", {
          cache,
          from: import.meta.url,
          try: true,
        });
      }
    }

    let caller: Caller | undefined = new Caller();
    const ref = new WeakRef(caller);
    expect(caller.resolve()).toBeUndefined();
    expect(cache).toHaveLength(1);

    caller = undefined;
    // One `gc()` is not guaranteed to reclaim the target, so retry a few times. Creating or
    // dereferencing a `WeakRef` keeps its target alive until the current job ends, so yield
    // to the event loop before each pass.
    for (let attempt = 0; attempt < 10 && ref.deref(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      gc();
    }

    expect(ref.deref()).toBeUndefined();
  });

  it("separates bases and suffixes", () => {
    const cache = new Map<string, unknown>();
    const fixture = new URL("fixture/", import.meta.url);

    expect(
      resolveModuleURL("./hello", {
        cache,
        extensions: [".mjs"],
        from: fixture,
      }),
    ).toMatch(/hello\.mjs$/);
    expect(
      resolveModuleURL("./hello", {
        cache,
        extensions: [".mjs"],
        from: import.meta.url,
        try: true,
      }),
    ).toBeUndefined();

    expect(
      resolveModuleURL("./foo", {
        cache,
        extensions: [".mjs"],
        from: fixture,
        suffixes: ["/index"],
      }),
    ).toMatch(/foo\/index\.mjs$/);
    expect(
      resolveModuleURL("./foo", {
        cache,
        extensions: [".mjs"],
        from: fixture,
        suffixes: [""],
        try: true,
      }),
    ).toBeUndefined();
  });

  it("keeps the query and hash of `file:` inputs", () => {
    const cache = new Map<string, unknown>();
    const url = new URL("fixture/hello.mjs", import.meta.url).href;
    for (const suffix of ["?v=1", "?v=2", "#hash", ""]) {
      expect(resolveModuleURL(url + suffix, { cache })).toBe(url + suffix);
    }

    const missing = new URL("fixture/missing.mjs", import.meta.url).href;
    for (const query of ["?v=1", "?v=2"]) {
      expect(() => resolveModuleURL(missing + query, { cache })).toThrow(`missing.mjs${query}"`);
    }
  });

  it("does not share errors between callers", () => {
    const cache = new Map<string, unknown>();
    const catchError = () => {
      try {
        resolveModuleURL("missing-shared-error", { cache, from: import.meta.url });
      } catch (error) {
        return error as Error & { code?: string };
      }
      throw new Error("Expected an error");
    };

    // Callers may change the errors they catch (Rollup sets its own `code`)
    const first = catchError();
    first.code = "PLUGIN_ERROR";
    first.message = `Could not load: ${first.message}`;
    const second = catchError();
    second.code = "PLUGIN_ERROR";
    second.message = `Could not load: ${second.message}`;

    const third = catchError();
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
    expect(third.code).toBe("ERR_MODULE_NOT_FOUND");
    expect(third.message).toMatch(/^Cannot resolve module "missing-shared-error"/);
    expect(cache.get([...cache.keys()][0]!)).toMatchObject({ code: "ERR_MODULE_NOT_FOUND" });
  });

  it("keeps the class and own properties of a cached error", () => {
    class ResolveError extends Error {}
    const cache = new Map<string, unknown>();
    const options = { cache, from: import.meta.url };
    expect(resolveModuleURL("missing-error-properties", { ...options, try: true })).toBeUndefined();

    const cached = [...cache.values()][0] as Error;
    Object.setPrototypeOf(cached, ResolveError.prototype);
    Object.assign(cached, { cause: new Error("cause"), url: "file:///missing" });

    let error: unknown;
    try {
      resolveModuleURL("missing-error-properties", options);
    } catch (error_) {
      error = error_;
    }
    expect(error).not.toBe(cached);
    expect(error).toBeInstanceOf(ResolveError);
    expect(error).toMatchObject({
      message: cached.message,
      code: "ERR_MODULE_NOT_FOUND",
      cause: cached.cause,
      url: "file:///missing",
    });
  });

  it.skipIf(isWindows)("does not share file system errors between callers", () => {
    const dir = mkdtempSync(join(tmpdir(), "exsolve-"));
    try {
      symlinkSync("loop", join(dir, "loop"));
      const cache = new Map<string, unknown>();
      const input = join(dir, "loop", "index.mjs");
      const errors = [0, 1].map(() => {
        try {
          resolveModuleURL(input, { cache });
        } catch (error) {
          return error as Error;
        }
      });

      expect(errors[1]).not.toBe(errors[0]);
      for (const error of errors) {
        expect(error).toMatchObject({ code: "ELOOP", syscall: "lstat", path: input });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("separates working directories", () => {
    const cache = new Map<string, unknown>();
    const fixture = fileURLToPath(new URL("fixture/", import.meta.url));
    const cwd = vi.spyOn(process, "cwd");
    try {
      for (const from of [undefined, "./", ["./", import.meta.url]]) {
        cwd.mockReturnValue(fixture);
        expect(resolveModuleURL("./hello.mjs", { cache, from })).toMatch(/fixture\/hello\.mjs$/);
        expect(resolveModuleURL("./index.mjs", { cache, from, try: true })).toBeUndefined();

        cwd.mockReturnValue(join(fixture, "foo"));
        expect(resolveModuleURL("./index.mjs", { cache, from })).toMatch(/foo\/index\.mjs$/);
        expect(resolveModuleURL("./hello.mjs", { cache, from, try: true })).toBeUndefined();
      }

      // Absolute `from` and inputs do not depend on the working directory
      cwd.mockClear();
      resolveModuleURL("./hello.mjs", { cache, from: new URL("fixture/", import.meta.url) });
      resolveModuleURL(new URL("fixture/hello.mjs", import.meta.url), { cache });
      expect(cwd).not.toHaveBeenCalled();
    } finally {
      cwd.mockRestore();
    }
  });
});

describe("package.json cache", () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "exsolve-"));
    mkdirSync(join(dir, "src"));
    for (const name of ["a", "b"]) {
      writeFileSync(join(dir, "src", `${name}.mjs`), "");
    }
    return {
      from: pathToFileURL(join(dir, "index.mjs")),
      setTarget: (name: string) =>
        writeFileSync(
          join(dir, "package.json"),
          JSON.stringify({ imports: { "#target": `./src/${name}.mjs` } }),
        ),
      [Symbol.dispose]: () => rmSync(dir, { recursive: true, force: true }),
    };
  }

  it("is cleared by `clearResolveCache`", () => {
    using pkg = setup();
    pkg.setTarget("a");
    expect(resolveModuleURL("#target", { from: pkg.from })).toMatch(/a\.mjs$/);

    pkg.setTarget("b");
    clearResolveCache();
    expect(resolveModuleURL("#target", { from: pkg.from })).toMatch(/b\.mjs$/);
  });

  it("is cleared by a resolver's `clearResolveCache`", () => {
    using pkg = setup();
    const resolver = createResolver({ cache: new Map(), from: pkg.from });
    pkg.setTarget("a");
    expect(resolver.resolveModuleURL("#target", {})).toMatch(/a\.mjs$/);

    pkg.setTarget("b");
    resolver.clearResolveCache();
    expect(resolver.resolveModuleURL("#target", {})).toMatch(/b\.mjs$/);
  });

  it("is not shared between resolve caches", () => {
    using pkg = setup();
    pkg.setTarget("a");
    expect(resolveModuleURL("#target", { from: pkg.from, cache: new Map() })).toMatch(/a\.mjs$/);

    pkg.setTarget("b");
    expect(resolveModuleURL("#target", { from: pkg.from, cache: new Map() })).toMatch(/b\.mjs$/);
  });

  it("is cleared after relinking a package with `preserveSymlinks`", () => {
    using pkg = setup();
    const store = fileURLToPath(new URL("store/", pkg.from));
    for (const version of ["1", "2"]) {
      mkdirSync(join(store, version), { recursive: true });
      writeFileSync(join(store, version, `v${version}.mjs`), "");
      writeFileSync(
        join(store, version, "package.json"),
        JSON.stringify({ imports: { "#version": `./v${version}.mjs` } }),
      );
    }
    // `pnpm up` relinks `node_modules/pkg` to the new version
    const link = fileURLToPath(new URL("node_modules/pkg", pkg.from));
    mkdirSync(join(link, ".."));
    const options = { from: pathToFileURL(join(link, "index.mjs")), preserveSymlinks: true };

    symlinkSync(join(store, "1"), link, "junction");
    expect(resolveModuleURL("#version", options)).toMatch(/node_modules\/pkg\/v1\.mjs$/);

    rmSync(link);
    symlinkSync(join(store, "2"), link, "junction");
    clearResolveCache();
    expect(resolveModuleURL("#version", options)).toMatch(/node_modules\/pkg\/v2\.mjs$/);
  });

  it("is not used with `cache: false`", () => {
    using pkg = setup();
    pkg.setTarget("a");
    expect(resolveModuleURL("#target", { from: pkg.from, cache: false })).toMatch(/a\.mjs$/);

    pkg.setTarget("b");
    expect(resolveModuleURL("#target", { from: pkg.from, cache: false })).toMatch(/b\.mjs$/);
  });
});

describe.runIf(isWindows)("windows", () => {
  it("normalizes drive letter and slashes", () => {
    for (const input of [
      "./fixture/hello.mjs",
      new URL("fixture/hello.mjs", import.meta.url),
      new URL("fixture/hello.mjs", import.meta.url).href.toLowerCase(),
    ]) {
      const resolved = resolveModulePath(input, {
        from: import.meta.url,
      });
      expect(resolved).to.not.include("\\");
      expect(resolved).to.include("/");
      const DRIVE_LETTER_RE = /^\w(?=:)/;
      const resolvedDriveLetter = resolved.match(DRIVE_LETTER_RE)![0];
      expect(resolvedDriveLetter).toBe(resolvedDriveLetter.toUpperCase());
    }
  });
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
    [String.raw`C:\non\existent`, ["file:///C:/non/existent/", "file:///C:/non/existent"]],
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
