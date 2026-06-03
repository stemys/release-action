# Release Action

[![CI](https://github.com/stemys/release-action/actions/workflows/ci.yml/badge.svg)](https://github.com/stemys/release-action/actions/workflows/ci.yml)
[![GitHub Super-Linter](https://github.com/stemys/release-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)

A GitHub Action that automates versioning, CHANGELOG generation, and GitHub
Releases — all in one step.

## What it does

1. Resolves the latest SemVer tag in your repository
2. Calculates the next version based on `release_scope` and `release_stage`
3. Generates a CHANGELOG diff from commits since the last tag (Conventional
   Commits aware)
4. Prepends the diff to your `CHANGELOG.md`
5. Commits the updated `CHANGELOG.md` to the current branch
6. Creates a lightweight git tag on that commit
7. Creates a GitHub Release with the new tag as title and the diff as body

Set `dry-run: true` to preview all outputs without touching git or GitHub.

## Usage

```yaml
- name: Release
  id: release
  uses: stemys/release-action@main
  with:
    release_scope: patch # major | minor | patch
    release_stage: stable # stable | rc | beta | alpha
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

> **Note:** The workflow must check out the repository with `fetch-depth: 0` so
> that all tags are available.

## Inputs

| Input            | Required | Default        | Description                                         |
| ---------------- | -------- | -------------- | --------------------------------------------------- |
| `release_scope`  | Yes      | —              | SemVer component to bump: `major`, `minor`, `patch` |
| `release_stage`  | Yes      | `stable`       | Pre-release stage: `stable`, `rc`, `beta`, `alpha`  |
| `tag-prefix`     | No       | _(empty)_      | Prefix prepended to the version number (e.g. `v`)   |
| `changelog-file` | No       | `CHANGELOG.md` | Path to the changelog file                          |
| `github-token`   | Yes      | —              | Token used to create the GitHub Release             |
| `dry-run`        | No       | `false`        | Preview outputs without any git or GitHub writes    |

## Outputs

| Output             | Description                                      |
| ------------------ | ------------------------------------------------ |
| `previous-version` | The latest tag found before this run             |
| `new-version`      | The new tag created by this run                  |
| `changelog-diff`   | The markdown changelog fragment for this release |

## Versioning behaviour

The version base is always the latest **stable** tag (no pre-release suffix).
Pre-release series are tracked separately:

| Latest stable | Scope   | Stage    | Result       |
| ------------- | ------- | -------- | ------------ |
| `1.2.3`       | `patch` | `stable` | `1.2.4`      |
| `1.2.3`       | `minor` | `stable` | `1.3.0`      |
| `1.2.3`       | `major` | `stable` | `2.0.0`      |
| `1.2.3`       | `patch` | `rc`     | `1.2.4-rc.0` |
| `1.2.4-rc.0`  | `patch` | `rc`     | `1.2.4-rc.1` |
| `1.2.4-rc.1`  | `patch` | `stable` | `1.2.4`      |

Add `tag-prefix: v` to produce `v1.2.4` style tags.

## Conventional Commits

The following commit types appear in the changelog:

| Type       | Section                  | Hidden |
| ---------- | ------------------------ | ------ |
| `feat`     | Features                 | no     |
| `fix`      | Bug Fixes                | no     |
| `perf`     | Performance Improvements | no     |
| `revert`   | Reverts                  | no     |
| `docs`     | Documentation            | no     |
| `refactor` | Code Refactoring         | yes    |
| `style`    | Styles                   | yes    |
| `test`     | Tests                    | yes    |
| `build`    | Build System             | yes    |
| `ci`       | CI/CD                    | yes    |
| `chore`    | Chores                   | yes    |

Commits with a `BREAKING CHANGE` footer always produce a **BREAKING CHANGES**
section regardless of type.

To change which types appear, flip `hidden` in the `COMMIT_TYPES` array in
[`src/changelog.js`](./src/changelog.js).

## Dependency License Management

This repository includes a [`licensed.yml`](./.github/workflows/licensed.yml)
workflow that uses [Licensed](https://github.com/licensee/licensed) to check for
dependencies with missing or non-compliant licenses. To enable it, uncomment the
trigger lines in that file.
