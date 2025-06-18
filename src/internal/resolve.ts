// Source:  https://github.com/nodejs/node/blob/main/lib/internal/modules/esm/resolve.js
// Changes: https://github.com/nodejs/node/commits/main/lib/internal/modules/esm/resolve.js?since=2025-02-24
// TODO: https://github.com/nodejs/node/commit/fb852798dcd3aceeeabbb07bc4b622157b7826e1#diff-b4c24f634e3741e5ad9e8c29864a48f2bd284a9d66d8fed3d077ccee0c44087b

import type { Stats } from "node:fs";
import type { ErrnoException } from "./errors.ts";
import type { PackageConfig } from "./package-json-reader.ts";

import assert from "node:assert";
import process from "node:process";
import path from "node:path";
import { statSync, realpathSync } from "node:fs";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { nodeBuiltins } from "./builtins";

import { defaultGetFormatWithoutErrors } from "./get-format.ts";
import { getPackageScopeConfig, read } from "./package-json-reader.ts";

import {
  ERR_INVALID_MODULE_SPECIFIER,
  ERR_INVALID_PACKAGE_CONFIG,
  ERR_INVALID_PACKAGE_TARGET,
  ERR_MODULE_NOT_FOUND,
  ERR_PACKAGE_IMPORT_NOT_DEFINED,
  ERR_PACKAGE_PATH_NOT_EXPORTED,
  ERR_UNSUPPORTED_DIR_IMPORT,
  ERR_UNSUPPORTED_RESOLVE_REQUEST,
} from "./errors.ts";

const RegExpPrototypeSymbolReplace = RegExp.prototype[Symbol.replace];

const own = {}.hasOwnProperty;

const invalidSegmentRegEx =
  /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))?(\\|\/|$)/i;

const deprecatedInvalidSegmentRegEx =
  /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))(\\|\/|$)/i;

const invalidPackageNameRegEx = /^\.|%|\\/;

const patternRegEx = /\*/g;

const encodedSeparatorRegEx = /%2f|%5c/i;

const emittedPackageWarnings: Set<string> = new Set();

const doubleSlashRegEx = /[/\\]{2}/;

export function isURL(input: { href: string } | URL): boolean {
  return !!input.href || input instanceof URL;
}

function emitInvalidSegmentDeprecation(
  target: string,
  request: string,
  match: string,
  packageJsonUrl: URL,
  internal: boolean,
  base: URL,
  isTarget: boolean,
) {
  // @ts-expect-error: apparently it does exist, TS.
  if (process.noDeprecation) {
    return;
  }

  const pjsonPath = fileURLToPath(packageJsonUrl);
  const double = doubleSlashRegEx.exec(isTarget ? target : request) !== null;
  process.emitWarning(
    `Use of deprecated ${
      double ? "double slash" : "leading or trailing slash matching"
    } resolving "${target}" for module ` +
      `request "${request}" ${
        request === match ? "" : `matched to "${match}" `
      }in the "${
        internal ? "imports" : "exports"
      }" field module resolution of the package at ${pjsonPath}${
        base ? ` imported from ${fileURLToPath(base)}` : ""
      }.`,
    "DeprecationWarning",
    "DEP0166",
  );
}

function emitLegacyIndexDeprecation(
  url: URL,
  packageJsonUrl: URL,
  base: URL,
  main?: string,
): void {
  // @ts-expect-error: apparently it does exist, TS.
  if (process.noDeprecation) {
    return;
  }

  const format = defaultGetFormatWithoutErrors(url, { parentURL: base.href });
  if (format !== "module") return;
  const urlPath = fileURLToPath(url.href);
  const packagePath = fileURLToPath(new URL(".", packageJsonUrl));
  const basePath = fileURLToPath(base);
  if (!main) {
    process.emitWarning(
      `No "main" or "exports" field defined in the package.json for ${packagePath} resolving the main entry point "${urlPath.slice(
        packagePath.length,
      )}", imported from ${basePath}.\nDefault "index" lookups for the main are deprecated for ES modules.`,
      "DeprecationWarning",
      "DEP0151",
    );
  } else if (path.resolve(packagePath, main) !== urlPath) {
    process.emitWarning(
      `Package ${packagePath} has a "main" field set to "${main}", ` +
        `excluding the full filename and extension to the resolved file at "${urlPath.slice(
          packagePath.length,
        )}", imported from ${basePath}.\n Automatic extension resolution of the "main" field is ` +
        "deprecated for ES modules.",
      "DeprecationWarning",
      "DEP0151",
    );
  }
}

