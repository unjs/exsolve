import { lstatSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { moduleResolve } from "./internal/resolve.ts";
import { nodeBuiltins } from "./internal/builtins.ts";

const DEFAULT_CONDITIONS = ["node", "import"];
const DEFAULT_CONDITIONS_SET = /* #__PURE__ */ new Set(DEFAULT_CONDITIONS);

const isWindows = /* #__PURE__ */ (() => process.platform === "win32")();

const globalCache = /* #__PURE__ */ (() =>
  // eslint-disable-next-line unicorn/no-unreadable-iife
  ((globalThis as any)["__EXSOLVE_CACHE__"] ||= new Map()))() as Map<
  string,
  unknown
>;

type CacheValue = string | Error;

type CacheEntry = {
  id: string;
  conditions: unknown[];
  extensions?: unknown[];
  from?: {
    array: boolean;
    values: unknown[];
  };
  suffixes?: unknown[];
  value: CacheValue;
};

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
  let url = (parsedInput as { url: URL }).url;
  let absolutePath = (parsedInput as { absolutePath: string }).absolutePath;
  const cacheId = absolutePath || specifier;

  // Check for cache
  let cacheKey: string | undefined;
  let cacheObj: Map<string, unknown> | undefined;
  if (options?.cache !== false) {
    cacheKey = _cacheKey(cacheId, options);
    cacheObj =
      options?.cache && typeof options?.cache === "object"
        ? options.cache
        : globalCache;
  }

  if (cacheObj) {
    const cached = _getCacheValue(cacheObj, cacheKey!, cacheId, options);
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
      const stat = lstatSync(absolutePath);

      if (stat.isSymbolicLink()) {
        absolutePath = realpathSync(absolutePath);
        url = pathToFileURL(absolutePath);
      }

      if (stat.isFile()) {
        if (cacheObj) {
          _setCacheValue(cacheObj, cacheKey!, cacheId, options, url.href);
        }
        return url.href;
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        if (cacheObj) {
          _setCacheValue(cacheObj, cacheKey!, cacheId, options, error);
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
  const target = specifier || url.href;
  const bases: URL[] = _normalizeBases(options?.from);
  const suffixes = options?.suffixes || [""];
  const extensions = options?.extensions ? ["", ...options.extensions] : [""];
  let resolved: URL | undefined;
  for (const base of bases) {
    for (const suffix of suffixes) {
      let name = _join(target, suffix);
      if (name === ".") {
        name += "/.";
      }
      for (const extension of extensions) {
        resolved = _tryModuleResolve(name + extension, base, conditionsSet);
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
      _setCacheValue(cacheObj, cacheKey!, cacheId, options, error);
    }

    if (options?.try) {
      return undefined as any;
    }

    throw error;
  }

  if (cacheObj) {
    _setCacheValue(cacheObj, cacheKey!, cacheId, options, resolved.href);
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

// Avoid serializing options on warm lookups. Exact snapshots in each hash
// bucket ensure that collisions cannot return a result for different options.
function _cacheKey(id: string, options?: ResolveOptions) {
  let hash = _hashValue(2_166_136_261, id);
  hash = _hashArray(hash, options?.conditions || DEFAULT_CONDITIONS);
  hash = _hashArray(hash, options?.extensions);
  hash = _hashArray(hash, _fromArray(options?.from));
  hash = _hashArray(hash, options?.suffixes);
  return `\0exsolve:v2:${hash >>> 0}`;
}

function _getCacheValue(
  cache: Map<string, unknown>,
  key: string,
  id: string,
  options?: ResolveOptions,
): CacheValue | undefined {
  const entries = cache.get(key);
  if (!Array.isArray(entries)) {
    return;
  }
  for (const entry of entries as CacheEntry[]) {
    if (entry.id === id && _sameCacheOptions(entry, options)) {
      return entry.value;
    }
  }
}

function _setCacheValue(
  cache: Map<string, unknown>,
  key: string,
  id: string,
  options: ResolveOptions | undefined,
  value: CacheValue,
) {
  const cached = cache.get(key);
  const entries: CacheEntry[] = Array.isArray(cached) ? cached : [];
  const entry = entries.find(
    (entry) => entry.id === id && _sameCacheOptions(entry, options),
  );
  if (entry) {
    entry.value = value;
  } else {
    entries.push({
      id,
      conditions: _snapshotArray(options?.conditions || DEFAULT_CONDITIONS)!,
      extensions: _snapshotArray(options?.extensions),
      from:
        options?.from === undefined
          ? undefined
          : {
              array: Array.isArray(options.from),
              values: _snapshotArray(_fromArray(options.from))!,
            },
      suffixes: _snapshotArray(options?.suffixes),
      value,
    });
  }
  cache.set(key, entries);
}

function _sameCacheOptions(entry: CacheEntry, options?: ResolveOptions) {
  return (
    _sameArray(entry.conditions, options?.conditions || DEFAULT_CONDITIONS) &&
    _sameArray(entry.extensions, options?.extensions) &&
    _sameFrom(entry.from, options?.from) &&
    _sameArray(entry.suffixes, options?.suffixes)
  );
}

function _sameArray(a?: unknown[], b?: unknown[]) {
  if (!a || !b) {
    return a === b;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (const [index, value] of a.entries()) {
    if (value !== _cacheValue(b[index])) {
      return false;
    }
  }
  return true;
}

function _sameFrom(cached?: CacheEntry["from"], from?: ResolveOptions["from"]) {
  if (!cached || from === undefined) {
    return !cached && from === undefined;
  }
  if (cached.array !== Array.isArray(from)) {
    return false;
  }
  return _sameArray(cached.values, Array.isArray(from) ? from : [from]);
}

function _snapshotArray(values?: unknown[]) {
  return values?.map(_cacheValue);
}

function _fromArray(from?: ResolveOptions["from"]) {
  if (Array.isArray(from) || from === undefined) {
    return from;
  }
  return [from];
}

function _cacheValue(value: unknown) {
  return _isURL(value) ? value.href : value;
}

function _hashArray(hash: number, values?: unknown[]) {
  hash = Math.imul(hash ^ (values ? values.length + 1 : 0), 16_777_619);
  if (!values) {
    return hash;
  }
  for (const value of values) {
    hash = _hashValue(hash, value);
  }
  return hash;
}

function _hashValue(hash: number, value: unknown) {
  const cached = _cacheValue(value);
  const string = typeof cached === "string" ? cached : String(cached);
  hash = Math.imul(hash ^ string.length, 16_777_619);
  for (let index = 0; index < string.length; index++) {
    hash = Math.imul(hash ^ string.codePointAt(index)!, 16_777_619);
  }
  return hash;
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
  return input instanceof URL || input?.constructor?.name === "URL" /* #25 */;
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
