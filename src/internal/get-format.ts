// Source:  https://github.com/nodejs/node/blob/main/lib/internal/modules/esm/get_format.js
// Changes: https://github.com/nodejs/node/commits/main/lib/internal/modules/esm/get_format.js?since=2026-06-21

import { fileURLToPath } from "node:url";
import { getPackageScopeConfig } from "./package-json-reader.ts";
import { ERR_UNKNOWN_FILE_EXTENSION } from "./errors.ts";

const hasOwnProperty = {}.hasOwnProperty;

// Note: this intentionally diverges from upstream:
// - Upstream emits `module-typescript`/`commonjs-typescript` for `.ts`/`.mts`/`.cts`
//   (behind `--strip-types`), but exsolve does not strip types and its only consumer
//   (`resolve.ts`) checks `format === "module"`, so we keep `.ts`/`.mts` → `module`
//   and `.cts` → `commonjs`.
// - Upstream has `.wasm` → `wasm` (and `.node` → `addon` behind a flag), but exsolve
//   does not support WASM/addon resolution, so those are intentionally omitted.
const extensionFormatMap: Record<string, string | null> & { __proto__: null } =
  {
    __proto__: null,
    ".json": "json",
    ".cjs": "commonjs",
    ".cts": "commonjs",
    ".js": "module",
    ".ts": "module",
    ".mts": "module",
    ".mjs": "module",
  };

type Protocol = "data:" | "file:" | "node:";

type ProtocolHandler = (
  parsed: URL,
  context: { parentURL: string; source?: Buffer },
  ignoreErrors: boolean,
) => string | null | void;

const protocolHandlers: Record<Protocol, ProtocolHandler> & {
  __proto__: null;
} = {
  __proto__: null,
  "data:": getDataProtocolModuleFormat,
  "file:": getFileProtocolModuleFormat,
  "node:": () => "builtin",
};

function mimeToFormat(mime: string | null): string | null {
  if (
    mime &&
    /^\s*(text|application)\/javascript\s*(;\s*charset=utf-?8\s*)?$/i.test(mime)
  )
    return "module";
  if (mime === "application/json") return "json";
  // Note: upstream also maps `application/wasm` → `wasm`, intentionally omitted
  // here since exsolve does not support WASM.
  return null;
}

function getDataProtocolModuleFormat(parsed: URL): string | null {
  const { 1: mime } = /^([^/]+\/[^;,]+)(?:[^,]*?)(;base64)?,/.exec(
    parsed.pathname,
  ) || [null, null, null];
  return mimeToFormat(mime);
}

const DOT_CODE = 46;
const SLASH_CODE = 47;

/**
 * Returns the file extension from a URL.
 *
 * Should give similar result to
 * `require('node:path').extname(require('node:url').fileURLToPath(url))`
 * when used with a `file:` URL.
 *
 */
function extname(url: URL): string {
  const pathname = url.pathname;
  for (let i = pathname.length - 1; i > 0; i--) {
    switch (pathname.charCodeAt(i)) {
      case SLASH_CODE: {
        return "";
      }
      case DOT_CODE: {
        return pathname.charCodeAt(i - 1) === SLASH_CODE
          ? ""
          : pathname.slice(i);
      }
    }
  }
  return "";
}

function getFileProtocolModuleFormat(
  url: URL,
  _context: unknown,
  ignoreErrors: boolean,
) {
  const ext = extname(url);

  if (ext === ".js") {
    const { type: packageType } = getPackageScopeConfig(url);

    if (packageType !== "none") {
      return packageType;
    }

    // The controlling `package.json` file has no `type` field.
    // Note: upstream sniffs the source here (`detectModuleFormat`) to decide
    // between `module` and `commonjs`. exsolve never has a `source`, so for
    // ambiguous `.js` files we fall back to `commonjs` (legacy behavior).
    return "commonjs";
  }

  if (ext === "") {
    const { type: packageType } = getPackageScopeConfig(url);

    if (packageType === "module") {
      // Note: upstream calls `getFormatOfExtensionlessFile` here to
      // disambiguate `module` vs `wasm` by reading the file header. exsolve
      // does not support WASM, so this is always `module`.
      return "module";
    }

    if (packageType !== "none") {
      return packageType; // 'commonjs' or future package types
    }

    // The controlling `package.json` file has no `type` field.
    // Note: upstream sniffs the source here; exsolve never has a `source`, so
    // we fall back to `commonjs` (legacy behavior).
    return "commonjs";
  }

  const format = extensionFormatMap[ext];
  if (format) return format;

  // Explicit undefined return indicates load hook should rerun format check
  if (ignoreErrors) {
    return undefined;
  }

  const filepath = fileURLToPath(url);
  throw new ERR_UNKNOWN_FILE_EXTENSION(ext, filepath);
}

export function defaultGetFormatWithoutErrors(
  url: URL,
  context: { parentURL: string },
): string | null {
  const protocol = url.protocol;

  if (!hasOwnProperty.call(protocolHandlers, protocol)) {
    return null;
  }

  return protocolHandlers[protocol as Protocol]!(url, context, true) || null;
}
