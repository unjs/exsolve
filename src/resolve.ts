import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { builtinModules } from "node:module";
import { moduleResolve } from "./internal/resolve.ts";
import { extname } from "node:path";

const DEFAULT_CONDITIONS_SET = /* #__PURE__ */ new Set(["node", "import"]);

const NOT_FOUND_ERRORS = /* #__PURE__ */ new Set([
  "ERR_MODULE_NOT_FOUND",
  "ERR_UNSUPPORTED_DIR_IMPORT",
  "MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
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
   *
   * Can be set to `false` to disable or a custom `Map` to bring your own cache object.
   */
  cache?: boolean | Map<string, unknown>;

  /**
   * Additional file extensions to check as fallback.
   * These are used only if the input does not have an explicit extension.
   * For better performance, use explicit extensions.
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
   * Suffixes are skipped if the input ends with the same suffix.
   *
   * @example ["", "/index"]
   *
   * For better performance, use explicit suffix like `/index` when needed.
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
 * @param {string} id - The identifier or path of the module to resolve.
 * @param {ResolveOptions} [options] - Options to resolve the module. See {@link ResolveOptions}.
 * @returns {string} The resolved URL as a string.
 */
export function resolveModuleURL<O extends ResolveOptions>(
  id: string | URL,
  options?: O,
): ResolveRes<O> {
  if (typeof id !== "string") {
    if (id instanceof URL) {
      id = fileURLToPath(id);
    } else {
      throw new TypeError("input must be a `string` or `URL`");
    }
  }

  // Skip if already has a protocol
  if (/^(?:node|data|http|https):/.test(id)) {
    return id;
  }

  // Skip builtins
  if (builtinModules.includes(id)) {
    return "node:" + id;
  }

  // Fast path for file urls
  if (id.startsWith("file://")) {
    id = fileURLToPath(id);
  }

  // Check for cache
  let cacheKey: string | undefined;
  let cacheObj: Map<string, unknown> | undefined;
  if (options?.cache !== false) {
    cacheKey = _cacheKey(id, options);
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

  // Skip resolve for absolute paths (fast path)
  if (isAbsolute(id)) {
    try {
      const stat = statSync(id);
      if (stat.isFile()) {
        const url = pathToFileURL(id);
        if (cacheObj) {
          cacheObj.set(cacheKey!, url);
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

  // Search paths
  const urls: URL[] = _normalizeResolveParents(options?.from);
  let resolved: URL | undefined;

  const suffixesToCheck = options?.suffixes || [""];

  const extensionsToCheck =
    extname(id) === "" /* no extension */
      ? ["", ...(options?.extensions || [])]
      : [""];

  for (const url of urls) {
    for (const suffix of suffixesToCheck) {
      if (suffix && id.endsWith(suffix)) {
        continue;
      }
      for (const extension of extensionsToCheck) {
        resolved = _tryModuleResolve(
          `${id}${suffix}`.replace(/\/+/g, "/") + extension,
          url,
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
      `Cannot resolve module "${id}" (from: ${urls.map((u) => _fmtPath(u)).join(", ")})`,
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

  const normalizedURL = /^[a-z]:[\\/]/i.test(resolved.href)
    ? pathToFileURL(resolved.href).href
    : resolved.href;

  if (cacheObj) {
    cacheObj.set(cacheKey!, normalizedURL);
  }

  return normalizedURL;
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
      from: _normalizeResolveParents(defaults?.from),
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
  id: string,
  url: URL,
  conditions: any,
): URL | undefined {
  try {
    return moduleResolve(id, url, conditions);
  } catch (error: any) {
    if (!NOT_FOUND_ERRORS.has(error?.code)) {
      throw error;
    }
  }
}

function _normalizeResolveParents(inputs: unknown): URL[] {
  const urls = (Array.isArray(inputs) ? inputs : [inputs]).flatMap((input) =>
    _normalizeResolveParent(input),
  );
  if (urls.length === 0) {
    return [pathToFileURL("./")];
  }
  return urls;
}

function _normalizeResolveParent(input: unknown): URL | URL[] {
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
