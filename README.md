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
- Can override the default [conditions](#conditions).
- Can resolve [from](#from) one or more parent URLs.
- Can resolve with implicit `/index` [suffix](#suffixes) as fallback.
- Can resolve with implicit [extensions](#extensions) if not provided.

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

## Performance tips

Resolution can be an expensive operation with various fallbacks and filesystem checks. By making stricter assumptions, we can reduce this.

### Disable [`suffixes`](#suffixes) and [`extensions`](#extensions)

Use `{ suffixes: [], extensions: [] }` and make sure resolve is always called with `./utils/index.ts` instead of `./utils`.

### Use explicit module extensions `.mjs` or `.cjs` instead of `.js`

This allows resolution fast-path to skip reading the closest `package.json` for the [`type`](https://nodejs.org/api/packages.html#type).

### Make sure [`from`](#from) are explicit file URLs

The paths set for [`from`](#from) should be absolute paths to the file that is requesting resolve.
If it is set to an absolute path, resolver needs to first stat it to see if it is a file or directory.
If input is `file://`, a URL or ends with `/`, resolver can skip this check.

## Resolve options

### `from`

- Default: (current working directory)

A URL, path or array of URLs/paths to resolve module against them.

You can use `import.meta.url` for `from` to make behavior like `import.meta.resolve()`.

### `conditions`

- Default: `["node", "import"]`

Conditions to apply when resolving package exports.

### `suffixes`

- Default: `["/index"]`

Suffixes to check as fallback.

> [!NOTE]
> For performance, suffix fallbacks are skipped if input itself ends with the same suffix.

### `extensions`

- Default `[".mjs", ".cjs", ".js", ".mts", ".cts", ".ts", ".json"]`

Additional file extensions to consider when resolving modules.

> [!NOTE]
> For performance, extension fallbacks are only checked if input does not have an explicit extension.

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
