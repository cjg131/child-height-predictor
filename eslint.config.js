// ESLint 9 flat config. Replaces .eslintrc.cjs, which ESLint 9 no longer reads
// (the repo shipped eslint ^9 with an eslintrc file, so `npm run lint` was
// dead on arrival).
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: '18.3' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Test files and the standalone math harness run under Node with Vitest globals.
  {
    files: ['**/__tests__/**/*.{js,jsx}', 'verify-math.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
