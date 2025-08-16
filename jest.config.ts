module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  coverageProvider: "v8", // Use V8 coverage provider for better function name detection
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
  ],
  coverageReporters: ["text", "lcov", "html"],
  coverageDirectory: "coverage",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  testSequencer: "<rootDir>/jest-sequencer.ts",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
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
  verbose: true,
};
