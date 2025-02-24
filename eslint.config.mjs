import unjs from "eslint-config-unjs";

export default unjs({
  ignores: [
    // ignore paths
  ],
  rules: {
    "unicorn/no-null": 0,
  },
  markdown: {
    rules: {
      // markdown rule overrides
    },
  },
});
