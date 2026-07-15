// @ts-check
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

/**
 * Root flat config. Enforces strict TypeScript, import ordering, unused-import
 * detection, and the package import boundaries from docs/CODING_STANDARDS.md §4.
 *
 * Boundaries are enforced with `no-restricted-imports` (specifier-based, so no
 * resolver is required to catch a violation). See Dev PRD §4.1.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/expo-dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/next-env.d.ts",
      "**/.eslintrc.*",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: {
      "import-x": importX,
      "unused-imports": unusedImports,
    },
    settings: {
      // Pin the tsconfig set: resolution (and thus import-x/order grouping of
      // `@/*` aliases) must not depend on eslint's cwd — repo-root lint-staged
      // and per-app `eslint .` used to disagree and ping-pong import order.
      "import-x/resolver": {
        typescript: {
          project: ["tsconfig.base.json", "apps/*/tsconfig.json", "packages/*/tsconfig.json"],
        },
        node: true,
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-cycle": "error",
    },
  },

  // --- package import boundaries (docs/CODING_STANDARDS.md §4) ---

  // core: pure domain — only types/constants/utils, never frameworks or data/IO.
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-*",
                "next",
                "next/*",
                "@prisma/client",
                "@repo/db",
                "@repo/api",
                "@repo/auth",
                "@repo/notifications",
                "@repo/ui",
              ],
              message:
                "packages/core must stay framework-agnostic: import only @repo/types, @repo/constants, @repo/utils.",
            },
          ],
        },
      ],
    },
  },

  // business: orchestration — no UI frameworks.
  {
    files: ["packages/business/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-*", "next", "next/*", "@repo/ui"],
              message: "packages/business must not depend on UI frameworks.",
            },
          ],
        },
      ],
    },
  },

  // api: transport — must call @repo/business, never the DB directly.
  {
    files: ["packages/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "@repo/db"],
              message:
                "packages/api routers are transport-only: call @repo/business, never @prisma/client or @repo/db.",
            },
          ],
        },
      ],
    },
  },

  // db: only this package may import Prisma (ADR-003). Nothing extra to restrict here.

  // apps: talk to the server via @repo/api; never import db/business/prisma.
  {
    files: ["apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "@repo/db", "@repo/business"],
              message:
                "apps must use @repo/api (client) — never import @repo/db, @repo/business, or @prisma/client.",
            },
          ],
        },
      ],
    },
  },

  eslintConfigPrettier,
);
