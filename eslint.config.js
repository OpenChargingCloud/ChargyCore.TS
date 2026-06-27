import js       from "@eslint/js";
import globals  from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      ".npm-cache/**",
      "src/edl40-isa-ts/**",
      "*.tgz"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map(config => ({
    ...config,
    files: ["**/*.ts"]
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "prefer-const":                                                "error",
      "@typescript-eslint/no-explicit-any":                          "error",
      "@typescript-eslint/no-empty-object-type":                     "error",
      "@typescript-eslint/no-base-to-string":                        "error",
      "@typescript-eslint/await-thenable":                           "error",
      "@typescript-eslint/adjacent-overload-signatures":             "error",
      "@typescript-eslint/explicit-function-return-type":            "error",
      "@typescript-eslint/explicit-module-boundary-types":           "error",
      "@typescript-eslint/no-extraneous-class":                      "error",
      "@typescript-eslint/no-duplicate-enum-values":                 "error",
      "@typescript-eslint/no-floating-promises":                     "error",
      "@typescript-eslint/no-implied-eval":                          "error",
      "@typescript-eslint/no-confusing-void-expression":             "error",
      "@typescript-eslint/no-array-delete":                          "error",
      "@typescript-eslint/no-dynamic-delete":                        "error",
      "@typescript-eslint/no-import-type-side-effects":              "error",
      "@typescript-eslint/no-invalid-void-type":                     "error",
      "@typescript-eslint/no-meaningless-void-operator":             "error",
      "@typescript-eslint/no-misused-promises":                      "error",
      "@typescript-eslint/no-non-null-assertion":                    "error",
      "@typescript-eslint/no-unnecessary-condition":                 "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare":   "error",
      "@typescript-eslint/no-unnecessary-type-assertion":            "error",
      "@typescript-eslint/no-unnecessary-type-conversion":           "error",
      "@typescript-eslint/no-unnecessary-type-parameters":           "error",
      "@typescript-eslint/only-throw-error":                         "error",
      "@typescript-eslint/prefer-nullish-coalescing":                "error",
      "@typescript-eslint/prefer-optional-chain":                    "error",
      "@typescript-eslint/prefer-includes":                          "error",
      "@typescript-eslint/prefer-string-starts-ends-with":           "error",
      "@typescript-eslint/prefer-as-const":                          "error",
      "@typescript-eslint/prefer-find":                              "error",
      "@typescript-eslint/prefer-for-of":                            "error",
      "@typescript-eslint/prefer-function-type":                     "error",
      "@typescript-eslint/prefer-readonly":                          "error",
      "@typescript-eslint/promise-function-async":                   "error",
      "@typescript-eslint/require-array-sort-compare":               "error",
      "@typescript-eslint/no-unsafe-argument":                       "error",
      "@typescript-eslint/no-unsafe-assignment":                     "error",
      "@typescript-eslint/no-unsafe-call":                           "error",
      "@typescript-eslint/no-unsafe-enum-comparison":                "error",
      "@typescript-eslint/no-unsafe-member-access":                  "error",
      "@typescript-eslint/no-unsafe-return":                         "error",
      "@typescript-eslint/consistent-type-imports":                  "error",
      "@typescript-eslint/require-await":                            "error",
      "@typescript-eslint/no-non-null-asserted-optional-chain":      "error",
      "@typescript-eslint/no-useless-constructor":                   "error",
      "@typescript-eslint/return-await":                             [ "error", "in-try-catch" ],
      "@typescript-eslint/restrict-plus-operands":                   "error",
      "@typescript-eslint/restrict-template-expressions":            [ "error", { allowNumber: true } ],
      "@typescript-eslint/strict-boolean-expressions":               "error",
      "@typescript-eslint/switch-exhaustiveness-check":              [ "error", { considerDefaultExhaustiveForUnions: true } ],
      "@typescript-eslint/unified-signatures":                       "error",
      "@typescript-eslint/no-unused-vars": [
          "error",
          {
              argsIgnorePattern: "^_",
              varsIgnorePattern: "^_",
              caughtErrorsIgnorePattern: "^_"
          }
      ],
      "no-case-declarations":                                        "off",
      "no-sparse-arrays":                                            "off",
      "no-prototype-builtins":                                       "off"
    }
  },
  {
      files: ["tests/browser/**/*.js"],
      languageOptions: {
          globals: {
              ...globals.browser
          }
      }
  },
  {
    files: ["tests/build/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
);
