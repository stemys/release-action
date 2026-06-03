import { afterEach, describe, expect, it, jest } from '@jest/globals'

const mockGetExecOutput =
  jest.fn<
    (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string }>
  >()

jest.unstable_mockModule('@actions/exec', () => ({
  getExecOutput: mockGetExecOutput
}))

const { generateDiff } = await import('../src/changelog.js')

const VERSION = '1.0.0'
const DATE = '2026-06-03'
const TRACKER = 'https://stemys.atlassian.net/browse'

function gitLog(...messages: string[]): string {
  return messages
    .map((m, i) => `\x00hash${String(i).padStart(12, '0')}\n${m}`)
    .join('')
}

describe('generateDiff', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('header', () => {
    it('uses an em dash and no tag prefix in the version heading', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain(`## [${VERSION}] — ${DATE}`)
    })

    it('returns only the header when there are no visible commits', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).not.toContain('###')
    })
  })

  describe('scope grouping', () => {
    it('groups commits under their scope section with label', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop): add machine dashboard [#HIVE-063]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('### shop — Shopfloor')
      expect(diff).toContain('#### Features')
      expect(diff).toContain('add machine dashboard')
    })

    it('renders an unknown scope without a label', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(custom): something new [#HIVE-001]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('### custom')
      expect(diff).not.toContain('### custom —')
    })

    it('places commits with no scope under General', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix: patch a global issue [#HIVE-999]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('### General')
    })

    it('does not include the scope or type in the commit line', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop): add machine dashboard [#HIVE-063]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).not.toContain('feat(shop):')
      expect(diff).not.toContain('**shop:**')
    })
  })

  describe('scope ordering', () => {
    it('sorts known scopes in business priority order', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(api): new endpoint [#HIVE-1]',
          'feat(erp): erp change [#HIVE-2]',
          'feat(shop): shop change [#HIVE-3]'
        )
      })
      const diff = await generateDiff(VERSION, DATE, null)
      const erpPos = diff.indexOf('### erp')
      const shopPos = diff.indexOf('### shop')
      const apiPos = diff.indexOf('### api')
      expect(erpPos).toBeLessThan(shopPos)
      expect(shopPos).toBeLessThan(apiPos)
    })

    it('places unknown scopes alphabetically before General', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'fix: no-scope fix [#HIVE-1]',
          'feat(zebra): unknown scope [#HIVE-2]',
          'feat(alpha): unknown scope [#HIVE-3]'
        )
      })
      const diff = await generateDiff(VERSION, DATE, null)
      const alphaPos = diff.indexOf('### alpha')
      const zebraPos = diff.indexOf('### zebra')
      const generalPos = diff.indexOf('### General')
      expect(alphaPos).toBeLessThan(zebraPos)
      expect(zebraPos).toBeLessThan(generalPos)
    })

    it('places General last even when known scopes are present', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'fix: global fix [#HIVE-1]',
          'feat(shop): shop feature [#HIVE-2]'
        )
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff.indexOf('### shop')).toBeLessThan(diff.indexOf('### General'))
    })
  })

  describe('breaking changes', () => {
    it('renders breaking change commits under ⚠ Breaking Changes', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(core)!: remove deprecated v1 endpoints [#HIVE-200]'
        )
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('#### ⚠ Breaking Changes')
      expect(diff).toContain('remove deprecated v1 endpoints')
    })

    it('puts ⚠ Breaking Changes before other type sections', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog(
          'feat(shop): regular feature [#HIVE-1]',
          'feat(shop)!: breaking feature [#HIVE-2]'
        )
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff.indexOf('⚠ Breaking Changes')).toBeLessThan(
        diff.indexOf('#### Features')
      )
    })

    it('does not duplicate breaking change commits in their type section', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop)!: breaking feature [#HIVE-2]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('#### ⚠ Breaking Changes')
      expect(diff).not.toContain('#### Features')
    })
  })

  describe('hidden types', () => {
    it('omits chore commits', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('chore(core): bump deps [#HIVE-1]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).not.toContain('bump deps')
    })

    it('omits refactor commits', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('refactor(api): extract helper [#HIVE-1]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).not.toContain('extract helper')
    })
  })

  describe('ticket extraction', () => {
    it('strips the bracket reference from the displayed subject', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(shop): add dashboard [#HIVE-1238]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('add dashboard')
      expect(diff).not.toContain('[#HIVE-1238]')
    })

    it('renders ticket IDs as plain text when no trackerUrl is given', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(erp): resolve sync issue [#HIVE-1300]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('HIVE-1300')
      expect(diff).not.toContain('http')
    })

    it('renders ticket IDs as links when trackerUrl is provided', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(erp): resolve sync issue [#HIVE-1300]')
      })
      const diff = await generateDiff(VERSION, DATE, null, TRACKER)
      expect(diff).toContain(`[HIVE-1300](${TRACKER}/HIVE-1300)`)
    })

    it('handles multiple tickets on one commit', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('fix(shop): task assignment [#HIVE-301, #SUPP-012]')
      })
      const diff = await generateDiff(VERSION, DATE, null, TRACKER)
      expect(diff).toContain(`[HIVE-301](${TRACKER}/HIVE-301)`)
      expect(diff).toContain(`[SUPP-012](${TRACKER}/SUPP-012)`)
    })

    it('strips [skip ci] from the commit line', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: gitLog('feat(inv): bulk import [#HIVE-089] [skip ci]')
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('bulk import')
      expect(diff).not.toContain('[skip ci]')
    })
  })

  describe('commit hash link', () => {
    it('appends a short hash link to each commit line', async () => {
      mockGetExecOutput.mockResolvedValue({
        stdout: '\x00abcdef1234567\nfeat(shop): shiny thing [#HIVE-1]\n'
      })
      const diff = await generateDiff(VERSION, DATE, null)
      expect(diff).toContain('([abcdef1](../../commit/abcdef1234567))')
    })
  })

  describe('git range', () => {
    it('uses HEAD when no previousTag is given', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' })
      await generateDiff(VERSION, DATE, null)
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['HEAD']),
        expect.any(Object)
      )
    })

    it('uses ref..HEAD when previousTag is given', async () => {
      mockGetExecOutput.mockResolvedValue({ stdout: '' })
      await generateDiff(VERSION, DATE, 'v0.9.0')
      expect(mockGetExecOutput).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['v0.9.0..HEAD']),
        expect.any(Object)
      )
    })
  })
})
