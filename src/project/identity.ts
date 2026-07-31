export function isCanonicalModulePath(modulePath: string): boolean {
  const segments = modulePath.split('/')
  return !(
    modulePath.includes('\\')
    || modulePath.startsWith('/')
    || modulePath.endsWith('/')
    || segments.some(segment =>
      segment === ''
      || segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(segment),
    )
    || /\s/.test(modulePath)
  )
}
