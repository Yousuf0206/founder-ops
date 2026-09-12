// Test stub for the `server-only` package.
//
// `server-only` throws at build time if a server module is imported into a
// client bundle. Vitest has no such bundle, so it cannot resolve the package —
// aliasing it to this empty module lets server modules be unit-tested directly.
// The real guard still applies to every `next build`.
export {};
