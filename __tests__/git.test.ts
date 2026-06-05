import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockExec = jest
  .fn<(cmd: string, args?: string[]) => Promise<number>>()
  .mockResolvedValue(0);
const mockReadFile =
  jest.fn<(path: string, encoding: string) => Promise<string>>();
const mockWriteFile =
  jest.fn<(path: string, data: string, encoding: string) => Promise<void>>();

jest.unstable_mockModule('@actions/exec', () => ({ exec: mockExec }));
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile
}));

const {
  configureGit,
  prependChangelog,
  commitChangelog,
  createTag,
  pushChanges
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
