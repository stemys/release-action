import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals';

interface CreateReleaseParams {
  owner: string;
  repo: string;
  tag_name: string;
  name: string;
  body: string;
}

interface GetRefParams {
  owner: string;
  repo: string;
  ref: string;
}

interface CreateRefParams {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
}

interface CreatePRParams {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
}

interface CompareParams {
  owner: string;
  repo: string;
  basehead: string;
}

const mockCreateRelease =
  jest.fn<
    (params: CreateReleaseParams) => Promise<{ data: { html_url: string } }>
  >();
const mockGetRef =
  jest.fn<
    (
      params: GetRefParams
    ) => Promise<{ data: { object: { sha: string; type: string } } }>
  >();
const mockCreateRef =
  jest.fn<(params: CreateRefParams) => Promise<{ data: object }>>();
const mockCreatePR =
  jest.fn<
    (
      params: CreatePRParams
    ) => Promise<{ data: { html_url: string; node_id: string } }>
  >();
const mockCompareCommits =
  jest.fn<(params: CompareParams) => Promise<{ data: { ahead_by: number } }>>();
const mockGetOctokit = jest.fn((_token: string) => ({
  rest: {
    repos: {
      createRelease: mockCreateRelease,
      compareCommitsWithBasehead: mockCompareCommits
    },
    git: { getRef: mockGetRef, createRef: mockCreateRef },
    pulls: { create: mockCreatePR }
  }
}));

jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit,
  context: { repo: { owner: 'test-owner', repo: 'test-repo' } }
}));

const { createRelease, createMergeBackPR } =
  await import('../src/github-release.js');

describe('createRelease', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('calls the GitHub Releases API with the correct parameters', async () => {
    mockCreateRelease.mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
      }
    });

    const url = await createRelease('gh-token', 'v1.0.0', '## changes');

    expect(mockGetOctokit).toHaveBeenCalledWith('gh-token');
    expect(mockCreateRelease).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      body: '## changes'
    });
    expect(url).toBe(
      'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
    );
  });
});

describe('createMergeBackPR', () => {
  beforeEach(() => {
    mockGetOctokit.mockImplementation((_token: string) => ({
      rest: {
        repos: {
          createRelease: mockCreateRelease,
          compareCommitsWithBasehead: mockCompareCommits
        },
        git: { getRef: mockGetRef, createRef: mockCreateRef },
        pulls: { create: mockCreatePR }
      }
    }));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('resolves the tag SHA, creates the branch, then opens the PR', async () => {
    mockCompareCommits.mockResolvedValue({ data: { ahead_by: 3 } });
    mockGetRef.mockResolvedValue({
      data: { object: { sha: 'abc1234', type: 'commit' } }
    });
    mockCreateRef.mockResolvedValue({ data: {} });
    mockCreatePR.mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/pull/1',
        node_id: 'PR_node_abc'
      }
    });

    const url = await createMergeBackPR(
      'gh-token',
      'v1.0.1',
      'main',
      '## changes'
    );

    expect(mockCompareCommits).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      basehead: 'main...v1.0.1'
    });
    expect(mockGetRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1.0.1'
    });
    expect(mockCreateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/heads/release/v1.0.1',
      sha: 'abc1234'
    });
    expect(mockCreatePR).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      title: 'chore: merge release v1.0.1 into main',
      head: 'release/v1.0.1',
      base: 'main',
      body: expect.stringMatching(/Rebase and merge[\s\S]*## changes/)
    });
    expect(url).toBe('https://github.com/test-owner/test-repo/pull/1');
  });

  it('returns null and skips branch/PR creation when tag is not ahead of target', async () => {
    mockCompareCommits.mockResolvedValue({ data: { ahead_by: 0 } });

    const url = await createMergeBackPR(
      'gh-token',
      'v1.0.1',
      'main',
      '## changes'
    );

    expect(url).toBeNull();
    expect(mockGetRef).not.toHaveBeenCalled();
    expect(mockCreateRef).not.toHaveBeenCalled();
    expect(mockCreatePR).not.toHaveBeenCalled();
  });

  it('uses the token passed as the first argument', async () => {
    mockCompareCommits.mockResolvedValue({ data: { ahead_by: 1 } });
    mockGetRef.mockResolvedValue({
      data: { object: { sha: 'def5678', type: 'commit' } }
    });
    mockCreateRef.mockResolvedValue({ data: {} });
    mockCreatePR.mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/pull/2',
        node_id: 'PR_node_def'
      }
    });

    await createMergeBackPR('my-token', '1.2.3', 'develop', '## body');

    expect(mockGetOctokit).toHaveBeenCalledWith('my-token');
  });
});
