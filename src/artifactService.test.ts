import { ArtifactService } from "./artifactService";

// Mock @actions/core
jest.mock("@actions/core", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn(),
  warning: jest.fn(),
}));

// Mock @actions/github
jest.mock("@actions/github", () => ({
  context: {
    serverUrl: "https://github.com",
  },
}));

// Mock @actions/artifact
jest.mock("@actions/artifact", () => ({
  __esModule: true,
  default: {
    uploadArtifact: jest.fn(),
  },
}));

const mockUploadArtifact = jest.fn();

// Mock fs
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  statSync: jest.fn(),
}));

// Mock path
jest.mock("path", () => ({
  dirname: jest.fn().mockReturnValue("/path/to"),
}));

describe("ArtifactService", () => {
  let artifactService: ArtifactService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fs methods
    require("fs").existsSync = jest.fn().mockReturnValue(true);
    require("fs").unlinkSync = jest.fn();
    require("fs").statSync = jest.fn().mockReturnValue({ size: 1024 });

    artifactService = new ArtifactService();
  });
  describe("uploadArtifact", () => {
    it("uploads artifact successfully", async () => {
      const filePath = "/path/to/file.png";
      const artifactName = "test-artifact";

      const artifact = require("@actions/artifact").default;
      artifact.uploadArtifact.mockResolvedValue({
        id: 123,
        size: 1024,
      } as any);

      const result = await artifactService.uploadArtifact(
        artifactName,
        filePath,
      );

      expect(artifact.uploadArtifact).toHaveBeenCalledWith(
        artifactName,
        [filePath],
        "/path/to",
        { continueOnError: false, retentionDays: 30 },
      );
      expect(result).toEqual({
        name: artifactName,
        path: filePath,
        size: 1024,
        downloadUrl:
          "https://github.com/unknown/unknown/actions/runs/unknown/artifacts/123",
      });
    });

    it("should use custom GitHub server URL for download URL", async () => {
      process.env.GITHUB_SERVER_URL = "https://github.enterprise.com";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_RUN_ID = "123456";

      const filePath = "/path/to/file.png";
      const artifactName = "test-artifact";

      const artifact = require("@actions/artifact").default;
      artifact.uploadArtifact.mockResolvedValue({
        id: 789,
        size: 2048,
      } as any);

      const result = await artifactService.uploadArtifact(
        artifactName,
        filePath,
      );

      expect(result).toEqual({
        name: artifactName,
        path: filePath,
        size: 1024, // Size comes from fs.statSync mock, not uploadResponse
        downloadUrl:
          "https://github.enterprise.com/owner/repo/actions/runs/123456/artifacts/789",
      });

      // Clean up
      delete process.env.GITHUB_SERVER_URL;
    });

    it("handles upload failures", async () => {
      const filePath = "/path/to/file.png";
      const artifactName = "test-artifact";
      const error = new Error("Upload failed");

      const artifact = require("@actions/artifact").default;
      artifact.uploadArtifact.mockRejectedValue(error);

      await expect(
        artifactService.uploadArtifact(artifactName, filePath),
      ).rejects.toThrow("Upload failed");

      expect(artifact.uploadArtifact).toHaveBeenCalledWith(
        artifactName,
        [filePath],
        "/path/to",
        { continueOnError: false, retentionDays: 30 },
      );
    });

    it("should handle missing file", async () => {
      const artifactName = "coverage-treemap-pr-123";
      const filePath = "/path/to/missing.png";

      require("fs").existsSync = jest.fn().mockReturnValue(false);

      await expect(
        artifactService.uploadArtifact(artifactName, filePath),
      ).rejects.toThrow("File not found: /path/to/missing.png");
    });
  });

  describe("generateTreemapArtifactName", () => {
    it("should generate artifact name with PR number", () => {
      process.env.GITHUB_RUN_ID = "123";
      const result = artifactService.generateTreemapArtifactName();
      expect(result).toMatch(
        /^coverage-treemap-123-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/,
      );
    });

    it("should generate artifact name without PR number", () => {
      delete process.env.GITHUB_RUN_ID;
      const result = artifactService.generateTreemapArtifactName();
      expect(result).toMatch(
        /^coverage-treemap-local-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/,
      );
    });
  });

  describe("getArtifactDownloadUrl", () => {
    it("should generate download URL with repository info", () => {
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_RUN_ID = "987654321";

      const artifactInfo = {
        name: "test-artifact",
        path: "/path/to/artifact.png",
        size: 1024,
      };

      const result = artifactService.getArtifactDownloadUrl(artifactInfo);

      expect(result).toBe(
        "https://github.com/owner/repo/actions/runs/987654321/artifacts",
      );
    });

    it("should return base URL when environment variables are missing", () => {
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_RUN_ID;

      const artifactInfo = {
        name: "test-artifact",
        path: "/path/to/artifact.png",
        size: 1024,
      };

      const result = artifactService.getArtifactDownloadUrl(artifactInfo);

      expect(result).toBe(
        "https://github.com/unknown/unknown/actions/runs/unknown/artifacts",
      );
    });

    it("should use custom GitHub server URL from environment", () => {
      process.env.GITHUB_SERVER_URL = "https://github.enterprise.com";
      process.env.GITHUB_REPOSITORY = "owner/repo";
      process.env.GITHUB_RUN_ID = "987654321";

      const artifactInfo = {
        name: "test-artifact",
        path: "/path/to/artifact.png",
        size: 1024,
      };

      const result = artifactService.getArtifactDownloadUrl(artifactInfo);

      expect(result).toBe(
        "https://github.enterprise.com/owner/repo/actions/runs/987654321/artifacts",
      );

      // Clean up
      delete process.env.GITHUB_SERVER_URL;
    });
  });

  describe("cleanupTempFiles", () => {
    it("should handle file not found error gracefully", async () => {
      require("fs").existsSync = jest.fn().mockReturnValue(false);

      await expect(
        artifactService.cleanupTempFiles(["/nonexistent/file.png"]),
      ).resolves.not.toThrow();
    });

    it("should delete existing files", async () => {
      const filePath = "/path/to/file.png";
      require("fs").existsSync = jest.fn().mockReturnValue(true);
      const unlinkSyncMock = jest.fn();
      require("fs").unlinkSync = unlinkSyncMock;

      await artifactService.cleanupTempFiles([filePath]);

      expect(unlinkSyncMock).toHaveBeenCalledWith("/path/to/file.png");
    });

    it("should not delete non-existent files", async () => {
      const filePath = "/path/to/nonexistent.png";
      require("fs").existsSync = jest.fn().mockReturnValue(false);
      const unlinkSyncMock = jest.fn();
      require("fs").unlinkSync = unlinkSyncMock;

      await artifactService.cleanupTempFiles([filePath]);

      expect(unlinkSyncMock).not.toHaveBeenCalled();
    });

    it("should handle deletion errors gracefully", async () => {
      const filePath = "/path/to/file.png";
      require("fs").existsSync = jest.fn().mockReturnValue(true);
      require("fs").unlinkSync = jest.fn().mockImplementation(() => {
        throw new Error("Permission denied");
      });

      await expect(
        artifactService.cleanupTempFiles([filePath]),
      ).resolves.not.toThrow();
    });
  });
});
