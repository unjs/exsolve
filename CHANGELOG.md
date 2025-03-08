# Changelog


## v1.0.4

[compare changes](https://github.com/unjs/exsolve/compare/v1.0.3...v1.0.4)

### 🩹 Fixes

- Use bundled `nodeBuiltins` for internal implementation ([#18](https://github.com/unjs/exsolve/pull/18))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v1.0.3

[compare changes](https://github.com/unjs/exsolve/compare/v1.0.2...v1.0.3)

### 🩹 Fixes

- Keep a copy of node.js builtin modules ([#17](https://github.com/unjs/exsolve/pull/17))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v1.0.1

[compare changes](https://github.com/unjs/exsolve/compare/v1.0.0...v1.0.1)

### 🩹 Fixes

- **resolveModulePath:** Do not throw with try on non file:// result ([b61dea9](https://github.com/unjs/exsolve/commit/b61dea9))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v1.0.0

[compare changes](https://github.com/unjs/exsolve/compare/v0.4.4...v1.0.0)

### 🏡 Chore

- Simplify package.json ([49cfd75](https://github.com/unjs/exsolve/commit/49cfd75))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.4.4

[compare changes](https://github.com/unjs/exsolve/compare/v0.4.3...v0.4.4)

### 🚀 Enhancements

- **resolveModulePath:** Normalize windows paths ([#14](https://github.com/unjs/exsolve/pull/14))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.4.3

[compare changes](https://github.com/unjs/exsolve/compare/v0.4.2...v0.4.3)

### 🩹 Fixes

- Ensure no `//` in joined paths ([#13](https://github.com/unjs/exsolve/pull/13))

### ❤️ Contributors

- Daniel Roe ([@danielroe](http://github.com/danielroe))

## v0.4.2

[compare changes](https://github.com/unjs/exsolve/compare/v0.4.1...v0.4.2)

### 🩹 Fixes

- Resolve modules using full url ([#12](https://github.com/unjs/exsolve/pull/12))
- Handle missing subpath as not found error ([80185bf](https://github.com/unjs/exsolve/commit/80185bf))

### 💅 Refactors

- Rework input normalization ([#11](https://github.com/unjs/exsolve/pull/11))
- Remove windows workaround ([8a12c0f](https://github.com/unjs/exsolve/commit/8a12c0f))

### 🏡 Chore

- Update pnpm ([0d4acd3](https://github.com/unjs/exsolve/commit/0d4acd3))

### ✅ Tests

- Add regression tests (#8, #9, #10) ([#8](https://github.com/unjs/exsolve/issues/8), [#9](https://github.com/unjs/exsolve/issues/9), [#10](https://github.com/unjs/exsolve/issues/10))
- Update windows test ([b4771c8](https://github.com/unjs/exsolve/commit/b4771c8))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))
- Daniel Roe ([@danielroe](http://github.com/danielroe))

## v0.4.1

[compare changes](https://github.com/unjs/exsolve/compare/v0.4.0...v0.4.1)

### 🩹 Fixes

- Always apply custom suffix ([211f0fc](https://github.com/unjs/exsolve/commit/211f0fc))

### 📖 Documentation

- Tiny typo ([#6](https://github.com/unjs/exsolve/pull/6))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))
- @beer ([@iiio2](http://github.com/iiio2))

## v0.4.0

[compare changes](https://github.com/unjs/exsolve/compare/v0.3.2...v0.4.0)

### 🔥 Performance

- Only test for protocol at beginning of id ([#4](https://github.com/unjs/exsolve/pull/4))
- **createResolver:** Normalize default `from` once ([71432c8](https://github.com/unjs/exsolve/commit/71432c8))

### 🩹 Fixes

- Normalise windows urls ([#5](https://github.com/unjs/exsolve/pull/5))

### 💅 Refactors

- ⚠️  Allow reorder `""` suffix ([69ab48c](https://github.com/unjs/exsolve/commit/69ab48c))

#### ⚠️ Breaking Changes

- ⚠️  Allow reorder `""` suffix ([69ab48c](https://github.com/unjs/exsolve/commit/69ab48c))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))
- Daniel Roe ([@danielroe](http://github.com/danielroe))

## v0.3.2

[compare changes](https://github.com/unjs/exsolve/compare/v0.3.1...v0.3.2)

### 🩹 Fixes

- Return `file://` url in absolute fast path ([9c99a04](https://github.com/unjs/exsolve/commit/9c99a04))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.3.1

[compare changes](https://github.com/unjs/exsolve/compare/v0.3.0...v0.3.1)

### 🩹 Fixes

- Handle `try` when cache hits ([ec75a93](https://github.com/unjs/exsolve/commit/ec75a93))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.3.0

[compare changes](https://github.com/unjs/exsolve/compare/v0.2.0...v0.3.0)

### 🚀 Enhancements

- `createResolver` ([064396b](https://github.com/unjs/exsolve/commit/064396b))
- Resolve cache ([d4ef4e9](https://github.com/unjs/exsolve/commit/d4ef4e9))

### 🔥 Performance

- ⚠️  Remove default extra fallbacks ([6b8cd74](https://github.com/unjs/exsolve/commit/6b8cd74))

### 🏡 Chore

- **release:** V0.2.0 ([bff9874](https://github.com/unjs/exsolve/commit/bff9874))
- Add pkg size badge ([a9a5b25](https://github.com/unjs/exsolve/commit/a9a5b25))
- Update docs ([28ea154](https://github.com/unjs/exsolve/commit/28ea154))
- Update docs ([4cb89e2](https://github.com/unjs/exsolve/commit/4cb89e2))

#### ⚠️ Breaking Changes

- ⚠️  Remove default extra fallbacks ([6b8cd74](https://github.com/unjs/exsolve/commit/6b8cd74))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.2.0

[compare changes](https://github.com/unjs/exsolve/compare/v0.1.4...v0.2.0)

### 🔥 Performance

- ⚠️  Remove default extra fallbacks ([6b8cd74](https://github.com/unjs/exsolve/commit/6b8cd74))

#### ⚠️ Breaking Changes

- ⚠️  Remove default extra fallbacks ([6b8cd74](https://github.com/unjs/exsolve/commit/6b8cd74))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.1.4

[compare changes](https://github.com/unjs/exsolve/compare/v0.1.3...v0.1.4)

### 🩹 Fixes

- Handle `try` option ([b1cec8a](https://github.com/unjs/exsolve/commit/b1cec8a))

### 💅 Refactors

- Less verbose error ([43e8f04](https://github.com/unjs/exsolve/commit/43e8f04))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.1.3

[compare changes](https://github.com/unjs/exsolve/compare/v0.1.2...v0.1.3)

### 🔥 Performance

- Skip fallback when both ext and suffix are empty ([32aa3fd](https://github.com/unjs/exsolve/commit/32aa3fd))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.1.2

[compare changes](https://github.com/unjs/exsolve/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- `try` option ([f2275eb](https://github.com/unjs/exsolve/commit/f2275eb))

### 🏡 Chore

- Prettier ignore changelog ([408d81b](https://github.com/unjs/exsolve/commit/408d81b))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

## v0.1.1

[compare changes](https://github.com/unjs/exsolve/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- Support custom suffixes ([dad6cb4](https://github.com/unjs/exsolve/commit/dad6cb4))
- Support ts extensions by default ([d5684d7](https://github.com/unjs/exsolve/commit/d5684d7))

### 🔥 Performance

- Avoid extension checks if id has extension ([5638cde](https://github.com/unjs/exsolve/commit/5638cde))
- Skip same suffixes ([01ce3ad](https://github.com/unjs/exsolve/commit/01ce3ad))

### 💅 Refactors

- Sync `get-format` with upstream ([11a8a79](https://github.com/unjs/exsolve/commit/11a8a79))
- Rename to internal ([5c7730b](https://github.com/unjs/exsolve/commit/5c7730b))
- Remove all external deps ([42ce8c1](https://github.com/unjs/exsolve/commit/42ce8c1))
- Rename to `exsolve` ([e5c9646](https://github.com/unjs/exsolve/commit/e5c9646))

### 📖 Documentation

- Add performance tips section ([fb7228f](https://github.com/unjs/exsolve/commit/fb7228f))
- Add perf note about `from` ([f57e220](https://github.com/unjs/exsolve/commit/f57e220))

### 🏡 Chore

- Remove unused type ([806b9be](https://github.com/unjs/exsolve/commit/806b9be))
- Update test ([58d3847](https://github.com/unjs/exsolve/commit/58d3847))
- Update docs ([1e72c22](https://github.com/unjs/exsolve/commit/1e72c22))
- Update docs ([949f80c](https://github.com/unjs/exsolve/commit/949f80c))

### ✅ Tests

- Fix for windows ([80e9f75](https://github.com/unjs/exsolve/commit/80e9f75))

### 🤖 CI

- Run on macos and windows too ([578efa9](https://github.com/unjs/exsolve/commit/578efa9))
- Lint on linux only ([9c42ad6](https://github.com/unjs/exsolve/commit/9c42ad6))

### ❤️ Contributors

- Pooya Parsa ([@pi0](http://github.com/pi0))

