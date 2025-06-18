import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["test/**/*.node.test.ts"],
        },
      },
      {
        test: {
          name: "happy-dom",
          environment: "happy-dom",
          include: ["test/**/*.polyfill.test.ts"],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["test/**/*.polyfill.test.ts"],
        },
      },
    ],
  },
});
