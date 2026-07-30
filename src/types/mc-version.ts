/**
 * Minecraft version target enumeration.
 *
 * Encoded as a monotonically increasing release number:
 * - legacy `1.minor.patch` releases use `minor * 1000 + patch`
 * - year-based `year.drop[.patch]` releases use `year * 1000 + drop`
 *
 * Examples: 1.20.2 → 20002, 1.21.4 → 21004, 26.1 → 26001.
 * Patch releases such as 26.1.2 intentionally share the 26.1 feature target.
 */

export enum McVersion {
  v1_19   = 19000,
  v1_20   = 20000,
  v1_20_2 = 20002,
  v1_20_4 = 20004,
  v1_21   = 21000,
  v1_21_4 = 21004,
  v26_1   = 26001,
  v26_2   = 26002,
}

/**
 * Parse a version string like "1.20.2", "1.21", or "26.2" into a
 * feature-target McVersion number.
 * Throws if the string is not a valid Minecraft version.
 */
export function parseMcVersion(s: string): McVersion {
  const parts = s.trim().split('.')
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid MC version: "${s}" — expected format "1.20" or "1.20.2"`)
  }
  const [majorStr, minorStr, patchStr = '0'] = parts
  const major = parseInt(majorStr, 10)
  const minor = parseInt(minorStr, 10)
  const patch = parseInt(patchStr, 10)
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`Invalid MC version: "${s}" — non-numeric component`)
  }
  if (major === 1) {
    return minor * 1000 + patch as McVersion
  }
  if (major >= 26 && minor >= 1) {
    return major * 1000 + minor as McVersion
  }
  throw new Error(`Invalid MC version: "${s}" — expected Minecraft 1.x or year-based 26.1+`)
}

/**
 * Compare two McVersion values. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareMcVersion(a: McVersion, b: McVersion): number {
  return a - b
}

/**
 * Map a Minecraft version to the corresponding pack_format integer.
 * See https://minecraft.wiki/w/Pack_format
 */
export function mcVersionToPackFormat(version: McVersion): number {
  if (version >= McVersion.v26_2)   return 107.1
  if (version >= McVersion.v26_1)   return 101.1
  if (version >= McVersion.v1_21_4) return 61
  if (version >= McVersion.v1_21)   return 45
  if (version >= McVersion.v1_20_4) return 26
  if (version >= McVersion.v1_20_2) return 22
  if (version >= McVersion.v1_20)   return 18
  return 15 // 1.19 and below
}

export const DEFAULT_MC_VERSION = McVersion.v1_21
