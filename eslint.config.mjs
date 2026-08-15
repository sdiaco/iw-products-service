import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    settings: {
      'import-x/resolver': { node: { extensions: ['.ts', '.js'] } },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      // NestJS module/controller/service classes are decorator-driven and
      // legitimately have no members — the DI decorator is the class's purpose.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Destructuring a key out of an object to omit it (`const { a, ...rest } = obj`)
      // leaves the extracted binding unused by design; this is not a real dead variable.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'sequelize',
              message:
                'The ORM may only be imported under src/**/repository/, src/database/, db/ or test/.',
            },
          ],
        },
      ],
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/products/controller',
              from: './src/products/repository',
              message: 'The controller must not reach the repository.',
            },
          ],
        },
      ],
    },
  },
  {
    // The layers that are allowed to know the ORM exists.
    files: ['src/**/repository/**/*.ts', 'src/database/**/*.ts', 'db/**/*.ts', 'test/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The flat config file itself is tooling, not application source — it does not
    // belong to tsconfig.json's project and does not need type-aware linting.
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