function tryStatSync(path: string): Stats | undefined {
  // Note: from Node 15 onwards we can use `throwIfNoEntry: false` instead.
  try {
    return statSync(path);
  } catch {
    // Note: in Node code this returns `new Stats`,
    // but in Node 22 that’s marked as a deprecated internal API.
    // Which, well, we kinda are, but still to prevent that warning,
    // just yield `undefined`.
  }
}

/**
 * Legacy CommonJS main resolution:
 * 1. let M = pkg_url + (json main field)
 * 2. TRY(M, M.js, M.json, M.node)
 * 3. TRY(M/index.js, M/index.json, M/index.node)
 * 4. TRY(pkg_url/index.js, pkg_url/index.json, pkg_url/index.node)
 * 5. NOT_FOUND
 */
function fileExists(url: URL): boolean {
  const stats = statSync(url, { throwIfNoEntry: false });
  const isFile = stats ? stats.isFile() : undefined;
  return isFile === null || isFile === undefined ? false : isFile;
}

function legacyMainResolve(
  packageJsonUrl: URL,
  packageConfig: PackageConfig,
  base: URL,
): URL {
  let guess: URL | undefined;
  if (packageConfig.main !== undefined) {
    guess = new URL(packageConfig.main, packageJsonUrl);
    // Note: fs check redundances will be handled by Descriptor cache here.
    if (fileExists(guess)) return guess;

    const tries = [
      `./${packageConfig.main}.js`,
      `./${packageConfig.main}.json`,
      `./${packageConfig.main}.node`,
      `./${packageConfig.main}/index.js`,
      `./${packageConfig.main}/index.json`,
      `./${packageConfig.main}/index.node`,
    ];
    let i = -1;

    while (++i < tries.length) {
      guess = new URL(tries[i]!, packageJsonUrl);
      if (fileExists(guess)) break;
      guess = undefined;
    }

    if (guess) {
      emitLegacyIndexDeprecation(
        guess,
        packageJsonUrl,
        base,
        packageConfig.main,
      );
      return guess;
    }
    // Fallthrough.
  }

  const tries = ["./index.js", "./index.json", "./index.node"];
  let i = -1;

  while (++i < tries.length) {
    guess = new URL(tries[i]!, packageJsonUrl);
    if (fileExists(guess)) break;
    guess = undefined;
  }

  if (guess) {
    emitLegacyIndexDeprecation(guess, packageJsonUrl, base, packageConfig.main);
    return guess;
  }

  // Not found.
  throw new ERR_MODULE_NOT_FOUND(
    fileURLToPath(new URL(".", packageJsonUrl)),
    fileURLToPath(base),
  );
}

function finalizeResolution(
  resolved: URL,
  base: URL,
  preserveSymlinks?: boolean,
): URL {
  if (encodedSeparatorRegEx.exec(resolved.pathname) !== null) {
    throw new ERR_INVALID_MODULE_SPECIFIER(
      resolved.pathname,
      String.raw`must not include encoded "/" or "\" characters`,
      fileURLToPath(base),
    );
  }

  let filePath: string;

  try {
    filePath = fileURLToPath(resolved);
  } catch (error) {
    Object.defineProperty(error, "input", { value: String(resolved) });
    Object.defineProperty(error, "module", { value: String(base) });
    throw error;
  }

  const stats = tryStatSync(
    filePath.endsWith("/") ? filePath.slice(-1) : filePath,
  );

  if (stats && stats.isDirectory()) {
    // @ts-expect-error TODO: type issue
    const error = new ERR_UNSUPPORTED_DIR_IMPORT(filePath, fileURLToPath(base));
    // @ts-expect-error Add this for `import.meta.resolve`.
    error.url = String(resolved);
    throw error;
  }

  if (!stats || !stats.isFile()) {
    const error = new ERR_MODULE_NOT_FOUND(
      filePath || resolved.pathname,
      base && fileURLToPath(base),
      true,
    );
    // @ts-expect-error Add this for `import.meta.resolve`.
    error.url = String(resolved);
    throw error;
  }

  if (!preserveSymlinks) {
    const real = realpathSync(filePath);
    const { search, hash } = resolved;
    resolved = pathToFileURL(real + (filePath.endsWith(path.sep) ? "/" : ""));
    resolved.search = search;
    resolved.hash = hash;
  }

  return resolved;
}

