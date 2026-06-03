import { getOctokit, context } from '@actions/github'

export async function createRelease(token, tagName, body) {
  const octokit = getOctokit(token)
  const { owner, repo } = context.repo

  const { data } = await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: tagName,
    name: tagName,
    body
  })

  return data.html_url
}
