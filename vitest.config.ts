import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Lets the cache retention test in `test/resolve.test.ts` call `gc()`.
    execArgv: ["--expose-gc"],
  },
});
