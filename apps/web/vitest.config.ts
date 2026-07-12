import path from "node:path";

import { defineConfig } from "vitest/config";

// Mirror the tsconfig `@/*` alias so tests resolve app imports.
export default defineConfig({
  // Next's tsconfig uses `jsx: preserve`; tests need the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // The (app) layout now imports the shell, which transitively pulls in the
    // env module; skip its fail-fast validation in tests (as CI/build do).
    env: { SKIP_ENV_VALIDATION: "true" },
  },
});
