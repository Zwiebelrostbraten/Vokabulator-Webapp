import js from '@eslint/js';
import globals from 'globals';
export default [
  {ignores:['dist/**','node_modules/**','.wrangler/**','worker/.wrangler/**']},
  js.configs.recommended,
  {files:['**/*.mjs'],languageOptions:{globals:{...globals.browser,...globals.node}},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}}
];
