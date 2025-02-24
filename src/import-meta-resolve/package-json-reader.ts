// Source:  https://github.com/nodejs/node/blob/main/lib/internal/modules/package_json_reader.js
// Changes: https://github.com/nodejs/node/commits/main/lib/internal/modules/package_json_reader.js?since=2024-04-29
//
// Notes:
// - Removed the native dependency.
// - No need to cache, we do that in resolve already.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ERR_INVALID_PACKAGE_CONFIG } from "./errors.ts";

export type PackageConfig = {
  pjsonPath: string;
  exists: boolean;
  main?: string;
  name?: string;
  type: "commonjs" | "module" | "none";
  exports?: Record<string, unknown>;
  imports?: Record<string, unknown>;
};

import type { ErrnoException } from "./errors.ts";

type PackageType = "commonjs" | "module" | "none";

const hasOwnProperty = {}.hasOwnProperty;

const cache: Map<string, PackageConfig> = new Map();

export function read(
  jsonPath: string,
  { base, specifier }: { specifier: URL | string; base?: URL },
): PackageConfig {
  const existing = cache.get(jsonPath);

  if (existing) {
    return existing;
  }

  let string: string | undefined;

  try {
    string = fs.readFileSync(path.toNamespacedPath(jsonPath), "utf8");
  } catch (error) {
    const exception = error as ErrnoException;

    if (exception.code !== "ENOENT") {
      throw exception;
    }
  }

  const result: PackageConfig = {
    exists: false,
    pjsonPath: jsonPath,
    main: undefined,
    name: undefined,
    type: "none", // Ignore unknown types for forwards compatibility
    exports: undefined,
    imports: undefined,
  };

  if (string !== undefined) {
    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(string);
    } catch (error_: unknown) {
      const error = new ERR_INVALID_PACKAGE_CONFIG(
        jsonPath,
        (base ? `"${specifier}" from ` : "") + fileURLToPath(base || specifier),
        (error_ as ErrnoException).message,
      );
      error.cause = error_;
      throw error;
    }

    result.exists = true;

    if (
      hasOwnProperty.call(parsed, "name") &&
      typeof parsed.name === "string"
    ) {
      result.name = parsed.name;
    }

    if (
      hasOwnProperty.call(parsed, "main") &&
      typeof parsed.main === "string"
    ) {
      result.main = parsed.main;
    }

    if (hasOwnProperty.call(parsed, "exports")) {
      result.exports = parsed.exports as any;
    }

    if (hasOwnProperty.call(parsed, "imports")) {
      result.imports = parsed.imports as any;
    }

    // Ignore unknown types for forwards compatibility
    if (
      hasOwnProperty.call(parsed, "type") &&
      (parsed.type === "commonjs" || parsed.type === "module")
    ) {
      result.type = parsed.type;
    }
  }

  cache.set(jsonPath, result);

  return result;
}

export function getPackageScopeConfig(resolved: URL | string): PackageConfig {
  // Note: in Node, this is now a native module.
  let packageJSONUrl = new URL("package.json", resolved);

  while (true) {
    const packageJSONPath = packageJSONUrl.pathname;
    if (packageJSONPath.endsWith("node_modules/package.json")) {
      break;
    }

    const packageConfig = read(fileURLToPath(packageJSONUrl), {
      specifier: resolved,
    });

    if (packageConfig.exists) {
      return packageConfig;
    }

    const lastPackageJSONUrl = packageJSONUrl;
    packageJSONUrl = new URL("../package.json", packageJSONUrl);

    // Terminates at root where ../package.json equals ../../package.json
    // (can't just check "/package.json" for Windows support).
    if (packageJSONUrl.pathname === lastPackageJSONUrl.pathname) {
      break;
    }
  }

  const packageJSONPath = fileURLToPath(packageJSONUrl);
  // ^^ Note: in Node, this is now a native module.

  return {
    pjsonPath: packageJSONPath,
    exists: false,
    type: "none",
  };
}

/**
 * Returns the package type for a given URL.
 * @param {URL} url - The URL to get the package type for.
 */
export function getPackageType(url: URL): PackageType {
  // To do @anonrig: Write a C++ function that returns only "type".
  return getPackageScopeConfig(url).type;
}
