import { validRange } from 'semver'

export interface GitDependencySource {
  readonly kind: 'git'
  readonly url: string
}

export function normalizeGitSourceUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`Git source '${value}' must be an absolute URL`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
    throw new Error(`Git source '${value}' must use https: or file:`)
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Git source '${value}' must not contain credentials`)
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`Git source '${value}' must not contain a query or fragment`)
  }
  if (parsed.protocol === 'file:' && parsed.hostname && parsed.hostname !== 'localhost') {
    throw new Error(`Git file source '${value}' must not name a remote host`)
  }
  return parsed.href
}

export function normalizeSemverConstraint(value: string): string {
  const canonical = value.trim()
  if (!canonical || !validRange(canonical)) {
    throw new Error(`'${value}' must be a valid semantic version constraint`)
  }
  return canonical
}
