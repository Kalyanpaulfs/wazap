import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// Flat ESLint configuration without the vulnerable fast-glob/braces chain.
export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "mobile/**", "extension/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{jsx,tsx}"],
    ...react.configs.flat.recommended,
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      "react/prop-types": "off",
    },
  },
  reactHooks.configs.flat.recommended,
]);
