# ores

<!-- automd:badges color=yellow -->

[![npm version](https://img.shields.io/npm/v/ores?color=yellow)](https://npmjs.com/package/ores)
[![npm downloads](https://img.shields.io/npm/dm/ores?color=yellow)](https://npm.chart.dev/ores)

<!-- /automd -->

> Module resolution utilities for Node.js (based on previous work in [unjs/mlly](https://github.com/unjs/mlly), [wooorm/import-meta-resolve](https://github.com/wooorm/import-meta-resolve), and the upstream [Node.js](https://github.com/nodejs/node) implementation).

This library exposes an API similar to [`import.meta.resolve`](https://nodejs.org/api/esm.html#importmetaresolvespecifier) based on Node.js's upstream implementation and [resolution algorithm](https://nodejs.org/api/esm.html#esm_resolution_algorithm). It supports all built-in functionalities—import maps, export maps, CJS, and ESM—with some additions:

- Pure JS with no native dependencies (only Node.js is required).
- Throws an error if the resolved path does not exist in the filesystem.
- Can override the default [conditions](#conditions).
- Can resolve [from](#from) one or more parent URLs.
- Can resolve with implicit `/index` [suffixes](#suffixes) as a fallback.
- Can resolve with implicit [extensions](#extensions) if as fallback.

## Usage

Install the package:

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
  - If the resolved URL does not use the `file://` scheme (e.g., `data:` or `node:`), it will throw an error.

## Resolve options

### `from`

A URL, path, or array of URLs/paths to resolve the module from.

If not provided, the resolution will start from the current working directory, but setting it is highly recommended.

You can use `import.meta.url` for `from` to mimic the behavior of `import.meta.resolve()`.

> [!TIP]
> For better performance, ensure the value is a `file://` URL.
>
> If it is set to an absolute path, the resolver first checks the filesystem to determine if it is a file or directory.
> If the input is a `file://` URL or ends with `/`, the resolver can skip this check.

### `conditions`

Conditions to apply when resolving package exports (default: `["node", "import"]`).

### `suffixes`

Suffixes to check as fallbacks (default: `["/index"]`).

> [!TIP]
> Suffix fallbacks are skipped if the input ends with the same suffix.
>
> For better performance, always use explicit `/index` when needed.
>
> You can disable suffix fallbacks by setting `suffixes: []`.

### `extensions`

Additional file extensions to check as fallbacks (default: `[".mjs", ".cjs", ".js", ".mts", ".cts", ".ts", ".json"]`).

> [!TIP]
> Extension fallbacks are only checked if the input does not have an explicit extension.
>
> For better performance, ensure the input ends with an explicit extension.
>
> You can disable extension fallbacks by setting `extensions: []`.

## Other Performance Tips

**Use explicit module extensions `.mjs` or `.cjs` instead of `.js`:**

This allows the resolution fast path to skip reading the closest `package.json` for the [`type`](https://nodejs.org/api/packages.html#type).

## Development

<details>

<summary>local development</summary>

- Clone this repository
- Install the latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## License

Published under the [MIT](https://github.com/unjs/ores/blob/main/LICENSE) license.

Based on previous work in [unjs/mlly](https://github.com/unjs/mlly), [wooorm/import-meta-resolve](https://github.com/wooorm/import-meta-resolve) and [Node.js](https://github.com/nodejs/node) original implementation.
