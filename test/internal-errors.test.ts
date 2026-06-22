import { describe, it, expect } from "vitest";
import {
  ERR_INVALID_ARG_TYPE,
  ERR_MODULE_NOT_FOUND,
  ERR_UNSUPPORTED_DIR_IMPORT,
  ERR_UNSUPPORTED_RESOLVE_REQUEST,
} from "../src/internal/errors.ts";

describe("ERR_INVALID_ARG_TYPE splice fix", () => {
  it("folds lowercase object into instances when a class name is present", () => {
    const message = new ERR_INVALID_ARG_TYPE("opts.x", ["Object", "Buffer"], 42)
      .message;
    expect(message).toBe(
      `The "opts.x" property must be an instance of Buffer or Object. Received type number (42)`,
    );
    expect(message).not.toContain("of type object");
  });

  it("keeps object in the type list for a pure-types case", () => {
    const message = new ERR_INVALID_ARG_TYPE("opts.x", ["Object", "string"], 42)
      .message;
    expect(message).toBe(
      `The "opts.x" property must be one of type object or string. Received type number (42)`,
    );
  });
});

describe("class-based machinery", () => {
  it("exposes the code key on instances", () => {
    expect(new ERR_MODULE_NOT_FOUND("/x/y", "/base").code).toBe(
      "ERR_MODULE_NOT_FOUND",
    );
    expect(new ERR_INVALID_ARG_TYPE("x", "string", 1).code).toBe(
      "ERR_INVALID_ARG_TYPE",
    );
  });

  it("uses the correct base classes for instanceof", () => {
    const typeErr = new ERR_INVALID_ARG_TYPE("x", "string", 1);
    expect(typeErr).toBeInstanceOf(TypeError);
    expect(typeErr).toBeInstanceOf(Error);

    const modErr = new ERR_MODULE_NOT_FOUND("/x/y", "/base");
    expect(modErr).toBeInstanceOf(Error);
    expect(modErr).not.toBeInstanceOf(TypeError);
  });

  it("formats toString as '<Name> [<CODE>]: <message>'", () => {
    const typeErr = new ERR_INVALID_ARG_TYPE("x", "string", 1);
    expect(typeErr.toString()).toBe(
      `TypeError [ERR_INVALID_ARG_TYPE]: ${typeErr.message}`,
    );
    expect(typeErr.toString()).toContain("TypeError [ERR_INVALID_ARG_TYPE]: ");
  });

  it("asserts the required argument count for static-format-string codes", () => {
    expect(() => new ERR_UNSUPPORTED_RESOLVE_REQUEST("only-one")).toThrow(
      /does not match the required ones/,
    );

    const err = new ERR_UNSUPPORTED_RESOLVE_REQUEST("spec", "base");
    expect(err.message).toBe(
      `Failed to resolve module specifier "spec" from "base": Invalid relative URL or base scheme is not hierarchical.`,
    );
  });
});

describe("this.url side-effect", () => {
  it("sets url and uses 'module' wording when an exact url is given", () => {
    const err = new ERR_MODULE_NOT_FOUND("/x/y", "/base", "file:///x/y");
    expect(err.url).toBe("file:///x/y");
    expect(err.message).toBe("Cannot find module '/x/y' imported from /base");
  });

  it("leaves url undefined and uses 'package' wording without an exact url", () => {
    const err = new ERR_MODULE_NOT_FOUND("pkg", "/base");
    expect(err.url).toBeUndefined();
    expect(err.message).toBe("Cannot find package 'pkg' imported from /base");
  });

  it("formats ERR_UNSUPPORTED_DIR_IMPORT message", () => {
    const err = new ERR_UNSUPPORTED_DIR_IMPORT("/dir", "/base");
    expect(err.message).toBe(
      "Directory import '/dir' is not supported resolving ES modules imported from /base",
    );
  });
});

describe("determineSpecificType via ERR_INVALID_ARG_TYPE 'Received' tail", () => {
  const cases: Array<[string, unknown, string]> = [
    ["bigint", 10n, "Received type bigint (10n)"],
    ["negative zero", -0, "Received type number (-0)"],
    ["zero", 0, "Received type number (0)"],
    ["NaN", Number.NaN, "Received type number (NaN)"],
    [
      "positive infinity",
      Number.POSITIVE_INFINITY,
      "Received type number (Infinity)",
    ],
    [
      "negative infinity",
      Number.NEGATIVE_INFINITY,
      "Received type number (-Infinity)",
    ],
    ["boolean", true, "Received type boolean (true)"],
    ["symbol", Symbol("s"), "Received type symbol (Symbol(s))"],
    ["short string", "abc", "Received type string ('abc')"],
    ["null", null, "Received null"],
    ["undefined", undefined, "Received undefined"],
  ];

  for (const [label, value, expected] of cases) {
    it(`describes ${label}`, () => {
      const message = new ERR_INVALID_ARG_TYPE("x", "string", value).message;
      expect(message.endsWith(expected)).toBe(true);
    });
  }
});
