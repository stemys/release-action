import {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  jest
} from '@jest/globals'

const core = await import('../__fixtures__/core.js')

const mockResolveVersions = jest.fn()
const mockGenerateDiff = jest.fn()
const mockConfigureGit = jest.fn()
const mockPrependChangelog = jest.fn()
const mockCommitChangelog = jest.fn()
const mockCreateTag = jest.fn()
const mockCreateRelease = jest.fn()

jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/version.js', () => ({
  resolveVersions: mockResolveVersions
}))
jest.unstable_mockModule('../src/changelog.js', () => ({
  generateDiff: mockGenerateDiff
}))
jest.unstable_mockModule('../src/git.js', () => ({
  configureGit: mockConfigureGit,
  prependChangelog: mockPrependChangelog,
  commitChangelog: mockCommitChangelog,
  createTag: mockCreateTag
}))
jest.unstable_mockModule('../src/github-release.js', () => ({
  createRelease: mockCreateRelease
}))

const { run } = await import('../src/main.js')

const DIFF = '## [v1.0.1] (2026-06-03)\n\n### Features\n\n- something new\n'

function setupInputs({
  scope = 'patch',
  stage = 'stable',
  dryRun = false
} = {}) {
  core.getInput.mockImplementation((name) => {
    return (
      {
        release_scope: scope,
        release_stage: stage,
        'tag-prefix': '',
        'changelog-file': 'CHANGELOG.md',
        'github-token': 'gh-token'
      }[name] ?? ''
    )
  })
  core.getBooleanInput.mockReturnValue(dryRun)
}

describe('run', () => {
  beforeEach(() => {
    mockResolveVersions.mockResolvedValue({
      previousTag: '1.0.0',
      newTag: '1.0.1'
    })
    mockGenerateDiff.mockResolvedValue(DIFF)
    mockCreateRelease.mockResolvedValue(
      'https://github.com/owner/repo/releases/tag/1.0.1'
    )
  })

  afterEach(() => jest.resetAllMocks())

  it('sets previous-version, new-version, and changelog-diff outputs', async () => {
    setupInputs()
    await run()
    expect(core.setOutput).toHaveBeenCalledWith('previous-version', '1.0.0')
    expect(core.setOutput).toHaveBeenCalledWith('new-version', '1.0.1')
    expect(core.setOutput).toHaveBeenCalledWith('changelog-diff', DIFF)
  })

  it('runs git and release steps when not in dry-run mode', async () => {
    setupInputs({ dryRun: false })
    await run()
    expect(mockConfigureGit).toHaveBeenCalled()
    expect(mockPrependChangelog).toHaveBeenCalledWith('CHANGELOG.md', DIFF)
    expect(mockCommitChangelog).toHaveBeenCalledWith('CHANGELOG.md', '1.0.1')
    expect(mockCreateTag).toHaveBeenCalledWith('1.0.1')
    expect(mockCreateRelease).toHaveBeenCalledWith('gh-token', '1.0.1', DIFF)
  })

  it('skips git and release steps in dry-run mode', async () => {
    setupInputs({ dryRun: true })
    await run()
    expect(mockConfigureGit).not.toHaveBeenCalled()
    expect(mockCommitChangelog).not.toHaveBeenCalled()
    expect(mockCreateRelease).not.toHaveBeenCalled()
  })

  it('passes empty string as previous-version when there is no prior tag', async () => {
    setupInputs()
    mockResolveVersions.mockResolvedValue({
      previousTag: null,
      newTag: '0.0.1'
    })
    await run()
    expect(core.setOutput).toHaveBeenCalledWith('previous-version', '')
  })

  it('calls setFailed when an invalid scope is provided', async () => {
    setupInputs({ scope: 'bogus' })
    await run()
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('release_scope')
    )
  })

  it('calls setFailed when an invalid stage is provided', async () => {
    setupInputs({ stage: 'bogus' })
    await run()
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('release_stage')
    )
  })

  it('strips tag-prefix from the version passed to generateDiff', async () => {
    core.getInput.mockImplementation(
      (name) =>
        ({
          release_scope: 'patch',
          release_stage: 'stable',
          'tag-prefix': 'v',
          'changelog-file': 'CHANGELOG.md',
          'github-token': 'gh-token'
        })[name] ?? ''
    )
    mockResolveVersions.mockResolvedValue({
      previousTag: 'v1.0.0',
      newTag: 'v1.0.1'
    })
    await run()
    expect(mockGenerateDiff).toHaveBeenCalledWith(
      '1.0.1',
      expect.any(String),
      'v1.0.0',
      ''
    )
  })

  it('calls setFailed when an unexpected error is thrown', async () => {
    setupInputs()
    mockResolveVersions.mockRejectedValue(new Error('git failure'))
    await run()
    expect(core.setFailed).toHaveBeenCalledWith('git failure')
  })
})
