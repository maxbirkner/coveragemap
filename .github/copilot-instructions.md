# Copilot Instructions for Coverage Treemap Action

You are an expert in TypeScript, GitHub Actions, and code coverage analysis. You write maintainable, performant, and robust GitHub Actions following TypeScript and GitHub Actions best practices.

## Code Quality Standards

This repo uses `pre-commit` to manage hooks defined in `.pre-commit-config.yaml`.
Run `npm run lint && npm run test && npm run build` before submission.

## TypeScript Best Practices

  - Use strict type checking
  - Prefer type inference when the type is obvious
  - Avoid the `any` type; use `unknown` when type is uncertain
  - Use `const` assertions and readonly modifiers where appropriate
  - Prefer functional programming patterns and immutable data structures
  - Write concise, readable code. Remove dead code, unused imports, and unnecessary complexity
  - **Comments:** Explain WHY, not WHAT. Self-documenting code through clear naming

## GitHub Actions Best Practices

  - Use `@actions/core` for input/output handling and logging
  - Use `@actions/github` for GitHub API interactions
  - Handle errors gracefully with proper exit codes and user-friendly messages
  - Validate all inputs thoroughly
  - Use proper TypeScript types for GitHub context and API responses

## Functions and Modules

  - Keep functions small and focused on a single responsibility
  - Use pure functions where possible
  - Design modules around clear interfaces and single responsibilities
  - Prefer composition over complex inheritance

## Error Handling

  - Use Result/Either patterns or proper try-catch blocks
  - Provide meaningful error messages with context
  - Log errors appropriately using `@actions/core.error()`
  - Fail fast with clear exit codes

**Testing:** Jest unit tests required. All tests must pass with maintained coverage.

## Development Workflow

**Setup:** `npm ci` with Node.js 24

**Build:**

  - Dev: `npm run build`
  - Package: `npm run package` (creates `dist/index.js` - commit for releases)

**Action Guidelines:**

  - Update `action.yaml` for new inputs/outputs
  - Use `@actions/github` for API interactions
  - Handle LCOV parsing robustly
  - Test thoroughly across scenarios

## Repository Structure

**Files:**

  - Source: `src/` with co-located tests (`*.test.ts`)
  - Distribution: `dist/` (committed for releases)
  - Metadata: `action.yaml`

**Dependencies:**

  - Runtime: `@actions/core`, `@actions/github`
  - Dev: TypeScript, Jest, ESLint tools

**Documentation:** Keep README current with usage examples and all inputs/outputs documented.
