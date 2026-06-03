import * as core from '@actions/core';
import { readFile } from 'node:fs/promises';
import { generateDiff } from './changelog.js';
import {
  commitChangelog,
  configureGit,
  createTag,
  prependChangelog
} from './git.js';
import { createRelease } from './github-release.js';
import { resolveVersions } from './version.js';

const VALID_SCOPES = ['major', 'minor', 'patch'];
const VALID_STAGES = ['alpha', 'beta', 'rc', 'stable'];

export async function run(): Promise<void> {
  try {
    const scope = core.getInput('release_scope', { required: true });
    const stage = core.getInput('release_stage', { required: true });
    const tagPrefix = core.getInput('tag-prefix');
    const changelogFile = core.getInput('changelog-file') || 'CHANGELOG.md';
    const token = core.getInput('github-token', { required: true });
    const trackerUrl = core.getInput('tracker-url');
    const headerMarkdownFile = core.getInput('header-markdown-file');
    const dryRun = core.getBooleanInput('dry-run');

    if (!VALID_SCOPES.includes(scope)) {
      throw new Error(
        `Invalid release_scope "${scope}". Must be one of: ${VALID_SCOPES.join(', ')}`
      );
    }
    if (!VALID_STAGES.includes(stage)) {
      throw new Error(
        `Invalid release_stage "${stage}". Must be one of: ${VALID_STAGES.join(', ')}`
      );
    }

    const serverUrl = process.env.GITHUB_SERVER_URL;
    const repo = process.env.GITHUB_REPOSITORY;

    const today = new Date().toISOString().slice(0, 10);

    const { previousTag, newTag } = await resolveVersions(
      tagPrefix,
      scope,
      stage
    );

    core.info(`Previous tag: ${previousTag ?? '(none)'}`);
    core.info(`New tag: ${newTag}`);

    const bareVersion = newTag.startsWith(tagPrefix)
      ? newTag.slice(tagPrefix.length)
      : newTag;
    const commitUrl = repo ? `${serverUrl}/${repo}/commit` : '';
    const changelogReleaseUrl = repo
      ? `${serverUrl}/${repo}/releases/tag/${newTag}`
      : '';
    const headerContent = headerMarkdownFile
      ? await readFile(headerMarkdownFile, 'utf-8')
      : '';
    const diff = await generateDiff(
      bareVersion,
      today,
      previousTag,
      trackerUrl,
      changelogReleaseUrl,
      commitUrl,
      headerContent
    );

    core.info(`\nChangelog diff:\n${diff}`);

    core.setOutput('previous-version', previousTag ?? '');
    core.setOutput('new-version', newTag);
    core.setOutput('changelog-diff', diff);

    if (dryRun) {
      core.info('Dry-run mode: skipping git and GitHub operations.');
      return;
    }

    await configureGit();
    await prependChangelog(changelogFile, diff);
    await commitChangelog(changelogFile, newTag);
    await createTag(newTag);

    const releaseUrl = await createRelease(token, newTag, diff);
    core.info(`GitHub Release created: ${releaseUrl}`);
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}
