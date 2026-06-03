import { context, getOctokit } from '@actions/github';

export async function createRelease(
  token: string,
  tagName: string,
  body: string
): Promise<string> {
  const octokit = getOctokit(token);
  const { owner, repo } = context.repo;

  const { data } = await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: tagName,
    name: tagName,
    body
  });

  return data.html_url;
}
