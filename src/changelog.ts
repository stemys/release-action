import { getExecOutput } from '@actions/exec'
import { CommitParser } from 'conventional-commits-parser'

// To toggle a type in/out of the changelog, flip its hidden flag.
const COMMIT_TYPES = [
  { type: 'feat', title: 'Features', hidden: false },
  { type: 'fix', title: 'Bugfixes', hidden: false },
  { type: 'perf', title: 'Performance Improvements', hidden: false },
  { type: 'revert', title: 'Reverts', hidden: false },
  { type: 'docs', title: 'Documentation', hidden: false },
  { type: 'refactor', title: 'Code Refactoring', hidden: true },
  { type: 'style', title: 'Styles', hidden: true },
  { type: 'test', title: 'Tests', hidden: true },
  { type: 'build', title: 'Build tool', hidden: true },
  { type: 'ci', title: 'CI/CD', hidden: true },
  { type: 'chore', title: 'Chores', hidden: true }
] as const

// Scopes in business priority order.
// Unknown scopes sort alphabetically after known ones.
// Commits with no scope are grouped under "General" at the end.
const SCOPE_REGISTRY: [string, string][] = [
  ['admin', 'Hive Admin'],
  ['inv', 'Inventory'],
  ['qc', 'Quality Control'],
  ['shop', 'Shopfloor'],
  ['cl', 'Closed Loop'],
  ['rep', 'Reporting'],
  ['iot', 'IoT'],
  ['api', 'API'],
  ['erp', 'ERP'],
  ['ui-lib', 'UI Library'],
  ['common', 'Common'],
  ['core', 'Core']
]

const SCOPE_LABEL = new Map<string, string>(SCOPE_REGISTRY)
const SCOPE_PRIORITY = new Map<string, number>(
  SCOPE_REGISTRY.map(([k], i) => [k, i])
)
const VISIBLE_TYPES = new Map<string, string>(
  COMMIT_TYPES.filter((t) => !t.hidden).map((t) => [t.type, t.title])
)
const NO_SCOPE_KEY = '__none__'

