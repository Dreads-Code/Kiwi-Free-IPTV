import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";
import eslintReact from "@eslint-react/eslint-plugin";

export default defineConfig([
  { ignores: ["dist", "dev-dist", "src/wasm"] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      sonarjs.configs.recommended,
      unicorn.configs.recommended,
      eslintReact.configs.recommended,
    ],
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: String(import.meta.dirname),
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // @eslint-react/recommended enables a set of modern React rules
      // with no-array-index-key, no-duplicate-key, etc. enabled by default.

      // TypeScript
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],

      // Unicorn — disable rules that conflict with React/TS conventions or are too opinionated
      "unicorn/prevent-abbreviations": "off", // too noisy for React (props, ref, err, etc.)
      "unicorn/no-null": "off", // null is idiomatic in React (refs, optional values)
      "unicorn/filename-case": "off", // PascalCase components are standard React
      "unicorn/no-array-for-each": "off", // for...of preferred but not critical here
      "unicorn/no-array-reduce": "off", // reduce has legitimate uses
      "unicorn/prefer-top-level-await": "off", // not applicable in component files
      "unicorn/prefer-query-selector": "off",
      "unicorn/prefer-module": "off", // vite handles module transforms
    },
  },
]);
