import { getExecOutput } from '@actions/exec'
import semver from 'semver'

function stripPrefix(tag, prefix) {
  return tag.startsWith(prefix) ? tag.slice(prefix.length) : tag
}

export async function resolveVersions(tagPrefix, scope, stage) {
  const { stdout } = await getExecOutput(
    'git',
    ['tag', '--list', `${tagPrefix}*`],
    {
      silent: true
    }
  )

  const allTags = stdout
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => semver.valid(stripPrefix(t, tagPrefix)))
    .sort((a, b) =>
      semver.rcompare(stripPrefix(a, tagPrefix), stripPrefix(b, tagPrefix))
    )

  const previousTag = allTags.length > 0 ? allTags[0] : null

  const stableTags = allTags.filter(
    (t) => !semver.prerelease(stripPrefix(t, tagPrefix))
  )
  const stableVersion =
    stableTags.length > 0 ? stripPrefix(stableTags[0], tagPrefix) : '0.0.0'
  const nextStableVersion = semver.inc(stableVersion, scope)

  let newVersion
  if (stage === 'stable') {
    newVersion = nextStableVersion
  } else {
    const latestMatchingPre = allTags.find((t) => {
      const v = stripPrefix(t, tagPrefix)
      const pre = semver.prerelease(v)
      if (!pre) return false
      const base = `${semver.major(v)}.${semver.minor(v)}.${semver.patch(v)}`
      return base === nextStableVersion && pre[0] === stage
    })

    if (latestMatchingPre) {
      const preV = stripPrefix(latestMatchingPre, tagPrefix)
      newVersion = semver.inc(preV, 'prerelease', stage)
    } else {
      newVersion = `${nextStableVersion}-${stage}.0`
    }
  }

  return { previousTag, newTag: `${tagPrefix}${newVersion}` }
}
