# Privacy Policy

_Last updated: 2026-06-17_

This privacy policy describes how the **Coverage Treemap Action**
(`maxbirkner/coveragemap`, "the Action") handles data. The Action is a free,
open-source hobby project maintained by Maximilian Birkner ("the Maintainer").

## Summary

**The Action does not collect, transmit, sell, or share your data with the
Maintainer or any third party.** There is no telemetry, no analytics, and no
external backend service. All processing happens inside your own GitHub Actions
runner.

## What the Action does with data

When you run the Action in a workflow, it:

1. Reads the LCOV coverage report you point it at (`lcov-file`) from the runner's
   file system.
2. Determines the files changed in the pull request using the local git
   checkout.
3. Generates a treemap image in memory on the runner.
4. Uses the GitHub token / GitHub App credentials **that you supply** to:
   - post or update a pull request comment,
   - optionally upload an `annotations.json` workflow artifact, and
   - optionally post check-run annotations via the GitHub Checks API.

All of these interactions are made directly between **your** workflow runner and
**your** GitHub repository, using **your** credentials. The Maintainer never
receives any of this data.

## Data the Maintainer collects

**None.** The Action sends no data to the Maintainer or to any service operated
by the Maintainer. It contains no analytics, tracking, or "phone-home"
behaviour.

## Controller and purpose limitation

You (the user running the Action) remain the sole controller of any data the
Action processes. The Maintainer does not act as a data processor or controller
on your behalf and does not act on GitHub's behalf in collecting data. Any data
processed by the Action is used solely to provide the Action's functionality and
for no other purpose (it is never used for marketing or resold).

## Credentials and secrets

The Action consumes the `github-token` and optional GitHub App credentials you
provide via workflow secrets. These are used only at runtime to authenticate
calls to the GitHub API and are never logged or transmitted anywhere other than
GitHub's own API endpoints.

## Third-party services

The Action calls only the GitHub API (`api.github.com` / your GitHub Enterprise
host) using your credentials. It does not contact any other third-party service.

## Changes to this policy

This policy may be updated over time. Material changes will be reflected in this
file and in the repository's release notes.

## Contact

Questions about privacy can be raised via
[GitHub Issues](https://github.com/maxbirkner/coveragemap/issues).
