import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
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
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'sequelize',
              message: 'The ORM may only be imported under repository/ or database/.',
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
