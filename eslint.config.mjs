import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        ignores: ["node_modules/**", "dist/**", "*.config.js", ".devcontainer/**", "coverage/**"],
    },
    {
        files: ["**/*.{js,cjs}"],
        ...js.configs.recommended,
        languageOptions: {
            ...js.configs.recommended.languageOptions,
            sourceType: "commonjs",
            globals: globals.node,
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-constant-condition": ["error", { checkLoops: false }],
            "no-unused-vars": [
                "warn",
                {
                    args: "none",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    {
        files: ["**/*.mjs"],
        ...js.configs.recommended,
        languageOptions: {
            ...js.configs.recommended.languageOptions,
            sourceType: "module",
            globals: globals.node,
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-constant-condition": ["error", { checkLoops: false }],
            "no-unused-vars": [
                "warn",
                {
                    args: "none",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    {
        files: ["migrations/**/*.js"],
        rules: {
            "no-unused-vars": "off",
        },
    },
    {
        files: ["ronja_modules/Example.js"],
        rules: {
            "no-dupe-keys": "off",
            "no-constant-condition": "off",
            "no-unused-vars": "off",
        },
    },
    { files: ["**/*.json"], plugins: { json }, language: "json/json" },
    { files: ["**/*.md"], plugins: { markdown }, language: "markdown/gfm" },
    eslintConfigPrettier,
]);