function importNotDefined(
  specifier: string,
  packageJsonUrl: URL | undefined,
  base: URL,
): Error {
  return new ERR_PACKAGE_IMPORT_NOT_DEFINED(
    specifier,
    packageJsonUrl && fileURLToPath(new URL(".", packageJsonUrl)),
    fileURLToPath(base),
  );
}

function exportsNotFound(
  subpath: string,
  packageJsonUrl: URL,
  base: URL,
): Error {
  return new ERR_PACKAGE_PATH_NOT_EXPORTED(
    fileURLToPath(new URL(".", packageJsonUrl)),
    subpath,
    base && fileURLToPath(base),
  );
}

function throwInvalidSubpath(
  request: string,
  match: string,
  packageJsonUrl: URL,
  internal: boolean,
  base: URL,
) {
  const reason = `request is not a valid match in pattern "${match}" for the "${
    internal ? "imports" : "exports"
  }" resolution of ${fileURLToPath(packageJsonUrl)}`;
  throw new ERR_INVALID_MODULE_SPECIFIER(
    request,
    reason,
    base && fileURLToPath(base),
  );
}

function invalidPackageTarget(
  subpath: string,
  target: unknown,
  packageJsonUrl: URL,
  internal: boolean,
  base: URL,
): Error {
  target =
    typeof target === "object" && target !== null
      ? JSON.stringify(target, null, "")
      : `${target}`;

  return new ERR_INVALID_PACKAGE_TARGET(
    fileURLToPath(new URL(".", packageJsonUrl)),
    subpath,
    target,
    internal,
    base && fileURLToPath(base),
  );
}

function resolvePackageTargetString(
  target: string,
  subpath: string,
  match: string,
  packageJsonUrl: URL,
  base: URL,
  pattern: boolean,
  internal: boolean,
  isPathMap: boolean,
  conditions: Set<string> | undefined,
): URL {
  if (subpath !== "" && !pattern && target.at(-1) !== "/")
    throw invalidPackageTarget(match, target, packageJsonUrl, internal, base);

  if (!target.startsWith("./")) {
    if (internal && !target.startsWith("../") && !target.startsWith("/")) {
      let isURL = false;

      try {
        new URL(target);
        isURL = true;
      } catch {
        // Continue regardless of error.
      }

      if (!isURL) {
        const exportTarget = pattern
          ? RegExpPrototypeSymbolReplace.call(
              patternRegEx,
              target,
              () => subpath,
            )
          : target + subpath;

        return packageResolve(exportTarget, packageJsonUrl, conditions);
      }
    }

    throw invalidPackageTarget(match, target, packageJsonUrl, internal, base);
  }

  if (invalidSegmentRegEx.exec(target.slice(2)) !== null) {
    if (deprecatedInvalidSegmentRegEx.exec(target.slice(2)) === null) {
      if (!isPathMap) {
        const request = pattern
          ? match.replace("*", () => subpath)
          : match + subpath;
        const resolvedTarget = pattern
          ? RegExpPrototypeSymbolReplace.call(
              patternRegEx,
              target,
              () => subpath,
            )
          : target;
        emitInvalidSegmentDeprecation(
          resolvedTarget,
          request,
          match,
          packageJsonUrl,
          internal,
          base,
          true,
        );
      }
    } else {
      throw invalidPackageTarget(match, target, packageJsonUrl, internal, base);
    }
  }

  const resolved = new URL(target, packageJsonUrl);
  const resolvedPath = resolved.pathname;
  const packagePath = new URL(".", packageJsonUrl).pathname;

  if (!resolvedPath.startsWith(packagePath))
    throw invalidPackageTarget(match, target, packageJsonUrl, internal, base);

  if (subpath === "") return resolved;

  if (invalidSegmentRegEx.exec(subpath) !== null) {
    const request = pattern
      ? match.replace("*", () => subpath)
      : match + subpath;
    if (deprecatedInvalidSegmentRegEx.exec(subpath) === null) {
      if (!isPathMap) {
        const resolvedTarget = pattern
          ? RegExpPrototypeSymbolReplace.call(
              patternRegEx,
              target,
              () => subpath,
            )
          : target;
        emitInvalidSegmentDeprecation(
          resolvedTarget,
          request,
          match,
          packageJsonUrl,
          internal,
          base,
          false,
        );
      }
    } else {
      throwInvalidSubpath(request, match, packageJsonUrl, internal, base);
    }
  }

  if (pattern) {
    return new URL(
      RegExpPrototypeSymbolReplace.call(
        patternRegEx,
        resolved.href,
        () => subpath,
      ),
    );
  }

  return new URL(subpath, resolved);
}

