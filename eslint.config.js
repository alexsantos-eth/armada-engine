// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "public", "Claude outputs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.js", "vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": ["error", { allow: ["info", "warn", "error"] }],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      // `expect(object.method)` reads a mocked method without calling it.
      "@typescript-eslint/unbound-method": "off",
      // Asymmetric matchers (`expect.any()`, `expect.objectContaining()`) are typed `any`.
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Last: turns off stylistic rules that would fight Prettier's output.
  prettier,
);
