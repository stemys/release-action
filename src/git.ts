import { exec, getExecOutput } from '@actions/exec';
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

export async function pushChanges(tagName: string): Promise<void> {
  await exec('git', ['push']);
  await exec('git', ['push', 'origin', tagName]);
}

export async function tryRebaseBranch(
  targetBranch: string,
  onto: string
): Promise<boolean> {
  const tempBranch = '__release-sync__';
  await exec('git', ['fetch', 'origin', targetBranch]);
  await exec('git', ['checkout', '-b', tempBranch, `origin/${targetBranch}`]);

  let success = false;
  try {
    const { exitCode } = await getExecOutput('git', ['rebase', onto], {
      ignoreReturnCode: true
    });
    if (exitCode === 0) {
      try {
        await exec('git', [
          'push',
          'origin',
          `HEAD:refs/heads/${targetBranch}`,
          '--force-with-lease'
        ]);
        success = true;
      } catch {
        // Push rejected (e.g. concurrent update on remote); caller falls back to PR.
      }
    } else {
      await exec('git', ['rebase', '--abort']);
    }
  } finally {
    await exec('git', ['checkout', '-']);
    await exec('git', ['branch', '-D', tempBranch]);
  }

  return success;
}