function isArrayIndex(key: string): boolean {
  const keyNumber = Number(key);
  if (`${keyNumber}` !== key) return false;
  return keyNumber >= 0 && keyNumber < 0xff_ff_ff_ff;
}

function resolvePackageTarget(
  packageJsonUrl: URL,
  target: unknown,
  subpath: string,
  packageSubpath: string,
  base: URL,
  pattern: boolean,
  internal: boolean,
  isPathMap: boolean,
  conditions: Set<string> | undefined,
): URL | null {
  if (typeof target === "string") {
    return resolvePackageTargetString(
      target,
      subpath,
      packageSubpath,
      packageJsonUrl,
      base,
      pattern,
      internal,
      isPathMap,
      conditions,
    );
  }

  if (Array.isArray(target)) {
    const targetList: Array<unknown> = target;
    if (targetList.length === 0) return null;

    let lastException: ErrnoException | null | undefined;
    let i = -1;

    while (++i < targetList.length) {
      const targetItem = targetList[i];
      let resolveResult: URL | null;
      try {
        resolveResult = resolvePackageTarget(
          packageJsonUrl,
          targetItem,
          subpath,
          packageSubpath,
          base,
          pattern,
          internal,
          isPathMap,
          conditions,
        );
      } catch (error) {
        const exception = error as ErrnoException;
        lastException = exception;
        if (exception.code === "ERR_INVALID_PACKAGE_TARGET") continue;
        throw error;
      }

      if (resolveResult === undefined) continue;

      if (resolveResult === null) {
        lastException = null;
        continue;
      }

      return resolveResult;
    }

    if (lastException === undefined || lastException === null) {
      return null;
    }

    throw lastException;
  }

  if (typeof target === "object" && target !== null) {
    const keys = Object.getOwnPropertyNames(target);
    let i = -1;

    while (++i < keys.length) {
      const key = keys[i]!;
      if (isArrayIndex(key)) {
        throw new ERR_INVALID_PACKAGE_CONFIG(
          fileURLToPath(packageJsonUrl),
          fileURLToPath(base),
          '"exports" cannot contain numeric property keys.',
        );
      }
    }

    i = -1;

    while (++i < keys.length) {
      const key = keys[i]!;
      if (key === "default" || (conditions && conditions.has(key))) {
        // @ts-expect-error: indexable.
        const conditionalTarget: unknown = target[key];
        const resolveResult = resolvePackageTarget(
          packageJsonUrl,
          conditionalTarget,
          subpath,
          packageSubpath,
          base,
          pattern,
          internal,
          isPathMap,
          conditions,
        );
        if (resolveResult === undefined) continue;
        return resolveResult;
      }
    }

    return null;
  }

  if (target === null) {
    return null;
  }

  throw invalidPackageTarget(
    packageSubpath,
    target,
    packageJsonUrl,
    internal,
    base,
  );
}

function isConditionalExportsMainSugar(
  exports: unknown,
  packageJsonUrl: URL,
  base: URL,
): boolean {
  if (typeof exports === "string" || Array.isArray(exports)) return true;
  if (typeof exports !== "object" || exports === null) return false;

  const keys = Object.getOwnPropertyNames(exports);
  let isConditionalSugar = false;
  let i = 0;
  let keyIndex = -1;
  while (++keyIndex < keys.length) {
    const key = keys[keyIndex]!;
    const currentIsConditionalSugar = key === "" || key[0] !== ".";
    if (i++ === 0) {
      isConditionalSugar = currentIsConditionalSugar;
    } else if (isConditionalSugar !== currentIsConditionalSugar) {
      throw new ERR_INVALID_PACKAGE_CONFIG(
        fileURLToPath(packageJsonUrl),
        fileURLToPath(base),
        "\"exports\" cannot contain some keys starting with '.' and some not." +
          " The exports object must either be an object of package subpath keys" +
          " or an object of main entry condition name keys only.",
      );
    }
  }

  return isConditionalSugar;
}

