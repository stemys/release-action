import { exec } from '@actions/exec';
import { readFile, writeFile } from 'node:fs/promises';

export async function configureGit(): Promise<void> {
  await exec('git', [
    'config',
    'user.email',
    'github-actions[bot]@users.noreply.github.com'
  ]);
  await exec('git', ['config', 'user.name', 'github-actions[bot]']);
}

export async function prependChangelog(
  filePath: string,
  diff: string
): Promise<void> {
  let existing = '';
  try {
    existing = await readFile(filePath, 'utf8');
  } catch {
    // file does not exist yet
  }
  await writeFile(filePath, `${diff}\n${existing}`, 'utf8');
}

export async function commitChangelog(
  filePath: string,
  tagName: string
): Promise<void> {
  await exec('git', ['add', filePath]);
  await exec('git', [
    'commit',
    '-m',
    `chore(release): update changelog and release ${tagName}`
  ]);
}

export async function createTag(tagName: string): Promise<void> {
  await exec('git', ['tag', tagName]);
}
