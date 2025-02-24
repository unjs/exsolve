# ores

<!-- automd:badges color=yellow -->

[![npm version](https://img.shields.io/npm/v/ores?color=yellow)](https://npmjs.com/package/ores)
[![npm downloads](https://img.shields.io/npm/dm/ores?color=yellow)](https://npm.chart.dev/ores)

<!-- /automd -->

Node.js module resolution utils (based on previous work in [unjs/mlly](https://github.com/unjs/mlly), [wooorm/import-meta-resolve](https://github.com/wooorm/import-meta-resolve) and [Node.js](https://github.com/nodejs/node) upstream implementation.
)

This library exposes Node.js [`import.meta.resolve`](https://nodejs.org/api/esm.html#importmetaresolvespecifier) with respect of [ESM Resolution algorithm](https://nodejs.org/api/esm.html#esm_resolution_algorithm) and all built-in functionalities (`package.json`, import maps, export maps, CJS and ESM) with some additions:

- Pure JS without native dependencies (only Node.js required).
- Stable and versioned behavior.
- Throws error if the resolved path does not exists in the filesystem.
- Can resolve [`from`](#from) single or multiple parent url(s).
- Can override default [`conditions`](#conditions).

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

Different between `resolveModuleURL` and `resolveModulePath`:

- `resolveModuleURL` returns a URL string like `file:///app/dep.mjs`
- `resolveModulePath` returns an absolute path like `/app/dep.mjs`
  - If resolved url is not `file://` scheme (like `data:` or `node:`), it will throw an error

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
