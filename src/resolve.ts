import { realpathSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { moduleResolve } from "./internal/resolve.ts";
import { setPackageJSONCache } from "./internal/package-json-reader.ts";
import type { PackageConfig } from "./internal/package-json-reader.ts";
import { nodeBuiltins } from "./internal/builtins.ts";

const DEFAULT_CONDITIONS_SET = /* #__PURE__ */ new Set(["node", "import"]);
const DEFAULT_CONDITIONS_KEY = "2:6:import4:node";

const isWindows = /* #__PURE__ */ (() => process.platform === "win32")();

const globalCache = /* #__PURE__ */ (() =>
  // eslint-disable-next-line unicorn/no-unreadable-iife
  ((globalThis as any)["__EXSOLVE_CACHE__"] ||= new Map()))() as Map<string, unknown>;

// package.json reads, kept for as long as the resolve cache they were made for
const packageJSONCaches = /* #__PURE__ */ new WeakMap<
  Map<string, unknown>,
  Map<string, PackageConfig>
>();

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

  /**
   * If set to `true`, symlinks are not resolved to their real path during resolution.
   */
  preserveSymlinks?: boolean;
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
  let url = (parsedInput as { url: URL }).url;
  const absolutePath = (parsedInput as { absolutePath: string }).absolutePath;

  // Check for cache
  let cacheKey: string | undefined;
  let cacheObj: Map<string, unknown> | undefined;
  if (options?.cache !== false) {
    cacheKey = _cacheKey(absolutePath ? url.href : specifier, options, !!absolutePath);
    cacheObj = options?.cache && typeof options?.cache === "object" ? options.cache : globalCache;
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
      throw _copyError(cached);
    }
  }

  // Absolute path to file (fast path)
  if (absolutePath) {
    try {
      const stat = statSync(absolutePath);

      if (stat.isFile()) {
        // Resolve symlinks in any segment (not only the last one), like `finalizeResolution`
        const realPath = options?.preserveSymlinks ? absolutePath : realpathSync(absolutePath);
        if (realPath !== absolutePath) {
          const { search, hash } = url;
          url = pathToFileURL(realPath);
          url.search = search;
          url.hash = hash;
        }
        if (cacheObj) {
          cacheObj.set(cacheKey!, url.href);
        }
        return url.href;
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        if (cacheObj) {
          _cacheError(cacheObj, cacheKey!, error);
        }
        if (options?.try) {
          return undefined as any;
        }
        throw error;
      }
    }
  }

  // Condition set
  const conditionsSet = options?.conditions ? new Set(options.conditions) : DEFAULT_CONDITIONS_SET;

  // Search through bases
  let target = specifier;
  if (absolutePath) {
    // Append suffixes and extensions before search and hash (restored after resolution)
    const targetURL = new URL(url);
    targetURL.search = "";
    targetURL.hash = "";
    target = targetURL.href;
  }
  // Absolute inputs don't depend on the base, so probe them once
  const bases: URL[] = absolutePath ? [url] : _normalizeBases(options?.from);
  const suffixes = options?.suffixes || [""];
  const extensions = options?.extensions ? ["", ...options.extensions] : [""];
  let resolved: URL | undefined;
  // `_tryModuleResolve` does not throw, so the previous cache is always restored
  const previousPackageJSONCache = setPackageJSONCache(_packageJSONCache(cacheObj));
  for (const base of bases) {
    for (const suffix of suffixes) {
      let name = _join(target, suffix);
      if (name === ".") {
        name += "/.";
      }
      for (const extension of extensions) {
        resolved = _tryModuleResolve(
          name + extension,
          base,
          conditionsSet,
          options?.preserveSymlinks,
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
  setPackageJSONCache(previousPackageJSONCache);

  // Throw error if not found
  if (!resolved) {
    const from = absolutePath ? _normalizeBases(options?.from) : bases;
    const error = new Error(
      `Cannot resolve module "${input}" (from: ${from.map((u) => _fmtPath(u)).join(", ")})`,
    );
    // @ts-ignore
    error.code = "ERR_MODULE_NOT_FOUND";

    if (cacheObj) {
      _cacheError(cacheObj, cacheKey!, error);
    }

    if (options?.try) {
      return undefined as any;
    }

    throw error;
  }

  if (absolutePath) {
    resolved.search = url.search;
    resolved.hash = url.hash;
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
  if (!resolved) {
    return undefined as ResolveRes<O>;
  }
  if (!resolved.startsWith("file://") && options?.try) {
    return undefined as ResolveRes<O>;
  }
  const absolutePath = fileURLToPath(resolved);
  return isWindows ? _normalizeWinPath(absolutePath) : absolutePath;
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
          packageJSONCaches.delete(defaults.cache);
        } else {
          clearResolveCache();
        }
      }
    },
  };
}

export function clearResolveCache() {
  globalCache.clear();
  packageJSONCaches.delete(globalCache);
}

// --- Internal ---

