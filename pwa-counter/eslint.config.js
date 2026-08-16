import reactHooks from 'eslint-plugin-react-hooks';

// Même parti que pwa-dashboard/eslint.config.js : on ne garde que les règles
// qui attrapent une vraie panne, pas du style. rules-of-hooks est la seule
// erreur bloquante — c'est la classe de bug qui casse un écran entier en
// pleine partie, et le compteur n'avait aucun lint jusqu'ici.
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
