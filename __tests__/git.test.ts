import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockExec = jest
  .fn<(cmd: string, args?: string[]) => Promise<number>>()
  .mockResolvedValue(0);
const mockGetExecOutput =
  jest.fn<
    (
      cmd: string,
      args?: string[],
      opts?: object
    ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  >();
const mockReadFile =
  jest.fn<(path: string, encoding: string) => Promise<string>>();
const mockWriteFile =
  jest.fn<(path: string, data: string, encoding: string) => Promise<void>>();

jest.unstable_mockModule('@actions/exec', () => ({
  exec: mockExec,
  getExecOutput: mockGetExecOutput
}));
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile
}));

const {
  configureGit,
  prependChangelog,
  commitChangelog,
  createTag,
  pushChanges,
  tryRebaseBranch
} = await import('../src/git.js');

describe('configureGit', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('sets git user.email to the github-actions bot address', async () => {
    await configureGit();
    expect(mockExec).toHaveBeenCalledWith('git', [
      'config',
      'user.email',
      'github-actions[bot]@users.noreply.github.com'
    ]);
  });

  it('sets git user.name to github-actions[bot]', async () => {
    await configureGit();
    expect(mockExec).toHaveBeenCalledWith('git', [
      'config',
      'user.name',
      'github-actions[bot]'
    ]);
  });
});

describe('prependChangelog', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('prepends the diff to existing file content', async () => {
    mockReadFile.mockResolvedValue('# existing\n');
    await prependChangelog('CHANGELOG.md', '## new entry\n');
    expect(mockWriteFile).toHaveBeenCalledWith(
      'CHANGELOG.md',
      '## new entry\n\n# existing\n',
      'utf8'
    );
  });

  it('writes the diff alone when the file does not exist', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    await prependChangelog('CHANGELOG.md', '## new entry\n');
    expect(mockWriteFile).toHaveBeenCalledWith(
      'CHANGELOG.md',
      '## new entry\n\n',
      'utf8'
    );
  });
});

describe('commitChangelog', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('stages and commits the changelog file', async () => {
    await commitChangelog('CHANGELOG.md', 'v1.0.0');
    expect(mockExec).toHaveBeenCalledWith('git', ['add', 'CHANGELOG.md']);
    expect(mockExec).toHaveBeenCalledWith('git', [
      'commit',
      '-m',
      'chore(release): update changelog and release v1.0.0'
    ]);
  });
});

describe('createTag', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates a lightweight tag', async () => {
    await createTag('v1.0.0');
    expect(mockExec).toHaveBeenCalledWith('git', ['tag', 'v1.0.0']);
  });
});

describe('pushChanges', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('pushes the current branch', async () => {
    await pushChanges('v1.0.0');
    expect(mockExec).toHaveBeenCalledWith('git', ['push']);
  });

  it('pushes the tag to origin', async () => {
    await pushChanges('v1.0.0');
    expect(mockExec).toHaveBeenCalledWith('git', ['push', 'origin', 'v1.0.0']);
  });
});

describe('tryRebaseBranch', () => {
  afterEach(() => {
    jest.resetAllMocks();
    mockExec.mockResolvedValue(0);
  });

  it('returns true and force-pushes when rebase exits cleanly', async () => {
    mockGetExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });

    const result = await tryRebaseBranch('develop', 'v1.0.1');

    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith('git', [
      'push',
      'origin',
      'HEAD:refs/heads/develop',
      '--force-with-lease'
    ]);
  });

  it('returns false and aborts when rebase has conflicts', async () => {
    mockGetExecOutput.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'CONFLICT (content): Merge conflict in src/foo.ts'
    });

    const result = await tryRebaseBranch('develop', 'v1.0.1');

    expect(result).toBe(false);
    expect(mockExec).toHaveBeenCalledWith('git', ['rebase', '--abort']);
    expect(mockExec).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['--force-with-lease'])
    );
  });

  it('returns false when the push is rejected after a clean rebase', async () => {
    mockGetExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });
    mockExec.mockImplementation(async (_cmd: string, args?: string[]) => {
      if (args?.includes('--force-with-lease')) throw new Error('rejected');
      return 0;
    });

    const result = await tryRebaseBranch('develop', 'v1.0.1');

    expect(result).toBe(false);
  });

  it('fetches the target branch and creates a temp branch before rebasing', async () => {
    mockGetExecOutput.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: ''
    });

    await tryRebaseBranch('develop', 'v1.0.1');

    expect(mockExec).toHaveBeenCalledWith('git', [
      'fetch',
      'origin',
      'develop'
    ]);
    expect(mockExec).toHaveBeenCalledWith('git', [
      'checkout',
      '-b',
      '__release-sync__',
      'origin/develop'
    ]);
  });
});