function _tryModuleResolve(
  specifier: string,
  base: URL,
  conditions: any,
  preserveSymlinks?: boolean,
): URL | undefined {
  try {
    return moduleResolve(specifier, base, conditions, preserveSymlinks);
  } catch {
    // ignore
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
  if (_isURL(input)) {
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

/**
 * Caches a copy of a resolve error without keeping its callers alive.
 *
 * Callers may change the errors they catch (bundlers set their own `code` or prefix the
 * message), so the thrown error is never cached and cache hits throw a new copy.
 *
 * V8 formats `error.stack` lazily. Until the first read, an error holds the raw call
 * sites, including each frame's receiver. A cached error lives as long as the cache,
 * so the copy gets the formatted stack rather than keep the caller alive (for example
 * a bundler's plugin context and the whole module graph behind it).
 */
function _cacheError(cache: Map<string, unknown>, key: string, error: Error) {
  const copy = _copyError(error);
  copy.stack = error.stack;
  cache.set(key, copy);
}

/**
 * Copies an error with its class and own properties (`message`, `code`, `cause`, ...).
 * The copy's stack is the current one.
 */
function _copyError(error: Error): Error {
  const copy = new Error();
  Object.setPrototypeOf(copy, Object.getPrototypeOf(error));
  for (const key of Reflect.ownKeys(error)) {
    if (key !== "stack") {
      Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(error, key)!);
    }
  }
  return copy;
}

/**
 * Returns the package.json cache that belongs to a resolve cache, so that clearing the
 * resolve cache or passing a new one also drops package.json reads. Without a resolve
 * cache (`cache: false`), reads are only shared within one call.
 */
function _packageJSONCache(cacheObj: Map<string, unknown> | undefined) {
  if (!cacheObj) {
    return new Map<string, PackageConfig>();
  }
  let packageJSONCache = packageJSONCaches.get(cacheObj);
  if (!packageJSONCache) {
    packageJSONCache = new Map();
    packageJSONCaches.set(cacheObj, packageJSONCache);
  }
  return packageJSONCache;
}

function _cacheKey(id: string, options?: ResolveOptions, absolute?: boolean) {
  let from: (string | URL)[] | undefined;
  if (Array.isArray(options?.from)) {
    from = options.from;
  } else if (options?.from) {
    from = [options.from];
  }
  // Without an absolute `from`, the base is the current working directory. Absolute inputs
  // resolve the same from any base, so they can skip `process.cwd()` and the longer key.
  const cwd = !absolute && _usesCwd(from) ? [process.cwd()] : undefined;
  return (
    _cacheKeyValues([id]) +
    _cacheKeyValues(cwd) +
    _conditionsKey(options?.conditions) +
    _cacheKeyValues(options?.extensions) +
    _cacheKeyValues(from) +
    _cacheKeyValues(options?.suffixes) +
    (options?.preserveSymlinks ? "1" : "0")
  );
}

/**
 * Whether `_normalizeBases(from)` depends on the current working directory: it does when
 * `from` is missing or empty, or when one of its paths is relative.
 */
function _usesCwd(from: readonly unknown[] | undefined): boolean {
  let hasBase = false;
  for (const base of from || []) {
    if (_isURL(base)) {
      hasBase = true;
    } else if (typeof base === "string" && base) {
      if (!isAbsolute(base) && !/^(?:node|data|http|https|file):/.test(base)) {
        return true;
      }
      hasBase = true;
    }
  }
  return !hasBase;
}

function _conditionsKey(conditions?: string[]) {
  if (!conditions) {
    return DEFAULT_CONDITIONS_KEY;
  }
  return _cacheKeyValues([...new Set(conditions)].sort());
}

function _cacheKeyValues(values: readonly (string | URL)[] | undefined): string {
  if (!values) {
    return "-";
  }

  let key = `${values.length}:`;
  for (const value of values) {
    const stringValue = String(value);
    key += `${stringValue.length}:${stringValue}`;
  }
  return key;
}

function _join(a: string, b: string): string {
  if (!a || !b || b === "/") {
    return a;
  }
  return (a.endsWith("/") ? a : a + "/") + (b.startsWith("/") ? b.slice(1) : b);
}

function _normalizeWinPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^[a-z]:\//, (r) => r.toUpperCase());
}

function _isURL(input: unknown): input is URL {
  return input instanceof URL || input?.constructor?.name === "URL"; /* #25 */
}

function _parseInput(
  input: string | URL,
): { url: URL; absolutePath: string } | { external: string } | { specifier: string } {
  if (typeof input === "string") {
    if (input.startsWith("file:")) {
      const url = new URL(input);
      return { url, absolutePath: fileURLToPath(url) };
    }

    if (isAbsolute(input)) {
      // Check the same (normalized) path that is returned
      const url = pathToFileURL(input);
      return { url, absolutePath: fileURLToPath(url) };
    }

    if (/^(?:node|data|http|https):/.test(input)) {
      return { external: input };
    }

    if (nodeBuiltins.includes(input) && !input.includes(":")) {
      return { external: `node:${input}` };
    }

    return { specifier: input };
  }

  if (_isURL(input)) {
    if (input.protocol === "file:") {
      return { url: input, absolutePath: fileURLToPath(input) };
    }
    return { external: input.href };
  }

  throw new TypeError("id must be a `string` or `URL`");
}
