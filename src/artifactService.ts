import * as core from "@actions/core";
import * as github from "@actions/github";
import artifact from "@actions/artifact";
import * as fs from "fs";
import * as path from "path";

export interface ArtifactInfo {
  name: string;
  path: string;
  size: number;
  downloadUrl?: string;
}

export class ArtifactService {
  private artifactClient = artifact;

  /**
   * Upload a file as a GitHub Actions artifact
   */
  async uploadArtifact(
    artifactName: string,
    filePath: string,
    retentionDays = 30,
  ): Promise<ArtifactInfo> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const uploadOptions = {
        continueOnError: false,
        retentionDays,
      };

      core.info(`📤 Uploading artifact: ${artifactName}`);
      core.info(`📁 File path: ${filePath}`);
      core.info(`📊 File size: ${this.formatFileSize(stats.size)}`);

      const uploadResponse = await this.artifactClient.uploadArtifact(
        artifactName,
        [filePath],
        path.dirname(filePath),
        uploadOptions,
      );

      core.info(`✅ Artifact uploaded successfully!`);
      core.info(`🔗 Artifact ID: ${uploadResponse.id}`);

      const serverUrl = this.getGitHubServerUrl();
      const repository = process.env.GITHUB_REPOSITORY || "unknown/unknown";
      const runId = process.env.GITHUB_RUN_ID || "unknown";
      const downloadUrl = `${serverUrl}/${repository}/actions/runs/${runId}/artifacts/${uploadResponse.id}`;

      return {
        name: artifactName,
        path: filePath,
        size: stats.size,
        downloadUrl,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      core.error(`Failed to upload artifact: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate a unique artifact name for the coverage treemap
   */
  generateTreemapArtifactName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runId = process.env.GITHUB_RUN_ID || "local";
    return `coverage-treemap-${runId}-${timestamp}`;
  }

  /**
   * Get the download URL for an artifact (approximated for GitHub Actions)
   */
  getArtifactDownloadUrl(artifactInfo: ArtifactInfo): string {
    const serverUrl = this.getGitHubServerUrl();
    const runId = process.env.GITHUB_RUN_ID || "unknown";
    const repository = process.env.GITHUB_REPOSITORY || "unknown/unknown";

    return `${serverUrl}/${repository}/actions/runs/${runId}/artifacts`;
  }

  /**
   * Get the GitHub server URL from environment or context
   */
  private getGitHubServerUrl(): string {
    return (
      process.env.GITHUB_SERVER_URL ||
      github.context.serverUrl ||
      "https://github.com"
    );
  }

  /**
   * Format file size in human readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          core.debug(`🗑️ Cleaned up temp file: ${filePath}`);
        }
      } catch (error) {
        core.warning(`Failed to cleanup temp file ${filePath}: ${error}`);
      }
    }
  }
}
