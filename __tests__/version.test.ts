import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockGetExecOutput =
  jest.fn<
    (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string }>
  >();

jest.unstable_mockModule('@actions/exec', () => ({
  getExecOutput: mockGetExecOutput
}));

const { resolveVersions } = await import('../src/version.js');

describe('resolveVersions', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('starts from 0.0.0 when no tags exist', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: '' });
    const result = await resolveVersions('v', 'patch', 'stable');
    expect(result.previousTag).toBeNull();
    expect(result.newTag).toBe('v0.0.1');
  });

  it('increments patch from latest stable tag', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v1.2.3\nv1.2.2\n' });
    const result = await resolveVersions('v', 'patch', 'stable');
    expect(result.previousTag).toBe('v1.2.3');
    expect(result.newTag).toBe('v1.2.4');
  });

  it('increments minor from latest stable tag', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v2.0.0\n' });
    const result = await resolveVersions('v', 'minor', 'stable');
    expect(result.newTag).toBe('v2.1.0');
  });

  it('increments major from latest stable tag', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v2.0.0\n' });
    const result = await resolveVersions('v', 'major', 'stable');
    expect(result.newTag).toBe('v3.0.0');
  });

  it('starts a new pre-release series from stable tag', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v1.2.3\n' });
    const result = await resolveVersions('v', 'patch', 'rc');
    expect(result.previousTag).toBe('v1.2.3');
    expect(result.newTag).toBe('v1.2.4-rc.0');
  });

  it('bumps the pre-release counter when same series exists', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v1.2.4-rc.0\nv1.2.3\n' });
    const result = await resolveVersions('v', 'patch', 'rc');
    expect(result.previousTag).toBe('v1.2.4-rc.0');
    expect(result.newTag).toBe('v1.2.4-rc.1');
  });

  it('starts a new stage series when a different stage exists', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v1.2.4-beta.0\nv1.2.3\n' });
    const result = await resolveVersions('v', 'patch', 'rc');
    expect(result.newTag).toBe('v1.2.4-rc.0');
  });

  it('uses stable tag as version base even when pre-release tags exist', async () => {
    mockGetExecOutput.mockResolvedValue({
      stdout: 'v1.2.4-rc.1\nv1.2.4-rc.0\nv1.2.3\n'
    });
    const result = await resolveVersions('v', 'patch', 'stable');
    expect(result.previousTag).toBe('v1.2.4-rc.1');
    expect(result.newTag).toBe('v1.2.4');
  });

  it('ignores tags that are not valid semver', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'v-canary\nv1.0.0\n' });
    const result = await resolveVersions('v', 'patch', 'stable');
    expect(result.previousTag).toBe('v1.0.0');
    expect(result.newTag).toBe('v1.0.1');
  });

  it('passes --merged HEAD to git so only ancestor tags are considered', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: '' });
    await resolveVersions('v', 'patch', 'stable');
    expect(mockGetExecOutput).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['--merged', 'HEAD']),
      expect.any(Object)
    );
  });

  it('ignores tags from other products when a product prefix is set', async () => {
    mockGetExecOutput.mockResolvedValue({
      stdout:
        'report-generator-2.0.0\nhive-suite-1.0.0\nreport-generator-1.5.0\n'
    });
    const result = await resolveVersions('hive-suite-', 'patch', 'stable');
    expect(result.previousTag).toBe('hive-suite-1.0.0');
    expect(result.newTag).toBe('hive-suite-1.0.1');
  });

  it('respects a custom tag prefix', async () => {
    mockGetExecOutput.mockResolvedValue({ stdout: 'release-1.0.0\n' });
    const result = await resolveVersions('release-', 'minor', 'stable');
    expect(result.newTag).toBe('release-1.1.0');
  });
});