// Matches [#HIVE-123, #SUPP-456] at end of subject, tolerates trailing [skip ci].
const TICKET_RE =
  /\[(#[A-Z]+-\d+(?:,\s*#[A-Z]+-\d+)*)\](?:\s*\[skip\s+ci\])?\s*$/

// Matches --no-issue at end of subject (with optional trailing [skip ci]).
const NO_ISSUE_RE = /\s*--no-issue(?:\s*\[skip\s+ci\])?\s*$/

interface TicketExtraction {
  cleanSubject: string
  tickets: string[]
}

function extractTickets(subject: string | null | undefined): TicketExtraction {
  const raw = subject ?? ''

  const noIssueMatch = raw.match(NO_ISSUE_RE)
  if (noIssueMatch) {
    return {
      cleanSubject: raw.slice(0, noIssueMatch.index).trim(),
      tickets: []
    }
  }

  const match = raw.match(TICKET_RE)
  if (!match) return { cleanSubject: raw.trim(), tickets: [] }
  const cleanSubject = raw.slice(0, match.index).trim()
  const tickets = match[1].split(',').map((t) => t.trim().replace(/^#/, ''))
  return { cleanSubject, tickets }
}

function renderTickets(tickets: string[], trackerUrl: string): string {
  if (!tickets.length) return ''
  const links = tickets.map((t) =>
    trackerUrl ? `[${t}](${trackerUrl}/${t})` : t
  )
  return ` (${links.join(', ')})`
}

interface CommitNote {
  title: string
  text: string
}

interface ParsedCommit {
  type?: string | null
  scope?: string | null
  subject?: string | null
  notes: CommitNote[]
  hash: string
}

function formatLine(
  commit: ParsedCommit,
  trackerUrl: string,
  commitUrl: string
): string {
  // Breaking commits flagged with ! have subject=null; the text is in notes[0].
  const rawSubject =
    commit.subject ??
    commit.notes.find((n) => n.title === 'BREAKING CHANGE')?.text ??
    ''
  const { cleanSubject, tickets } = extractTickets(rawSubject)
  const ticketStr = renderTickets(tickets, trackerUrl)
  const ref = commit.hash
    ? commitUrl
      ? ` ([${commit.hash.slice(0, 7)}](${commitUrl}/${commit.hash}))`
      : ` (\`${commit.hash.slice(0, 7)}\`)`
    : ''
  return `- ${cleanSubject}${ticketStr}${ref}`
}

// Custom headerPattern adds an optional (!) capture group so the ! breaking-change
// marker is recognised. breakingHeaderPattern causes the parser to emit a
// BREAKING CHANGE note and set subject to null — formatLine falls back to the
// note text in that case.
const parser = new CommitParser({
  headerPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?(!)?: (.*)$/,
  headerCorrespondence: ['type', 'scope', 'breaking', 'subject'],
  breakingHeaderPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?!: (.*)$/
})

interface RawCommit {
  hash: string
  message: string
}

async function getRawCommits(ref: string | null): Promise<RawCommit[]> {
  const range = ref ? `${ref}..HEAD` : 'HEAD'
  const { stdout } = await getExecOutput(
    'git',
    ['log', range, '--format=%x00%H%n%B'],
    { silent: true }
  )

  return stdout
    .split('\x00')
    .filter(Boolean)
    .map((block) => {
      const nl = block.indexOf('\n')
      return {
        hash: block.slice(0, nl).trim(),
        message: block.slice(nl + 1).trim()
      }
    })
    .filter((c) => c.hash)
}

interface ScopeBucket {
  breaking: ParsedCommit[]
  byType: Map<string, ParsedCommit[]>
}

export async function generateDiff(
  version: string,
  date: string,
  previousTag: string | null,
  trackerUrl = '',
  releaseUrl = '',
  commitUrl = ''
): Promise<string> {
  const rawCommits = await getRawCommits(previousTag)

  const parsed: ParsedCommit[] = rawCommits.map(({ hash, message }) => ({
    ...(parser.parse(message) as ParsedCommit),
    hash
  }))

  // Group commits into: scope -> { breaking: [], byType: Map<type, commit[]> }
  // Breaking change commits appear only in ⚠ Breaking Changes, not their type section.
  const scopeMap = new Map<string, ScopeBucket>()

  for (const commit of parsed) {
    const isBreaking = commit.notes.some((n) => n.title === 'BREAKING CHANGE')
    const isVisible = VISIBLE_TYPES.has(commit.type ?? '')
    if (!isBreaking && !isVisible) continue

    const scopeKey = commit.scope ?? NO_SCOPE_KEY
    if (!scopeMap.has(scopeKey)) {
      scopeMap.set(scopeKey, { breaking: [], byType: new Map() })
    }
    const bucket = scopeMap.get(scopeKey)!

    if (isBreaking) {
      bucket.breaking.push(commit)
    } else {
      const type = commit.type ?? ''
      if (!bucket.byType.has(type)) bucket.byType.set(type, [])
      bucket.byType.get(type)!.push(commit)
    }
  }

  const versionLink = releaseUrl ? `[${version}](${releaseUrl})` : version
  const lines = [`## ${versionLink} — ${date}`, '']

  if (scopeMap.size === 0) return lines.join('\n')

  // Sort: known scopes by priority index, unknown alphabetically, no-scope last.
  const sortedScopes = [...scopeMap.keys()].sort((a, b) => {
    if (a === NO_SCOPE_KEY) return 1
    if (b === NO_SCOPE_KEY) return -1
    const pa = SCOPE_PRIORITY.get(a) ?? Infinity
    const pb = SCOPE_PRIORITY.get(b) ?? Infinity
    if (pa !== pb) return pa - pb
    return a.localeCompare(b)
  })

  for (const scopeKey of sortedScopes) {
    const { breaking, byType } = scopeMap.get(scopeKey)!
    const label = SCOPE_LABEL.get(scopeKey)

    if (scopeKey === NO_SCOPE_KEY) {
      lines.push('### General', '')
    } else {
      lines.push(label ? `### ${scopeKey} — ${label}` : `### ${scopeKey}`, '')
    }

    if (breaking.length > 0) {
      lines.push('#### ⚠ Breaking Changes', '')
      for (const c of breaking) lines.push(formatLine(c, trackerUrl, commitUrl))
      lines.push('')
    }

    for (const { type, title } of COMMIT_TYPES.filter((t) => !t.hidden)) {
      const commits = byType.get(type)
      if (!commits?.length) continue
      lines.push(`#### ${title}`, '')
      for (const c of commits) lines.push(formatLine(c, trackerUrl, commitUrl))
      lines.push('')
    }
  }

  return lines.join('\n')
}
