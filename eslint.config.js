// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/*'],
  },
  {
    // The MCP SDK resolves through its package.json "exports" map, which TypeScript understands but
    // eslint-plugin-import's resolver doesn't.
    rules: { 'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/sdk/'] }] },
  },
]);
