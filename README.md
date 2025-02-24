# ores

<!-- automd:badges color=yellow -->

[![npm version](https://img.shields.io/npm/v/ores?color=yellow)](https://npmjs.com/package/ores)
[![npm downloads](https://img.shields.io/npm/dm/ores?color=yellow)](https://npm.chart.dev/ores)

<!-- /automd -->

> Module resolution utilities for Node.js (based on previous work in [unjs/mlly](https://github.com/unjs/mlly), [wooorm/import-meta-resolve](https://github.com/wooorm/import-meta-resolve), and the upstream [Node.js](https://github.com/nodejs/node) implementation).

This library exposes an API similar to [`import.meta.resolve`](https://nodejs.org/api/esm.html#importmetaresolvespecifier) based on Node.js upstream implementation and [resolution algorithm](https://nodejs.org/api/esm.html#esm_resolution_algorithm). It supports all built-in functionalities—`package.json`, import maps, export maps, CJS, and ESM—with some additions:

- Pure JS with no native dependencies (only Node.js is required).
- Stable and versioned behavior.
- Throws an error if the resolved path does not exist in the filesystem.
- Can resolve [`from`](#from) using one or more parent URLs.
- Can override the default [`conditions`](#conditions).

## Usage

Install package:

```sh
# ✨ Auto-detect (npm, yarn, pnpm, bun, deno)
npx nypm install ores
```

Import:

```ts
// ESM import
import { resolveModuleURL, resolveModulePath } from "ores";

// Or using dynamic import
const { resolveModuleURL, resolveModulePath } = await import("ores");
```

```ts
resolveModuleURL(id, {
  /* options */
});

resolveModulePath(id, {
  /* options */
});
```

Differences between `resolveModuleURL` and `resolveModulePath`:

- `resolveModuleURL` returns a URL string like `file:///app/dep.mjs`.
- `resolveModulePath` returns an absolute path like `/app/dep.mjs`.
  - If the resolved URL does not use the `file://` scheme (for example, `data:` or `node:`), it will throw an error.

## Resolve options

### `from`

- Default: (current working directory)

A URL, path or array of URLs/paths to resolve module against them.

### `extensions`

- Default `[".mjs", ".cjs", ".js", ".json"]`

Additional file extensions to consider when resolving modules.

### `conditions`

- Default: `["node", "import"]`

Conditions to apply when resolving package exports.

## Development

<details>

<summary>local development</summary>

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## License

Published under the [MIT](https://github.com/unjs/ores/blob/main/LICENSE) license.

Based on previous work in [unjs/mlly](https://github.com/unjs/mlly), [wooorm/import-meta-resolve](https://github.com/wooorm/import-meta-resolve) and [Node.js](https://github.com/nodejs/node) original implementation.
