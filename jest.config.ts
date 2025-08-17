module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
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
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        isolatedModules: false,
        tsconfig: {
          sourceMap: true,
          inlineSourceMap: false,
          inlineSources: false,
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