function emitTrailingSlashPatternDeprecation(
  match: string,
  pjsonUrl: URL,
  base: URL,
) {
  // @ts-expect-error: apparently it does exist, TS.
  if (process.noDeprecation) {
    return;
  }

  const pjsonPath = fileURLToPath(pjsonUrl);
  if (emittedPackageWarnings.has(pjsonPath + "|" + match)) return;
  emittedPackageWarnings.add(pjsonPath + "|" + match);
  process.emitWarning(
    `Use of deprecated trailing slash pattern mapping "${match}" in the ` +
      `"exports" field module resolution of the package at ${pjsonPath}${
        base ? ` imported from ${fileURLToPath(base)}` : ""
      }. Mapping specifiers ending in "/" is no longer supported.`,
    "DeprecationWarning",
    "DEP0155",
  );
}

function packageExportsResolve(
  packageJsonUrl: URL,
  packageSubpath: string,
  packageConfig: Record<string, unknown>,
  base: URL,
  conditions: Set<string> | undefined,
): URL {
  let exports = packageConfig.exports;

  if (isConditionalExportsMainSugar(exports, packageJsonUrl, base)) {
    exports = { ".": exports };
  }

  if (
    own.call(exports, packageSubpath) &&
    !packageSubpath.includes("*") &&
    !packageSubpath.endsWith("/")
  ) {
    // @ts-expect-error: indexable.
    const target = exports[packageSubpath];
    const resolveResult = resolvePackageTarget(
      packageJsonUrl,
      target,
      "",
      packageSubpath,
      base,
      false,
      false,
      false,
      conditions,
    );
    if (resolveResult === null || resolveResult === undefined) {
      throw exportsNotFound(packageSubpath, packageJsonUrl, base);
    }

    return resolveResult;
  }

  let bestMatch = "";
  let bestMatchSubpath = "";
  const keys = Object.getOwnPropertyNames(exports);
  let i = -1;

  while (++i < keys.length) {
    const key = keys[i]!;
    const patternIndex = key.indexOf("*");

    if (
      patternIndex !== -1 &&
      packageSubpath.startsWith(key.slice(0, patternIndex))
    ) {
      // When this reaches EOL, this can throw at the top of the whole function:
      //
      // if (StringPrototypeEndsWith(packageSubpath, '/'))
      //   throwInvalidSubpath(packageSubpath)
      //
      // To match "imports" and the spec.
      if (packageSubpath.endsWith("/")) {
        emitTrailingSlashPatternDeprecation(
          packageSubpath,
          packageJsonUrl,
          base,
        );
      }

      const patternTrailer = key.slice(patternIndex + 1);

      if (
        packageSubpath.length >= key.length &&
        packageSubpath.endsWith(patternTrailer) &&
        patternKeyCompare(bestMatch, key) === 1 &&
        key.lastIndexOf("*") === patternIndex
      ) {
        bestMatch = key;
        bestMatchSubpath = packageSubpath.slice(
          patternIndex,
          packageSubpath.length - patternTrailer.length,
        );
      }
    }
  }

  if (bestMatch) {
    // @ts-expect-error: indexable.
    const target: unknown = exports[bestMatch];
    const resolveResult = resolvePackageTarget(
      packageJsonUrl,
      target,
      bestMatchSubpath,
      bestMatch,
      base,
      true,
      false,
      packageSubpath.endsWith("/"),
      conditions,
    );

    if (resolveResult === null || resolveResult === undefined) {
      throw exportsNotFound(packageSubpath, packageJsonUrl, base);
    }

    return resolveResult;
  }

  throw exportsNotFound(packageSubpath, packageJsonUrl, base);
}

