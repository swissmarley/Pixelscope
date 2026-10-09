import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default tseslint.config(
  { ignores: ["dist", "node_modules", "output"] },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Prettier owns line breaks, so this rule only conflicts with it.
      "no-unexpected-multiline": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["server/**/*.mjs", "scripts/**/*.mjs", "*.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
);
