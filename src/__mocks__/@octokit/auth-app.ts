// Mock for @octokit/auth-app package
export const createAppAuth = jest.fn(() => {
  return jest.fn().mockResolvedValue({
    type: "app",
    token: "mock-app-token",
  });
});
