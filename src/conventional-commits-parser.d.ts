import type { Options } from 'conventional-commits-parser'

declare module 'conventional-commits-parser' {
  class CommitParser {
    constructor(options?: Options)
    parse(commit: string): Commit
  }
}
