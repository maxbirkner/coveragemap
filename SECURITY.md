# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in the Coverage Treemap Action, please
report it privately using GitHub's
[private vulnerability reporting](https://github.com/maxbirkner/coveragemap/security/advisories/new)
for this repository. Please do not open a public issue for security problems.

Include enough detail to reproduce the issue. As this is a hobby project
maintained in spare time, please allow a reasonable amount of time for a
response and a fix before any public disclosure.

## Supply-chain and dependency hygiene

To reduce the risk of malicious or "silent" upstream changes:

  - **The published action is a committed, self-contained bundle.** The runtime
  entry point (`dist/index.js`) is built with esbuild and committed to the
  repository, and CI verifies it is in sync with the source. Consumers run
  exactly the reviewed bundle rather than resolving dependencies at runtime.
  - **Workflow actions are pinned to full commit SHAs**, not floating tags, in
  this repository's own workflows.
  - **Runtime dependency versions are locked** via `package-lock.json`, and
  updates are reviewed (Renovate is used to surface them).
  - Consumers are encouraged to pin this action to a full commit SHA in their own
  workflows (see the README usage examples).

## Scope and disclaimer

The action is provided "AS IS", without warranty of any kind. See the
[README](README.md#disclaimer) and [LICENSE](LICENSE) for the full disclaimer.
