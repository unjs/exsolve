// Source:  https://github.com/nodejs/node/blob/main/lib/internal/errors.js
// Changes: https://github.com/nodejs/node/commits/main/lib/internal/errors.js?since=2026-06-21

import assert from "node:assert";
import { format, inspect } from "node:util";

export type ErrnoExceptionFields = {
  errnode?: number;
  code?: string;
  path?: string;
  syscall?: string;
  url?: string;
};

export type ErrnoException = Error & ErrnoExceptionFields;
export type MessageFunction = (...parameters: Array<any>) => string;

const classRegExp = /^([A-Z][a-z\d]*)+$/;

// Sorted by a rough estimate on most frequently used entries.
const kTypes = new Set([
  "string",
  "function",
  "number",
  "object",
  // Accept 'Function' and 'Object' as alternative to the lower cased version.
  "Function",
  "Object",
  "boolean",
  "bigint",
  "symbol",
]);

const messages: Map<string, MessageFunction | string> = new Map();

/**
 * Create a list string in the form like 'A and B' or 'A, B, ..., and Z'.
 * We cannot use Intl.ListFormat because it's not available in
 * --without-intl builds.
 *
 * @param {Array<string>} array
 *   An array of strings.
 * @param {string} [type]
 *   The list type to be inserted before the last element.
 * @returns {string}
 */
function formatList(array: string[], type = "and"): string {
  switch (array.length) {
    case 0: {
      return "";
    }
    case 1: {
      return `${array[0]}`;
    }
    case 2: {
      return `${array[0]} ${type} ${array[1]}`;
    }
    case 3: {
      return `${array[0]}, ${array[1]}, ${type} ${array[2]}`;
    }
    default: {
      return `${array.slice(0, -1).join(", ")}, ${type} ${array.at(-1)}`;
    }
  }
}

/**
 * Count the number of `%`-style placeholders in a static message string.
 */
function getExpectedArgumentLength(message: string): number {
  let expectedLength = 0;
  const regex = /%[dfijoOs]/g;
  while (regex.exec(message) !== null) expectedLength++;
  return expectedLength;
}

/**
 * Utility function for registering the error codes.
 */
function createError<
  T extends MessageFunction | string,
  C extends ErrorConstructor,
>(
  sym: string,
  value: T,
  constructor: C,
): T extends string
  ? { new (...args: unknown[]): InstanceType<C> & ErrnoException }
  : {
      new (
        ...args: Parameters<Exclude<T, string>>
      ): InstanceType<C> & ErrnoException;
    } {
  // Special case for SystemError that formats the error message differently
  // The SystemErrors only have SystemError as their base classes.
  messages.set(sym, value);

  return makeNodeErrorWithCode(constructor, sym) as any;
}

// Used to identify Node.js core errors created via `makeNodeErrorWithCode`.
const kIsNodeError = Symbol("kIsNodeError");

