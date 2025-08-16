import * as core from "@actions/core";
import { getInputs, ActionInputs } from "./index";

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
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./foo/bar.info",
      coverageThreshold: "85",
      targetBranch: "baz",
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("lcov-file");
    expect(mockedCore.getInput).toHaveBeenCalledWith("coverage-threshold");
    expect(mockedCore.getInput).toHaveBeenCalledWith("target-branch");
  });

  it("should return default values when inputs are not provided", () => {
    mockedCore.getInput.mockReturnValue("");

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
    });
  });

  it("should handle partial inputs correctly", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./test/lcov.info";
      if (name === "coverage-threshold") return "";
      if (name === "target-branch") return "develop";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./test/lcov.info",
      coverageThreshold: "80",
      targetBranch: "develop",
    });
  });

  it("should handle empty string inputs by using defaults", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "";
      if (name === "coverage-threshold") return "";
      if (name === "target-branch") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      targetBranch: "main",
    });
  });

  it("should handle custom target branch", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "coverage/lcov.info";
      if (name === "coverage-threshold") return "90";
      if (name === "target-branch") return "develop";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "90",
      targetBranch: "develop",
    });
  });
});
