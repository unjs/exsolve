import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { builtinModules } from "node:module";
import { moduleResolve } from "./internal/resolve.ts";

const DEFAULT_CONDITIONS_SET = /* #__PURE__ */ new Set(["node", "import"]);

const NOT_FOUND_ERRORS = /* #__PURE__ */ new Set([
  "ERR_MODULE_NOT_FOUND",
  "ERR_UNSUPPORTED_DIR_IMPORT",
  "MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_PACKAGE_IMPORT_NOT_DEFINED",
]);

const globalCache = /* #__PURE__ */ (() =>
  // eslint-disable-next-line unicorn/no-unreadable-iife
  ((globalThis as any)["__EXSOLVE_CACHE__"] ||= new Map()))() as Map<
  string,
  unknown
>;

/**
 * Options to configure module resolution.
 */
export type ResolveOptions = {
  /**
   * A URL, path, or array of URLs/paths from which to resolve the module.
   * If not provided, resolution starts from the current working directory.
   * You can use `import.meta.url` to mimic the behavior of `import.meta.resolve()`.
   * For better performance, use a `file://` URL or path that ends with `/`.
   */
  from?: string | URL | (string | URL)[];

  /**
   * Resolve cache (enabled by default with a shared global object).
   * Can be set to `false` to disable or a custom `Map` to bring your own cache object.
   */
  cache?: boolean | Map<string, unknown>;

  /**
   * Additional file extensions to check.
   * For better performance, use explicit extensions and avoid this option.
   */
  extensions?: string[];

  /**
   * Conditions to apply when resolving package exports.
   * Defaults to `["node", "import"]`.
   * Conditions are applied without order.
   */
  conditions?: string[];

  /**
   * Path suffixes to check.
   * For better performance, use explicit paths and avoid this option.
   * Example: `["", "/index"]`
   */
  suffixes?: string[];

  /**
   * If set to `true` and the module cannot be resolved,
   * the resolver returns `undefined` instead of throwing an error.
   */
  try?: boolean;
};

export type ResolverOptions = Omit<ResolveOptions, "try">;

type ResolveRes<Opts extends ResolveOptions> = Opts["try"] extends true
  ? string | undefined
  : string;

/**
 * Synchronously resolves a module url based on the options provided.
 *
 * @param {string} input - The identifier or path of the module to resolve.
 * @param {ResolveOptions} [options] - Options to resolve the module. See {@link ResolveOptions}.
 * @returns {string} The resolved URL as a string.
 */
export function resolveModuleURL<O extends ResolveOptions>(
  input: string | URL,
  options?: O,
): ResolveRes<O> {
  const parsedInput = _parseInput(input);

  if ("external" in parsedInput) {
    return parsedInput.external as ResolveRes<O>;
  }

  const specifier = (parsedInput as { specifier: string }).specifier;
  const url = (parsedInput as { url: URL }).url;
  const absolutePath = (parsedInput as { absolutePath: string }).absolutePath;

  // Check for cache
  let cacheKey: string | undefined;
  let cacheObj: Map<string, unknown> | undefined;
  if (options?.cache !== false) {
    cacheKey = _cacheKey(absolutePath || specifier, options);
    cacheObj =
      options?.cache && typeof options?.cache === "object"
        ? options.cache
        : globalCache;
  }

  if (cacheObj) {
    const cached = cacheObj.get(cacheKey!);
    if (typeof cached === "string") {
      return cached;
    }
    if (cached instanceof Error) {
      if (options?.try) {
        return undefined as any;
      }
      throw cached;
    }
  }

  // Absolute path to file (fast path)
  if (absolutePath) {
    try {
      if (statSync(absolutePath).isFile()) {
        if (cacheObj) {
          cacheObj.set(cacheKey!, url.href);
        }
        return url.href;
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        if (cacheObj) {
          cacheObj.set(cacheKey!, error);
        }
        throw error;
      }
    }
  }

  // Condition set
  const conditionsSet = options?.conditions
    ? new Set(options.conditions)
    : DEFAULT_CONDITIONS_SET;

  // Search through bases
  const bases: URL[] = _normalizeBases(options?.from);
  const suffixes = options?.suffixes || [""];
  const extensions = options?.extensions ? ["", ...options.extensions] : [""];
  let resolved: URL | undefined;
  for (const base of bases) {
    for (const suffix of suffixes) {
      for (const extension of extensions) {
        resolved = _tryModuleResolve(
          _join(specifier || url.href, suffix) + extension,
          base,
          conditionsSet,
        );
        if (resolved) {
          break;
        }
      }
      if (resolved) {
        break;
      }
    }
    if (resolved) {
      break;
    }
  }

  // Throw error if not found
  if (!resolved) {
    const error = new Error(
      `Cannot resolve module "${input}" (from: ${bases.map((u) => _fmtPath(u)).join(", ")})`,
    );
    // @ts-ignore
    error.code = "ERR_MODULE_NOT_FOUND";

    if (cacheObj) {
      cacheObj.set(cacheKey!, error);
    }

    if (options?.try) {
      return undefined as any;
    }

    throw error;
  }

  if (cacheObj) {
    cacheObj.set(cacheKey!, resolved.href);
  }

  return resolved.href;
}

