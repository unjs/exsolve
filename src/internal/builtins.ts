/*
 * Extracted from Node.js v24.16.0 (`require('node:module').builtinModules`).
 * For some reason, Bun decided to extend "node:modules" with bun specific modules which makes it unreliable source.
 *
 * Note: This list intentionally contains only modules that are requirable WITHOUT
 * the `node:` prefix (used to map a bare specifier like `fs` to `node:fs`).
 * The `node:`-prefix-only modules added in recent Node releases
 * (`node:sea`, `node:sqlite`, `node:test`, `node:test/reporters`) are deliberately
 * excluded: their bare forms (e.g. `sqlite`) do not resolve in Node, and `node:`
 * prefixed specifiers are already handled before this list is consulted.
 */
// prettier-ignore
export const nodeBuiltins = [
    '_http_agent',         '_http_client',        '_http_common',
    '_http_incoming',      '_http_outgoing',      '_http_server',
    '_stream_duplex',      '_stream_passthrough', '_stream_readable',
    '_stream_transform',   '_stream_wrap',        '_stream_writable',
    '_tls_common',         '_tls_wrap',           'assert',
    'assert/strict',       'async_hooks',         'buffer',
    'child_process',       'cluster',             'console',
    'constants',           'crypto',              'dgram',
    'diagnostics_channel', 'dns',                 'dns/promises',
    'domain',              'events',              'fs',
    'fs/promises',         'http',                'http2',
    'https',               'inspector',           'inspector/promises',
    'module',              'net',                 'os',
    'path',                'path/posix',          'path/win32',
    'perf_hooks',          'process',             'punycode',
    'querystring',         'readline',            'readline/promises',
    'repl',                'stream',              'stream/consumers',
    'stream/promises',     'stream/web',          'string_decoder',
    'sys',                 'timers',              'timers/promises',
    'tls',                 'trace_events',        'tty',
    'url',                 'util',                'util/types',
    'v8',                  'vm',                  'wasi',
    'worker_threads',      'zlib'
]
