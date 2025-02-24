// Source:  https://github.com/nodejs/node/blob/main/lib/internal/modules/esm/get_format.js
// Changes: https://github.com/nodejs/node/commits/main/lib/internal/modules/esm/get_format.js?since=2024-04-29

import { fileURLToPath } from "node:url";
import { getPackageType } from "./package-json-reader.ts";
import { ERR_UNKNOWN_FILE_EXTENSION } from "./errors.ts";

const hasOwnProperty = {}.hasOwnProperty;

const extensionFormatMap: Record<string, string> = {
  // @ts-expect-error: hush.
  __proto__: null,
  ".cjs": "commonjs",
  ".js": "module",
  ".json": "json",
  ".mjs": "module",
};

type Protocol = "data:" | "file:" | "http:" | "https:" | "node:";

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
  "http:": getHttpProtocolModuleFormat,
  "https:": getHttpProtocolModuleFormat,
  "node:": () => "builtin",
};

function mimeToFormat(mime: string | null): string | null {
  if (
    mime &&
    /\s*(text|application)\/javascript\s*(;\s*charset=utf-?8\s*)?/i.test(mime)
  )
    return "module";
  if (mime === "application/json") return "json";
  return null;
}

function getDataProtocolModuleFormat(parsed: URL): string | null {
  const { 1: mime } = /^([^/]+\/[^;,]+)[^,]*?(;base64)?,/.exec(
    parsed.pathname,
  ) || [null, null, null];
  return mimeToFormat(mime);
}

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
  let index = pathname.length;

  while (index--) {
    const code = pathname.codePointAt(index);

    if (code === 47 /* `/` */) {
      return "";
    }

    if (code === 46 /* `.` */) {
      return pathname.codePointAt(index - 1) === 47 /* `/` */
        ? ""
        : pathname.slice(index);
    }
  }

  return "";
}

function getFileProtocolModuleFormat(
  url: URL,
  _context: unknown,
  ignoreErrors: boolean,
) {
  const value = extname(url);

  if (value === ".js") {
    const packageType = getPackageType(url);

    if (packageType !== "none") {
      return packageType;
    }

    return "commonjs";
  }

  if (value === "") {
    const packageType = getPackageType(url);

    // Legacy behavior
    if (packageType === "none" || packageType === "commonjs") {
      return "commonjs";
    }

    // Note: we don’t implement WASM, so we don’t need
    // `getFormatOfExtensionlessFile` from `formats`.
    return "module";
  }

  const format = extensionFormatMap[value];
  if (format) return format;

  // Explicit undefined return indicates load hook should rerun format check
  if (ignoreErrors) {
    return undefined;
  }

  const filepath = fileURLToPath(url);
  throw new ERR_UNKNOWN_FILE_EXTENSION(value, filepath);
}

function getHttpProtocolModuleFormat() {
  // To do: HTTPS imports.
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
