import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint v9+ 使用 Flat Config（eslint.config.*）。
 * 约束：ESLint 管正确性，Prettier 管格式（通过 eslint-config-prettier 关闭冲突规则）。
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.sisyphus/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      // 对 TS 工程，no-undef 交给 TypeScript
      'no-undef': 'off',

      // 合并各插件推荐规则
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      // React 17+ / 新 JSX Transform 下无需显式 import React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // 允许以下划线开头的“刻意不用”变量
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // 关闭与 Prettier 冲突的格式化规则
  prettierConfig,
];