function patternKeyCompare(a: string, b: string) {
  const aPatternIndex = a.indexOf("*");
  const bPatternIndex = b.indexOf("*");
  const baseLengthA = aPatternIndex === -1 ? a.length : aPatternIndex + 1;
  const baseLengthB = bPatternIndex === -1 ? b.length : bPatternIndex + 1;
  if (baseLengthA > baseLengthB) return -1;
  if (baseLengthB > baseLengthA) return 1;
  if (aPatternIndex === -1) return 1;
  if (bPatternIndex === -1) return -1;
  if (a.length > b.length) return -1;
  if (b.length > a.length) return 1;
  return 0;
}

function packageImportsResolve(
  name: string,
  base: URL,
  conditions?: Set<string>,
): URL {
  if (name === "#" || name.startsWith("#/") || name.endsWith("/")) {
    const reason = "is not a valid internal imports specifier name";
    throw new ERR_INVALID_MODULE_SPECIFIER(name, reason, fileURLToPath(base));
  }

  let packageJsonUrl: URL | undefined;

  const packageConfig = getPackageScopeConfig(base);

  if (packageConfig.exists) {
    packageJsonUrl = pathToFileURL(packageConfig.pjsonPath);
    const imports = packageConfig.imports;
    if (imports) {
      if (own.call(imports, name) && !name.includes("*")) {
        const resolveResult = resolvePackageTarget(
          packageJsonUrl,
          imports[name],
          "",
          name,
          base,
          false,
          true,
          false,
          conditions,
        );
        if (resolveResult !== null && resolveResult !== undefined) {
          return resolveResult;
        }
      } else {
        let bestMatch = "";
        let bestMatchSubpath = "";
        const keys = Object.getOwnPropertyNames(imports);
        let i = -1;

        while (++i < keys.length) {
          const key = keys[i]!;
          const patternIndex = key.indexOf("*");

          if (patternIndex !== -1 && name.startsWith(key.slice(0, -1))) {
            const patternTrailer = key.slice(patternIndex + 1);
            if (
              name.length >= key.length &&
              name.endsWith(patternTrailer) &&
              patternKeyCompare(bestMatch, key) === 1 &&
              key.lastIndexOf("*") === patternIndex
            ) {
              bestMatch = key;
              bestMatchSubpath = name.slice(
                patternIndex,
                name.length - patternTrailer.length,
              );
            }
          }
        }

        if (bestMatch) {
          const target = imports[bestMatch];
          const resolveResult = resolvePackageTarget(
            packageJsonUrl,
            target,
            bestMatchSubpath,
            bestMatch,
            base,
            true,
            true,
            false,
            conditions,
          );

          if (resolveResult !== null && resolveResult !== undefined) {
            return resolveResult;
          }
        }
      }
    }
  }

  throw importNotDefined(name, packageJsonUrl, base);
}

/**
 * @param {string} specifier
 * @param {URL} base
 */
function parsePackageName(specifier: string, base: URL) {
  let separatorIndex = specifier.indexOf("/");
  let validPackageName = true;
  let isScoped = false;
  if (specifier[0] === "@") {
    isScoped = true;
    if (separatorIndex === -1 || specifier.length === 0) {
      validPackageName = false;
    } else {
      separatorIndex = specifier.indexOf("/", separatorIndex + 1);
    }
  }

  const packageName =
    separatorIndex === -1 ? specifier : specifier.slice(0, separatorIndex);

  // Package name cannot have leading . and cannot have percent-encoding or
  // \\ separators.
  if (invalidPackageNameRegEx.exec(packageName) !== null) {
    validPackageName = false;
  }

  if (!validPackageName) {
    throw new ERR_INVALID_MODULE_SPECIFIER(
      specifier,
      "is not a valid package name",
      fileURLToPath(base),
    );
  }

  const packageSubpath =
    "." + (separatorIndex === -1 ? "" : specifier.slice(separatorIndex));

  return { packageName, packageSubpath, isScoped };
}

