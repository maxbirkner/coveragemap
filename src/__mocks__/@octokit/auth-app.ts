// Mock for @octokit/auth-app package
import { jest } from "@jest/globals";

export const createAppAuth = jest.fn(() =>
  jest.fn(async () => ({
    type: "app",
    token: "mock-app-token",
  })),
);
