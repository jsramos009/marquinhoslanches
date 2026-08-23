import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const newModuleFiles = [
  "scripts/validate-isolated-migration.mjs",
  "src/components/admin/{DiningReceipt,DiningTablesPanel,KitchenTicket}.tsx",
  "src/lib/{dining-domain,dining.functions,print-domain,print.functions,supabase-dynamic}.ts",
  "src/routes/_authenticated/admin.impressao.tsx",
  "src/types/**/*.d.ts",
  "tests/unit/**/*.ts",
];

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "supabase/.temp", "supabase/.branches"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: newModuleFiles,
    rules: {
      // Baseline exceptions are scoped to preexisting modules only. New dining,
      // printing, validation and test files retain the recommended strict rules.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-empty": "off",
      "prefer-const": "off",
    },
  },
  eslintPluginPrettier,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    ignores: newModuleFiles,
    rules: {
      // Preexisting Windows files contain mixed line endings. The new module files
      // are excluded from this override and remain checked by Prettier above.
      "prettier/prettier": "off",
    },
  },
);
