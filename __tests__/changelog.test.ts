import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockGetExecOutput =
  jest.fn<
    (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string }>
  >();

jest.unstable_mockModule('@actions/exec', () => ({
  getExecOutput: mockGetExecOutput
}));

const { generateDiff } = await import('../src/changelog.js');

const VERSION = '1.0.0';
const DATE = '2026-06-03';
const TRACKER = 'https://stemys.atlassian.net/browse';

function gitLog(...messages: string[]): string {
  return messages
    .map((m, i) => `\x00hash${String(i).padStart(12, '0')}\n${m}`)
    .join('');
}

describe('generateDiff', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('header', () => {
    it('uses an em dash and no tag prefix in the version heading', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain(`## ${VERSION} — ${DATE}`);
    });

    it('returns only the header when there are no visible commits', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).not.toContain('###');
    });

    it('renders the version as a plain string when no release-url is given', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain(`## ${VERSION} — ${DATE}`);
      expect(diff).not.toContain(`[${VERSION}](`);
    });

    it('renders the version as a link when release-url is given', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' });
      const releaseUrl = `https://github.com/stemys/hive-suite-backend/releases/tag/${VERSION}`;
      const diff = await generateDiff(VERSION, DATE, null, '', releaseUrl);
      expect(diff).toContain(`## [${VERSION}](${releaseUrl}) — ${DATE}`);
    });
  });

  describe('scope grouping', () => {
    it('groups commits under their scope section with label', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop): add machine dashboard [#HIVE-063]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('### shop — Shopfloor');
      expect(diff).toContain('#### Features');
      expect(diff).toContain('add machine dashboard');
    });

    it('renders an unknown scope without a label', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(custom): something new [#HIVE-001]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('### custom');
      expect(diff).not.toContain('### custom —');
    });

    it('places commits with no scope under General', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix: patch a global issue [#HIVE-999]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('### General');
    });

    it('does not include the scope or type in the commit line', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop): add machine dashboard [#HIVE-063]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).not.toContain('feat(shop):');
      expect(diff).not.toContain('**shop:**');
    });
  });

  describe('scope ordering', () => {
    it('sorts known scopes in business priority order', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(erp): erp change [#HIVE-1]',
          'feat(api): new endpoint [#HIVE-2]',
          'feat(shop): shop change [#HIVE-3]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      const shopPos = diff.indexOf('### shop');
      const apiPos = diff.indexOf('### api');
      const erpPos = diff.indexOf('### erp');
      expect(shopPos).toBeLessThan(apiPos);
      expect(apiPos).toBeLessThan(erpPos);
    });

    it('places unknown scopes alphabetically before General', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'fix: no-scope fix [#HIVE-1]',
          'feat(zebra): unknown scope [#HIVE-2]',
          'feat(alpha): unknown scope [#HIVE-3]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      const alphaPos = diff.indexOf('### alpha');
      const zebraPos = diff.indexOf('### zebra');
      const generalPos = diff.indexOf('### General');
      expect(alphaPos).toBeLessThan(zebraPos);
      expect(zebraPos).toBeLessThan(generalPos);
    });

    it('places General last even when known scopes are present', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'fix: global fix [#HIVE-1]',
          'feat(shop): shop feature [#HIVE-2]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff.indexOf('### shop')).toBeLessThan(
        diff.indexOf('### General')
      );
    });
  });

  describe('ordering', () => {
    it('renders type sections within a scope in COMMIT_TYPES order', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'perf(inv): optimise stock query [#HIVE-3]',
          'fix(inv): fix data loss bug [#HIVE-2]',
          'feat(inv): add export feature [#HIVE-1]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      const featPos = diff.indexOf('#### Features');
      const bugfixPos = diff.indexOf('#### Bugfixes');
      const perfPos = diff.indexOf('#### Performance Improvements');
      expect(featPos).toBeGreaterThan(-1);
      expect(bugfixPos).toBeGreaterThan(-1);
      expect(perfPos).toBeGreaterThan(-1);
      expect(featPos).toBeLessThan(bugfixPos);
      expect(bugfixPos).toBeLessThan(perfPos);
    });

    it('renders type sections consistently regardless of commit order in git log', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(inv): add export feature [#HIVE-1]',
          'perf(inv): optimise stock query [#HIVE-3]',
          'fix(inv): fix data loss bug [#HIVE-2]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff.indexOf('#### Features')).toBeLessThan(
        diff.indexOf('#### Bugfixes')
      );
      expect(diff.indexOf('#### Bugfixes')).toBeLessThan(
        diff.indexOf('#### Performance Improvements')
      );
    });
  });

  describe('breaking changes', () => {
    it('renders breaking change commits under ⚠ Breaking Changes', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(core)!: remove deprecated v1 endpoints [#HIVE-200]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('#### ⚠ Breaking Changes');
      expect(diff).toContain('remove deprecated v1 endpoints');
    });

    it('puts ⚠ Breaking Changes before other type sections', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(shop): regular feature [#HIVE-1]',
          'feat(shop)!: breaking feature [#HIVE-2]'
        )
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff.indexOf('⚠ Breaking Changes')).toBeLessThan(
        diff.indexOf('#### Features')
      );
    });

    it('does not duplicate breaking change commits in their type section', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop)!: breaking feature [#HIVE-2]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('#### ⚠ Breaking Changes');
      expect(diff).not.toContain('#### Features');
    });
  });

  describe('hidden types', () => {
    it('omits chore commits', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('chore(core): bump deps [#HIVE-1]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).not.toContain('bump deps');
    });

    it('omits refactor commits', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('refactor(api): extract helper [#HIVE-1]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).not.toContain('extract helper');
    });
  });

  describe('ticket extraction', () => {
    it('strips the bracket reference from the displayed subject', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop): add dashboard [#HIVE-1238]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('add dashboard');
      expect(diff).not.toContain('[#HIVE-1238]');
    });

    it('renders ticket IDs as plain text when no trackerUrl is given', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(erp): resolve sync issue [#HIVE-1300]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('HIVE-1300');
      expect(diff).not.toContain('http');
    });

    it('renders ticket IDs as links when trackerUrl is provided', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(erp): resolve sync issue [#HIVE-1300]')
      });
      const diff = await generateDiff(VERSION, DATE, null, TRACKER);
      expect(diff).toContain(`[HIVE-1300](${TRACKER}/HIVE-1300)`);
    });

    it('handles multiple tickets on one commit', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(shop): task assignment [#HIVE-301, #SUPP-012]')
      });
      const diff = await generateDiff(VERSION, DATE, null, TRACKER);
      expect(diff).toContain(`[HIVE-301](${TRACKER}/HIVE-301)`);
      expect(diff).toContain(`[SUPP-012](${TRACKER}/SUPP-012)`);
    });

    it('strips --no-issue and shows no ticket reference', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(common): fix typo in shared utility --no-issue')
      });
      const diff = await generateDiff(VERSION, DATE, null, TRACKER);
      expect(diff).toContain('fix typo in shared utility');
      expect(diff).not.toContain('--no-issue');
      expect(diff).not.toContain('stemys.atlassian.net');
    });

    it('strips --no-issue followed by [skip ci]', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(common): hotfix --no-issue [skip ci]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('hotfix');
      expect(diff).not.toContain('--no-issue');
      expect(diff).not.toContain('[skip ci]');
    });

    it('strips [skip ci] from the commit line', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(inv): bulk import [#HIVE-089] [skip ci]')
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('bulk import');
      expect(diff).not.toContain('[skip ci]');
    });
  });

  describe('commit body', () => {
    it('uses only the subject line and ignores the body', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout:
          '\x00abcdef1234567\nfeat(qc): add quality metrics [#HIVE-150]\n\nThis body paragraph describes implementation details.\nIt spans multiple lines and should not appear in the changelog.\n'
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('add quality metrics');
      expect(diff).not.toContain('body paragraph');
      expect(diff).not.toContain('implementation details');
    });
  });

  describe('commit hash link', () => {
    it('renders the hash in backticks when commit-url is not set', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: '\x00abcdef1234567\nfeat(shop): shiny thing [#HIVE-1]\n'
      });
      const diff = await generateDiff(VERSION, DATE, null);
      expect(diff).toContain('(`abcdef1`)');
      expect(diff).not.toContain('commit/');
    });

    it('renders an absolute commit link when commit-url is set', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: '\x00abcdef1234567\nfeat(shop): shiny thing [#HIVE-1]\n'
      });
      const diff = await generateDiff(
        VERSION,
        DATE,
        null,
        '',
        '',
        'https://github.com/stemys/hive-suite-backend/commit'
      );
      expect(diff).toContain(
        '([abcdef1](https://github.com/stemys/hive-suite-backend/commit/abcdef1234567))'
      );
    });
  });

  describe('git range', () => {
    it('uses HEAD when no previousTag is given', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' });
      await generateDiff(VERSION, DATE, null);
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['HEAD']),
        expect.any(Object)
      );
    });

    it('uses ref..HEAD when previousTag is given', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' });
      await generateDiff(VERSION, DATE, 'v0.9.0');
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['v0.9.0..HEAD']),
        expect.any(Object)
      );
    });
  });
});
