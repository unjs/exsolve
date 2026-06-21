import { describe, it, expect } from "vitest";
import { defaultGetFormatWithoutErrors } from "../src/internal/get-format.ts";

const context = { parentURL: import.meta.url };

const getFormat = (url: string) =>
  defaultGetFormatWithoutErrors(new URL(url), context);

describe("defaultGetFormatWithoutErrors", () => {
  describe("data: protocol (mime mapping + regex anchoring)", () => {
    it("maps text/javascript to module", () => {
      expect(getFormat("data:text/javascript,console.log(1)")).toBe("module");
    });

    it("maps application/javascript to module", () => {
      expect(getFormat("data:application/javascript,1")).toBe("module");
    });

    it("maps text/javascript with charset=utf-8 to module", () => {
      expect(getFormat("data:text/javascript;charset=utf-8,1")).toBe("module");
    });

    // Regression: the mime regex is now anchored (`/^...$/`). Previously it was
    // unanchored and would match `javascript` as a substring, wrongly returning
    // "module" for these mime types.
    it("does NOT match text/javascriptx (anchoring regression)", () => {
      expect(getFormat("data:text/javascriptx,1")).toBe(null);
    });

    it("does NOT match application/javascript-foo (anchoring regression)", () => {
      expect(getFormat("data:application/javascript-foo,1")).toBe(null);
    });

    it("maps application/json to json", () => {
      expect(getFormat("data:application/json,{}")).toBe("json");
    });

    it("returns null for text/plain", () => {
      expect(getFormat("data:text/plain,hello")).toBe(null);
    });
  });

  describe("node: protocol", () => {
    it("returns builtin", () => {
      expect(getFormat("node:fs")).toBe("builtin");
    });
  });

  describe("file: protocol with mapped extensions", () => {
    it("maps .json to json", () => {
      expect(getFormat("file:///tmp/x.json")).toBe("json");
    });

    it("maps .cjs to commonjs", () => {
      expect(getFormat("file:///tmp/x.cjs")).toBe("commonjs");
    });

    it("maps .mjs to module", () => {
      expect(getFormat("file:///tmp/x.mjs")).toBe("module");
    });

    // exsolve intentionally diverges from upstream: it does not strip types, so
    // TypeScript extensions map to plain module/commonjs (not the
    // `-typescript` variants). Pin that behavior.
    it("maps .mts to module", () => {
      expect(getFormat("file:///tmp/x.mts")).toBe("module");
    });

    it("maps .cts to commonjs", () => {
      expect(getFormat("file:///tmp/x.cts")).toBe("commonjs");
    });

    it("maps .ts to module", () => {
      expect(getFormat("file:///tmp/x.ts")).toBe("module");
    });

    it("returns null for an unknown extension", () => {
      // ignoreErrors is true, so unknown extension yields undefined → null.
      expect(getFormat("file:///tmp/x.foobar")).toBe(null);
    });
  });

  describe("extname edge cases", () => {
    // A leading-dot file like `.foobar`: extname() sees the `.` is preceded by
    // a SLASH, so it returns "" (no extension). That routes to the
    // extensionless branch; with no `type` in the controlling package.json
    // (none found walking up from /tmp), it falls back to "commonjs".
    it("treats a dotfile as extensionless (commonjs)", () => {
      expect(getFormat("file:///tmp/.foobar")).toBe("commonjs");
    });

    // A trailing dot: extname() returns ".", which is not in the map → null.
    it("returns null for a trailing-dot path", () => {
      expect(getFormat("file:///tmp/x.")).toBe(null);
    });
  });

  describe("unknown protocol", () => {
    it("returns null", () => {
      expect(getFormat("https://example.com/x.js")).toBe(null);
    });
  });
});
