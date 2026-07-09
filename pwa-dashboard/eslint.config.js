import reactHooks from 'eslint-plugin-react-hooks';

// ponytail: lint ciblé rules-of-hooks (cause du black screen de juillet 2026).
// Le preset recommended v7 (set-state-in-effect…) flaggue trop de code existant —
// élargir si on assainit ces patterns un jour.
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];
