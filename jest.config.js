/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        strict: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
        moduleResolution: 'node',
        jsx: 'react-jsx', // lets component render tests (react-dom/server) compile .tsx
      },
    }],
  },
  moduleNameMapper: {
    // Mirrors tsconfig paths: '@/*' -> ['./src/*', './*'] (src first, then repo root).
    '^@/(.*)$': ['<rootDir>/src/$1', '<rootDir>/$1'],
  },
  transformIgnorePatterns: [
    '/node_modules/',
  ],
};
