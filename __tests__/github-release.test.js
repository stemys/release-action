import { afterEach, describe, it, expect, jest } from '@jest/globals'

const mockCreateRelease = jest.fn()
const mockGetOctokit = jest.fn(() => ({
  rest: { repos: { createRelease: mockCreateRelease } }
}))

jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit,
  context: { repo: { owner: 'test-owner', repo: 'test-repo' } }
}))

const { createRelease } = await import('../src/github-release.js')

describe('createRelease', () => {
  afterEach(() => jest.resetAllMocks())

  it('calls the GitHub Releases API with the correct parameters', async () => {
    mockCreateRelease.mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
      }
    })

    const url = await createRelease('gh-token', 'v1.0.0', '## changes')

    expect(mockGetOctokit).toHaveBeenCalledWith('gh-token')
    expect(mockCreateRelease).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      body: '## changes'
    })
    expect(url).toBe(
      'https://github.com/test-owner/test-repo/releases/tag/v1.0.0'
    )
  })
})
