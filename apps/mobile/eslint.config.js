// Mobile app lint config: Expo's recommended rules (React, hooks, RN). The root config covers
// the API and shared packages; this workspace is linted separately via `expo lint` (ESLint 9,
// which eslint-plugin-react still requires).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'expo-env.d.ts'],
  },
  {
    rules: {
      'no-console': 'error',
      // Import resolution is enforced by `tsc --noEmit`; the eslint-plugin-import TypeScript
      // resolver bundled with this Expo config fails to load ("invalid interface"), so the
      // resolver-dependent rules are turned off rather than half-working.
      'import/namespace': 'off',
      'import/no-unresolved': 'off',
      'import/named': 'off',
      'import/default': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-duplicates': 'off',
      'import/export': 'off',
    },
  },
]);
