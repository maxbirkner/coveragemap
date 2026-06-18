import * as core from "@actions/core";
import { getInputs, printInputs } from "./inputs";

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
      gateMode: "threshold",
      targetBranch: "baz",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
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
      gateMode: "threshold",
      targetBranch: "main",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
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
      gateMode: "threshold",
      targetBranch: "develop",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
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
      gateMode: "threshold",
      targetBranch: "main",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
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
      gateMode: "threshold",
      targetBranch: "develop",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
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
      gateMode: "threshold",
      targetBranch: "main",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
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
      gateMode: "threshold",
      targetBranch: "main",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
      label: undefined,
      sourceCodePattern: "app/**/*.py",
      testCodePattern: undefined,
    });
  });

  it("should parse an explicit gate-mode", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "gate-mode") return "baseline";
      return "";
    });

    expect(getInputs().gateMode).toBe("baseline");
  });

  it("should normalize gate-mode casing and surrounding whitespace", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "gate-mode") return "  NONE  ";
      return "";
    });

    expect(getInputs().gateMode).toBe("none");
  });

  it("should default pr-comment on and job-summary off", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      return "";
    });

    const result = getInputs();

    expect(result.prComment).toBe(true);
    expect(result.jobSummary).toBe(false);
  });

  it("should disable the pr-comment and enable the job-summary", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "pr-comment") return "false";
      if (name === "job-summary") return "true";
      return "";
    });

    const result = getInputs();

    expect(result.prComment).toBe(false);
    expect(result.jobSummary).toBe(true);
  });

  it("should throw on a non-boolean pr-comment", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "pr-comment") return "maybe";
      return "";
    });

    expect(() => getInputs()).toThrow(
      /Input does not meet YAML 1.2 "Core Schema" specification: pr-comment/,
    );
  });

  it("should throw on an invalid gate-mode", () => {
    mockedCore.getInput.mockImplementation((name: string) => {
      if (name === "github-token") return "test-token";
      if (name === "gate-mode") return "bogus";
      return "";
    });

    expect(() => getInputs()).toThrow(
      'Invalid gate-mode "bogus". Expected one of: threshold, baseline, none.',
    );
  });
});

describe("printInputs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should print all inputs", () => {
    const inputs = {
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      gateMode: "threshold" as const,
      targetBranch: "main",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
      label: "coverage",
      sourceCodePattern: "src/**/*.ts",
      testCodePattern: "**/*.test.ts",
    };

    printInputs(inputs);

    expect(mockedCore.info).toHaveBeenCalledWith(
      "📁 LCOV file: coverage/lcov.info",
    );
    expect(mockedCore.info).toHaveBeenCalledWith("📊 Coverage threshold: 80%");
    expect(mockedCore.info).toHaveBeenCalledWith("🚦 Gate mode: threshold");
    expect(mockedCore.info).toHaveBeenCalledWith("🌿 Target branch: main");
    expect(mockedCore.info).toHaveBeenCalledWith("🔑 GitHub token: [PROVIDED]");
    expect(mockedCore.info).toHaveBeenCalledWith("💬 PR comment: enabled");
    expect(mockedCore.info).toHaveBeenCalledWith("📝 Job summary: disabled");
    expect(mockedCore.info).toHaveBeenCalledWith("🏷️ Label: coverage");
    expect(mockedCore.info).toHaveBeenCalledWith(
      "📂 Source code pattern: src/**/*.ts",
    );
    expect(mockedCore.info).toHaveBeenCalledWith(
      "🧪 Test code pattern: **/*.test.ts",
    );
  });

  it("should print minimal inputs without optional fields", () => {
    const inputs = {
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      gateMode: "threshold" as const,
      targetBranch: "main",
      githubToken: "test-token",
      prComment: true,
      jobSummary: false,
    };

    printInputs(inputs);

    expect(mockedCore.info).toHaveBeenCalledWith(
      "📁 LCOV file: coverage/lcov.info",
    );
    expect(mockedCore.info).toHaveBeenCalledWith("📊 Coverage threshold: 80%");
    expect(mockedCore.info).toHaveBeenCalledWith("🌿 Target branch: main");
    expect(mockedCore.info).toHaveBeenCalledWith("🔑 GitHub token: [PROVIDED]");
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      expect.stringContaining("🏷️ Label:"),
    );
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      expect.stringContaining("📂 Source code pattern:"),
    );
    expect(mockedCore.info).not.toHaveBeenCalledWith(
      expect.stringContaining("🧪 Test code pattern:"),
    );
  });

  it("should handle missing github token", () => {
    const inputs = {
      lcovFile: "coverage/lcov.info",
      coverageThreshold: "80",
      gateMode: "threshold" as const,
      targetBranch: "main",
      githubToken: "",
      prComment: true,
      jobSummary: false,
    };

    printInputs(inputs);

    expect(mockedCore.info).toHaveBeenCalledWith("🔑 GitHub token: [MISSING]");
  });
});
