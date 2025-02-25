import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { builtinModules } from "node:module";
import { moduleResolve } from "./internal/resolve.ts";
import { extname } from "node:path";

const DEFAULT_CONDITIONS_SET = new Set(["node", "import"]);

const NOT_FOUND_ERRORS = new Set([
  "ERR_MODULE_NOT_FOUND",
  "ERR_UNSUPPORTED_DIR_IMPORT",
  "MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
]);

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
   * Additional file extensions to check as fallbacks.
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
   * Additional path suffixes to check as fallbacks.
   * Suffix fallbacks are skipped if the input ends with the same suffix.
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
  if (/(node|data|http|https):/.test(id)) {
    return id;
  }

  // Skip builtins
  if (builtinModules.includes(id)) {
    return "node:" + id;
  }

  // Enable fast path for file urls
  if (id.startsWith("file://")) {
    id = fileURLToPath(id);
  }

  // Skip resolve for absolute paths (fast path)
  if (isAbsolute(id)) {
    try {
      const stat = statSync(id);
      if (stat.isFile()) {
        return id;
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
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

  const extensionsToCheck = (extname(id) === "" /* no extension */ &&
    options?.extensions) || [""];

  const suffixesToCheck = ["", ...(options?.suffixes || [])];

  for (const url of urls) {
    // Try simple resolve
    resolved = _tryModuleResolve(id, url, conditionsSet);
    if (resolved) {
      break;
    }
    // Try other extensions and suffixes if not found
    for (const suffix of suffixesToCheck) {
      if (suffix && id.endsWith(suffix)) {
        continue;
      }
      for (const extension of extensionsToCheck) {
        if (!suffix && !extension) {
          continue;
        }
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
    if (options?.try) {
      return undefined as any;
    }
    const error = new Error(
      `Cannot resolve module "${id}" (from: ${urls.map((u) => _fmtPath(u)).join(", ")})`,
    );
    // @ts-ignore
    error.code = "ERR_MODULE_NOT_FOUND";
    throw error;
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
  return {
    resolveModuleURL: <O extends ResolveOptions>(
      id: string | URL,
      opts: ResolveOptions,
    ): ResolveRes<O> => resolveModuleURL(id, { ...defaults, ...opts }),
    resolveModulePath: <O extends ResolveOptions>(
      id: string | URL,
      opts: ResolveOptions,
    ): ResolveRes<O> => resolveModulePath(id, { ...defaults, ...opts }),
  };
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