function makeNodeErrorWithCode(
  Base: ErrorConstructor,
  key: string,
): ErrorConstructor {
  const message = messages.get(key);
  const expectedLength =
    typeof message === "string" ? getExpectedArgumentLength(message) : -1;

  switch (expectedLength) {
    case 0: {
      class NodeError extends Base {
        code = key;

        constructor(...args: unknown[]) {
          assert.ok(
            args.length === 0,
            `Code: ${key}; The provided arguments length (${args.length}) does not ` +
              `match the required ones (${expectedLength}).`,
          );
          super(message as string);
        }

        override get ["constructor"](): ErrorConstructor {
          return Base;
        }

        get [kIsNodeError](): boolean {
          return true;
        }

        override toString(): string {
          return `${this.name} [${key}]: ${this.message}`;
        }
      }
      return NodeError as unknown as ErrorConstructor;
    }
    case -1: {
      class NodeError extends Base {
        code = key;

        constructor(...args: unknown[]) {
          super();
          Object.defineProperty(this, "message", {
            value: getMessage(key, args, this),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }

        override get ["constructor"](): ErrorConstructor {
          return Base;
        }

        get [kIsNodeError](): boolean {
          return true;
        }

        override toString(): string {
          return `${this.name} [${key}]: ${this.message}`;
        }
      }
      return NodeError as unknown as ErrorConstructor;
    }
    default: {
      class NodeError extends Base {
        code = key;

        constructor(...args: unknown[]) {
          assert.ok(
            args.length === expectedLength,
            `Code: ${key}; The provided arguments length (${args.length}) does not ` +
              `match the required ones (${expectedLength}).`,
          );

          args.unshift(message as string);
          super(Reflect.apply(format, null, args) as string);
        }

        override get ["constructor"](): ErrorConstructor {
          return Base;
        }

        get [kIsNodeError](): boolean {
          return true;
        }

        override toString(): string {
          return `${this.name} [${key}]: ${this.message}`;
        }
      }
      return NodeError as unknown as ErrorConstructor;
    }
  }
}

function getMessage(key: string, parameters: unknown[], self: Error): string {
  const message = messages.get(key);
  assert.ok(message !== undefined, "expected `message` to be found");

  if (typeof message === "function") {
    assert.ok(
      message.length <= parameters.length, // Default options do not count.
      `Code: ${key}; The provided arguments length (${parameters.length}) does not ` +
        `match the required ones (${message.length}).`,
    );
    return Reflect.apply(message, self, parameters);
  }

  const expectedLength = getExpectedArgumentLength(message);
  assert.ok(
    expectedLength === parameters.length,
    `Code: ${key}; The provided arguments length (${parameters.length}) does not ` +
      `match the required ones (${expectedLength}).`,
  );
  if (parameters.length === 0) return message;

  parameters.unshift(message);

  return Reflect.apply(format, null, parameters);
}

/**
 * Determine the specific type of a value for type-mismatch errors.
 */
function determineSpecificType(value: unknown): string {
  if (value === null) {
    return "null";
  } else if (value === undefined) {
    return "undefined";
  }

  const type = typeof value;

  switch (type) {
    case "bigint": {
      return `type bigint (${value}n)`;
    }
    case "number": {
      if (value === 0) {
        return 1 / (value as number) === Number.NEGATIVE_INFINITY
          ? "type number (-0)"
          : "type number (0)";
      } else if (value !== value) {
        return "type number (NaN)";
      } else if (value === Number.POSITIVE_INFINITY) {
        return "type number (Infinity)";
      } else if (value === Number.NEGATIVE_INFINITY) {
        return "type number (-Infinity)";
      }
      return `type number (${value})`;
    }
    case "boolean": {
      return value ? "type boolean (true)" : "type boolean (false)";
    }
    case "symbol": {
      return `type symbol (${String(value)})`;
    }
    case "function": {
      return `function ${(value as () => void).name}`;
    }
    case "object": {
      if (value.constructor && "name" in value.constructor) {
        return `an instance of ${value.constructor.name}`;
      }
      return `${inspect(value, { depth: -1 })}`;
    }
    case "string": {
      let string = value as string;
      if (string.length > 28) {
        string = `${string.slice(0, 25)}...`;
      }
      if (!string.includes("'")) {
        return `type string ('${string}')`;
      }
      return `type string (${JSON.stringify(string)})`;
    }
    default: {
      let inspected = inspect(value, { colors: false });
      if (inspected.length > 28) {
        inspected = `${inspected.slice(0, 25)}...`;
      }

      return `type ${type} (${inspected})`;
    }
  }
}

// ----------------------------------------------------------------------------
// Codes
// ----------------------------------------------------------------------------

export const ERR_INVALID_ARG_TYPE = createError(
  "ERR_INVALID_ARG_TYPE",
  (name: string, expected: Array<string> | string, actual: unknown) => {
    assert.ok(typeof name === "string", "'name' must be a string");
    if (!Array.isArray(expected)) {
      expected = [expected];
    }

    let message = "The ";
    if (name.endsWith(" argument")) {
      // For cases like 'first argument'
      message += `${name} `;
    } else {
      const type = name.includes(".") ? "property" : "argument";
      message += `"${name}" ${type} `;
    }

    message += "must be ";

    const types: string[] = [];
    const instances: string[] = [];
    const other: string[] = [];

    for (const value of expected) {
      assert.ok(
        typeof value === "string",
        "All expected entries have to be of type string",
      );

      if (kTypes.has(value)) {
        types.push(value.toLowerCase());
      } else if (classRegExp.exec(value) === null) {
        assert.ok(
          value !== "object",
          'The value "object" should be written as "Object"',
        );
        other.push(value);
      } else {
        instances.push(value);
      }
    }

    // Special handle `object` in case other instances are allowed to outline
    // the differences between each other.
    if (instances.length > 0) {
      const pos = types.indexOf("object");
      if (pos !== -1) {
        types.splice(pos, 1);
        instances.push("Object");
      }
    }

    if (types.length > 0) {
      message += `${types.length > 1 ? "one of type" : "of type"} ${formatList(
        types,
        "or",
      )}`;
      if (instances.length > 0 || other.length > 0) message += " or ";
    }

    if (instances.length > 0) {
      message += `an instance of ${formatList(instances, "or")}`;
      if (other.length > 0) message += " or ";
    }

    if (other.length > 0) {
      if (other.length > 1) {
        message += `one of ${formatList(other, "or")}`;
      } else {
        if (other[0]?.toLowerCase() !== other[0]) message += "an ";
        message += `${other[0]}`;
      }
    }

    message += `. Received ${determineSpecificType(actual)}`;

    return message;
  },
  TypeError,
);

export const ERR_INVALID_MODULE_SPECIFIER = createError(
  "ERR_INVALID_MODULE_SPECIFIER",
  /**
   * @param {string} request
   * @param {string} reason
   * @param {string} [base]
   */
  (request: string, reason: string, base?: string) => {
    return `Invalid module "${request}" ${reason}${
      base ? ` imported from ${base}` : ""
    }`;
  },
  TypeError,
);

export const ERR_INVALID_PACKAGE_CONFIG = createError(
  "ERR_INVALID_PACKAGE_CONFIG",
  (path: string, base?: string, message?: string) => {
    return `Invalid package config ${path}${
      base ? ` while importing ${base}` : ""
    }${message ? `. ${message}` : ""}`;
  },
  Error,
);

export const ERR_INVALID_PACKAGE_TARGET = createError(
  "ERR_INVALID_PACKAGE_TARGET",
  (
    packagePath: string,
    key: string,
    target: unknown,
    isImport: boolean = false,
    base?: string,
  ) => {
    const relatedError =
      typeof target === "string" &&
      !isImport &&
      target.length > 0 &&
      !target.startsWith("./");
    if (key === ".") {
      assert.ok(isImport === false);
      return (
        `Invalid "exports" main target ${JSON.stringify(target)} defined ` +
        `in the package config ${packagePath}package.json${
          base ? ` imported from ${base}` : ""
        }${relatedError ? '; targets must start with "./"' : ""}`
      );
    }

    return `Invalid "${
      isImport ? "imports" : "exports"
    }" target ${JSON.stringify(
      target,
    )} defined for '${key}' in the package config ${packagePath}package.json${
      base ? ` imported from ${base}` : ""
    }${relatedError ? '; targets must start with "./"' : ""}`;
  },
  Error,
);

export const ERR_MODULE_NOT_FOUND = createError(
  "ERR_MODULE_NOT_FOUND",
  function (
    this: ErrnoException,
    path: string,
    base: string,
    exactUrl: boolean | string = false,
  ) {
    if (exactUrl && typeof exactUrl === "string") {
      this.url = `${exactUrl}`;
    }
    return `Cannot find ${
      exactUrl ? "module" : "package"
    } '${path}' imported from ${base}`;
  },
  Error,
);

export const ERR_PACKAGE_IMPORT_NOT_DEFINED = createError(
  "ERR_PACKAGE_IMPORT_NOT_DEFINED",
  (specifier: string, packagePath: string | undefined, base: string) => {
    return `Package import specifier "${specifier}" is not defined${
      packagePath ? ` in package ${packagePath || ""}package.json` : ""
    } imported from ${base}`;
  },
  TypeError,
);

export const ERR_PACKAGE_PATH_NOT_EXPORTED = createError(
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  /**
   * @param {string} packagePath
   * @param {string} subpath
   * @param {string} [base]
   */
  (packagePath: string, subpath: string, base?: string) => {
    if (subpath === ".")
      return `No "exports" main defined in ${packagePath}package.json${
        base ? ` imported from ${base}` : ""
      }`;
    return `Package subpath '${subpath}' is not defined by "exports" in ${packagePath}package.json${
      base ? ` imported from ${base}` : ""
    }`;
  },
  Error,
);

export const ERR_UNSUPPORTED_DIR_IMPORT = createError(
  "ERR_UNSUPPORTED_DIR_IMPORT",
  function (
    this: ErrnoException,
    path: string,
    base: string,
    exactUrl: string | undefined = undefined,
  ) {
    this.url = exactUrl;
    return (
      `Directory import '${path}' is not supported ` +
      `resolving ES modules imported from ${base}`
    );
  },
  Error,
);

export const ERR_UNSUPPORTED_RESOLVE_REQUEST = createError(
  "ERR_UNSUPPORTED_RESOLVE_REQUEST",
  'Failed to resolve module specifier "%s" from "%s": Invalid relative URL or base scheme is not hierarchical.',
  TypeError,
);

export const ERR_UNKNOWN_FILE_EXTENSION = createError(
  "ERR_UNKNOWN_FILE_EXTENSION",
  // Upstream: 'Unknown file extension "%s" for %s' (static string).
  // Kept as a typed function to preserve the typed 2-arg call signature used
  // by `get-format.ts`; the produced message is identical to upstream.
  (extension: string, path: string) => {
    return `Unknown file extension "${extension}" for ${path}`;
  },
  TypeError,
);

export const ERR_INVALID_ARG_VALUE = createError(
  "ERR_INVALID_ARG_VALUE",
  (name: string, value: unknown, reason: string = "is invalid") => {
    let inspected = inspect(value);

    if (inspected.length > 128) {
      inspected = `${inspected.slice(0, 128)}...`;
    }

    const type = name.includes(".") ? "property" : "argument";

    return `The ${type} '${name}' ${reason}. Received ${inspected}`;
  },
  TypeError,
  // Note: extra classes have been shaken out.
  // , RangeError
);
