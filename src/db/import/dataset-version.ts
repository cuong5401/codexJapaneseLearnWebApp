const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
export function compareDatasetVersions(left: string, right: string): -1 | 0 | 1 {
  const a = versionPattern.exec(left); const b = versionPattern.exec(right)
  if (!a || !b) throw new TypeError('Dataset versions must use MAJOR.MINOR.PATCH with an optional prerelease suffix.')
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index])
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  if (a[4] === b[4]) return 0
  if (a[4] === undefined) return 1
  if (b[4] === undefined) return -1
  const prereleaseDifference = a[4].localeCompare(b[4], 'en', { numeric: true })
  return prereleaseDifference < 0 ? -1 : prereleaseDifference > 0 ? 1 : 0
}
