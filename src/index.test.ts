import * as core from "@actions/core";
import { getInputs } from "./index";

// Mock the @actions/core module
jest.mock("@actions/core");
const mockedCore = core as jest.Mocked<typeof core>;

describe("getInputs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return inputs when they are provided", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./foo/bar.info";
      if (name === "coverage-threshold") return "85";
      if (name === "target-branch") return "baz";
      if (name === "github-token") return "test-token";
      if (name === "label") return "test-label";
      if (name === "source-code-pattern") return "src/**/*.ts";
      if (name === "test-code-pattern") return "**/*.test.ts";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./foo/bar.info",
      coverageThreshold: "85",
      targetBranch: "baz",
      githubToken: "test-token",
      label: "test-label",
      sourceCodePattern: "src/**/*.ts",
      testCodePattern: "**/*.test.ts",
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("lcov-file");
    expect(mockedCore.getInput).toHaveBeenCalledWith("coverage-threshold");
    expect(mockedCore.getInput).toHaveBeenCalledWith("target-branch");
    expect(mockedCore.getInput).toHaveBeenCalledWith("github-token", {
      required: true,
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("label");
    expect(mockedCore.getInput).toHaveBeenCalledWith("source-code-pattern");
    expect(mockedCore.getInput).toHaveBeenCalledWith("test-code-pattern");
  });

  it("should return default values when inputs are not provided", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle partial inputs correctly", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./test/lcov.info";
      if (name === "coverage-threshold") return "";
      if (name === "target-branch") return "develop";
      if (name === "github-token") return "test-token";
      if (name === "label") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./test/lcov.info",
      coverageThreshold: "80",
      targetBranch: "develop",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle empty string inputs by using defaults", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "";
      if (name === "coverage-threshold") return "";
      if (name === "target-branch") return "";
      if (name === "github-token") return "test-token";
      if (name === "label") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle custom target branch", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "coverage/lcov.info";
      if (name === "coverage-threshold") return "90";
      if (name === "target-branch") return "develop";
      if (name === "github-token") return "test-token";
      if (name === "label") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "90",
      targetBranch: "develop",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: undefined,
      testCodePattern: undefined,
    });
  });

  it("should handle source code and test patterns", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "source-code-pattern") return "src/**/*.ts,lib/**/*.js";
      if (name === "test-code-pattern") return "**/*.test.*,**/*.spec.*";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: "src/**/*.ts,lib/**/*.js",
      testCodePattern: "**/*.test.*,**/*.spec.*",
    });
  });

  it("should handle mixed pattern and empty inputs", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "source-code-pattern") return "app/**/*.py";
      if (name === "test-code-pattern") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "test-token",
      label: undefined,
      sourceCodePattern: "app/**/*.py",
      testCodePattern: undefined,
    });
  });
});
