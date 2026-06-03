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

export async function createMergeBackPR(
  token: string,
  tagName: string,
  mergeBackTo: string,
  body: string
): Promise<string | null> {
  const octokit = getOctokit(token);
  const { owner, repo } = context.repo;

  const { data: comparison } =
    await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${mergeBackTo}...${tagName}`
    });

  if (comparison.ahead_by === 0) {
    return null;
  }

  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `tags/${tagName}`
  });

  const branchName = `release/${tagName}`;
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha
  });

  const warning =
    `> [!WARNING]\n` +
    `> **Merge this PR using "Rebase and merge" only.**\n` +
    `> Squashing or creating a merge commit will collapse the release commits and break the commit history on \`${mergeBackTo}\`.\n\n`;

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `chore: merge release ${tagName} into ${mergeBackTo}`,
    head: branchName,
    base: mergeBackTo,
    body: warning + body
  });

  return pr.html_url;
}
