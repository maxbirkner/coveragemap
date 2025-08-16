import * as core from "@actions/core";
import { getInputs, ActionInputs } from "../src/index";

// Mock the @actions/core module
jest.mock("@actions/core");
const mockedCore = core as jest.Mocked<typeof core>;

describe("getInputs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return inputs when they are provided", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./coverage/lcov.info";
      if (name === "coverage-threshold") return "85";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./coverage/lcov.info",
      coverageThreshold: "85",
    });
    expect(mockedCore.getInput).toHaveBeenCalledWith("lcov-file");
    expect(mockedCore.getInput).toHaveBeenCalledWith("coverage-threshold");
  });

  it("should return default messages when inputs are not provided", () => {
    mockedCore.getInput.mockReturnValue("");

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "No LCOV file specified",
      coverageThreshold: "No threshold specified",
    });
  });

  it("should handle partial inputs correctly", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "./test/lcov.info";
      if (name === "coverage-threshold") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "./test/lcov.info",
      coverageThreshold: "No threshold specified",
    });
  });

  it("should handle empty string inputs by using defaults", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "lcov-file") return "";
      if (name === "coverage-threshold") return "";
      return "";
    });

    const result = getInputs();

    expect(result).toEqual({
      lcovFile: "No LCOV file specified",
      coverageThreshold: "No threshold specified",
    });
  });
});
