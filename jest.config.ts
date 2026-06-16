module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // @actions/core, @actions/github and other dependencies are now ESM-only and
  // expose only the "import" condition in their package exports. The node test
  // environment defaults to ["node", "node-addons"], so the resolver needs the
  // "import" condition added to locate these packages; Node's require(ESM)
  // support (Node >= 24.9) then loads them from the CommonJS test runtime.
  testEnvironmentOptions: {
    customExportConditions: ["node", "import", "require", "default"],
  },
  coverageProvider: "v8", // Use V8 coverage provider for better function name detection
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "!src/__mocks__/**/*.ts",
  ],
  coverageReporters: ["text", "lcov", "html"],
  coverageDirectory: "coverage",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        isolatedModules: false,
        tsconfig: {
          sourceMap: true,
          inlineSourceMap: false,
          inlineSources: false,
          // Indexing arrays in test assertions (e.g. result[0]) is an
          // intentional pattern; an out-of-bounds access simply fails the
          // test. The production typecheck (npm run build) still enforces
          // noUncheckedIndexedAccess on source files.
          noUncheckedIndexedAccess: false,
        },
      },
    ],
  },
  moduleFileExtensions: ["ts", "js", "json", "node"],
  // Module name mapping for mocks
  moduleNameMapper: {
    "^@octokit/auth-app$": "<rootDir>/src/__mocks__/@octokit/auth-app.ts",
  },
  // Transform ES modules from node_modules
  transformIgnorePatterns: [
    "node_modules/(?!(@octokit|universal-user-agent)/)",
  ],
  verbose: true,
};