/**
 * Synchronously resolves a module then converts it to a file path
 *
 * (throws error if reolved path is not file:// scheme)
 *
 * @param {string} id - The identifier or path of the module to resolve.
 * @param {ResolveOptions} [options] - Options to resolve the module. See {@link ResolveOptions}.
 * @returns {string} The resolved URL as a string.
 */
export function resolveModulePath<O extends ResolveOptions>(
  id: string | URL,
  options?: O,
): ResolveRes<O> {
  const resolved = resolveModuleURL(id, options);
  return (resolved ? fileURLToPath(resolved) : undefined) as ResolveRes<O>;
}

export function createResolver(defaults?: ResolverOptions) {
  if (defaults?.from) {
    defaults = {
      ...defaults,
      from: _normalizeBases(defaults?.from),
    };
  }
  return {
    resolveModuleURL: <O extends ResolveOptions>(
      id: string | URL,
      opts: ResolveOptions,
    ): ResolveRes<O> => resolveModuleURL(id, { ...defaults, ...opts }),
    resolveModulePath: <O extends ResolveOptions>(
      id: string | URL,
      opts: ResolveOptions,
    ): ResolveRes<O> => resolveModulePath(id, { ...defaults, ...opts }),
    clearResolveCache: () => {
      if (defaults?.cache !== false) {
        if (defaults?.cache && typeof defaults?.cache === "object") {
          defaults.cache.clear();
        } else {
          globalCache.clear();
        }
      }
    },
  };
}

export function clearResolveCache() {
  globalCache.clear();
}

// --- Internal ---

function _tryModuleResolve(
  specifier: string,
  base: URL,
  conditions: any,
): URL | undefined {
  try {
    return moduleResolve(specifier, base, conditions);
  } catch (error: any) {
    if (!NOT_FOUND_ERRORS.has(error?.code)) {
      throw error;
    }
  }
}

function _normalizeBases(inputs: unknown): URL[] {
  const urls = (Array.isArray(inputs) ? inputs : [inputs]).flatMap((input) =>
    _normalizeBase(input),
  );
  if (urls.length === 0) {
    return [pathToFileURL("./")];
  }
  return urls;
}

function _normalizeBase(input: unknown): URL | URL[] {
  if (!input) {
    return [];
  }
  if (input instanceof URL) {
    return [input];
  }
  if (typeof input !== "string") {
    return [];
  }
  if (/^(?:node|data|http|https|file):/.test(input)) {
    return new URL(input);
  }
  try {
    if (input.endsWith("/") || statSync(input).isDirectory()) {
      return pathToFileURL(input + "/");
    }
    return pathToFileURL(input);
  } catch {
    return [pathToFileURL(input + "/"), pathToFileURL(input)];
  }
}

function _fmtPath(input: URL | string) {
  try {
    return fileURLToPath(input);
  } catch {
    return input;
  }
}

function _cacheKey(id: string, opts?: ResolveOptions) {
  return JSON.stringify([
    id,
    (opts?.conditions || ["node", "import"]).sort(),
    opts?.extensions,
    opts?.from,
    opts?.suffixes,
  ]);
}

function _join(a: string, b: string): string {
  if (!a || !b || b === "/") {
    return a;
  }
  return (a.endsWith("/") ? a : a + "/") + (b.startsWith("/") ? b.slice(1) : b);
}

function _parseInput(
  input: string | URL,
):
  | { url: URL; absolutePath: string }
  | { external: string }
  | { specifier: string } {
  if (typeof input === "string") {
    if (input.startsWith("file:")) {
      const url = new URL(input);
      return { url, absolutePath: fileURLToPath(url) };
    }

    if (isAbsolute(input)) {
      return { url: pathToFileURL(input), absolutePath: input };
    }

    if (/^(?:node|data|http|https):/.test(input)) {
      return { external: input };
    }

    if (builtinModules.includes(input)) {
      return { external: `node:${input}` };
    }

    return { specifier: input };
  }

  if (input instanceof URL) {
    if (input.protocol === "file:") {
      return { url: input, absolutePath: fileURLToPath(input) };
    }
    return { external: input.href };
  }

  throw new TypeError("id must be a `string` or `URL`");
}
