import { jest } from '@jest/globals'

export const getOctokit = jest.fn()

export const context = {
  repo: { owner: 'test-owner', repo: 'test-repo' },
  payload: { actor: 'mona' }
}
