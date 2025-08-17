import * as core from "@actions/core";
import { getInputs } from "./index";

// Mock the @actions/core module
jest.mock("@actions/core");
const mockedCore = core as jest.Mocked<typeof core>;

describe("getInputs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return inputs when they are provided", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./foo/bar.info";
      if (name === "coverage-threshold") return "85";
      if (name === "target-branch") return "baz";
      if (name === "github-token") return "test-token";
      if (name === "label") return "test-label";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./foo/bar.info",
      coverageThreshold: "85",
      targetBranch: "baz",
      githubToken: "test-token",
      label: "test-label",
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("lcov-file");
    expect(mockedCore.getInput).toHaveBeenCalledWith("coverage-threshold");
    expect(mockedCore.getInput).toHaveBeenCalledWith("target-branch");
    expect(mockedCore.getInput).toHaveBeenCalledWith("github-token");
    expect(mockedCore.getInput).toHaveBeenCalledWith("label");
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
    });
  });

  it("should fall back to GITHUB_TOKEN environment variable when input is not provided", () => {
    process.env.GITHUB_TOKEN = "env-token";

    mockedCore.getInput.mockImplementation(() => {
      return ""; // All inputs empty
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: "env-token",
      label: undefined,
    });
  });

  it("should return undefined for github token when neither input nor env var is provided", () => {
    delete process.env.GITHUB_TOKEN;

    mockedCore.getInput.mockImplementation(() => {
      return ""; // All inputs empty
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
      githubToken: undefined,
      label: undefined,
    });
  });

  it("should prioritize input over environment variable", () => {
    process.env.GITHUB_TOKEN = "env-token";

    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "input-token";
      return "";
    });

    const result = getInputs();

    expect(result.githubToken).toBe("input-token");
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
    });
  });
});
