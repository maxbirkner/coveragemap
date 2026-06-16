// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // The esbuild build script is a Node ESM module, not part of the typed
    // source tree. Provide the Node globals it relies on (console, process)
    // and skip the type-aware rules that target src/.
    files: ["build.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
);