function packageResolve(
  specifier: string,
  base: URL,
  conditions: Set<string> | undefined,
): URL {
  if (nodeBuiltins.includes(specifier)) {
    return new URL("node:" + specifier);
  }

  const { packageName, packageSubpath, isScoped } = parsePackageName(
    specifier,
    base,
  );

  // ResolveSelf
  const packageConfig = getPackageScopeConfig(base);

  if (
    packageConfig.exists &&
    packageConfig.name === packageName &&
    packageConfig.exports !== undefined &&
    packageConfig.exports !== null
  ) {
    const packageJsonUrl = pathToFileURL(packageConfig.pjsonPath);
    return packageExportsResolve(
      packageJsonUrl,
      packageSubpath,
      packageConfig,
      base,
      conditions,
    );
  }

  let packageJsonUrl = new URL(
    "./node_modules/" + packageName + "/package.json",
    base,
  );
  let packageJsonPath = fileURLToPath(packageJsonUrl);
  let lastPath: string;
  do {
    const stat = tryStatSync(packageJsonPath.slice(0, -13));
    if (!stat || !stat.isDirectory()) {
      lastPath = packageJsonPath;
      packageJsonUrl = new URL(
        (isScoped ? "../../../../node_modules/" : "../../../node_modules/") +
          packageName +
          "/package.json",
        packageJsonUrl,
      );
      packageJsonPath = fileURLToPath(packageJsonUrl);
      continue;
    }

    // Package match.
    const packageConfig = read(packageJsonPath, { base, specifier });
    if (packageConfig.exports !== undefined && packageConfig.exports !== null) {
      return packageExportsResolve(
        packageJsonUrl,
        packageSubpath,
        packageConfig,
        base,
        conditions,
      );
    }

    if (packageSubpath === ".") {
      return legacyMainResolve(packageJsonUrl, packageConfig, base);
    }

    return new URL(packageSubpath, packageJsonUrl);
    // Cross-platform root check.
  } while (packageJsonPath.length !== lastPath.length);

  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), false);
}

function isRelativeSpecifier(specifier: string): boolean {
  if (specifier[0] === ".") {
    if (specifier.length === 1 || specifier[1] === "/") return true;
    if (
      specifier[1] === "." &&
      (specifier.length === 2 || specifier[2] === "/")
    ) {
      return true;
    }
  }

  return false;
}

function shouldBeTreatedAsRelativeOrAbsolutePath(specifier: string): boolean {
  if (specifier === "") return false;
  if (specifier[0] === "/") return true;
  return isRelativeSpecifier(specifier);
}

/**
 * The “Resolver Algorithm Specification” as detailed in the Node docs (which is
 * sync and slightly lower-level than `resolve`).
 *
 * @param {string} specifier
 *   `/example.js`, `./example.js`, `../example.js`, `some-package`, `fs`, etc.
 * @param {URL} base
 *   Full URL (to a file) that `specifier` is resolved relative from.
 * @param {Set<string>} [conditions]
 *   Conditions.
 * @param {boolean} [preserveSymlinks]
 *   Keep symlinks instead of resolving them.
 * @returns {URL}
 *   A URL object to the found thing.
 */
export function moduleResolve(
  specifier: string,
  base: URL,
  conditions?: Set<string>,
  preserveSymlinks?: boolean,
): URL {
  // Note: The Node code supports `base` as a string (in this internal API) too,
  // we don’t.
  const protocol = base.protocol;
  const isData = protocol === "data:";
  // Order swapped from spec for minor perf gain.
  // Ok since relative URLs cannot parse as URLs.
  let resolved: URL | undefined;

  if (shouldBeTreatedAsRelativeOrAbsolutePath(specifier)) {
    try {
      resolved = new URL(specifier, base);
    } catch (error_) {
      // @ts-expect-error TODO: type issue
      const error = new ERR_UNSUPPORTED_RESOLVE_REQUEST(specifier, base);
      error.cause = error_;
      throw error;
    }
  } else if (protocol === "file:" && specifier[0] === "#") {
    resolved = packageImportsResolve(specifier, base, conditions);
  } else {
    try {
      resolved = new URL(specifier);
    } catch (error_) {
      // Note: actual code uses `canBeRequiredWithoutScheme`.
      if (isData && !nodeBuiltins.includes(specifier)) {
        // @ts-expect-error TODO: type issue
        const error = new ERR_UNSUPPORTED_RESOLVE_REQUEST(specifier, base);
        error.cause = error_;
        throw error;
      }

      resolved = packageResolve(specifier, base, conditions);
    }
  }

  assert(resolved !== undefined, "expected to be defined");

  if (resolved.protocol !== "file:") {
    return resolved;
  }

  return finalizeResolution(resolved, base, preserveSymlinks);
}
