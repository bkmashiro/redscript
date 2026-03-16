/**
 * Minecraft version target enumeration.
 *
 * Encoded as: major * 1000 + minor (patch is ignored for feature gating).
 * e.g., 1.20.2 → 20002, 1.21 → 21000, 1.21.4 → 21004
 */

export enum McVersion {
  v1_19   = 19000,
  v1_20   = 20000,
  v1_20_2 = 20002,
  v1_20_4 = 20004,
  v1_21   = 21000,
  v1_21_4 = 21004,
}

/**
 * Parse a version string like "1.20.2" or "1.21" into a McVersion number.
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
  if (major !== 1) {
    throw new Error(`Invalid MC version: "${s}" — only Minecraft 1.x is supported`)
  }
  return minor * 1000 + patch as McVersion
}

/**
 * Compare two McVersion values. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareMcVersion(a: McVersion, b: McVersion): number {
  return a - b
}

export const DEFAULT_MC_VERSION = McVersion.v1_21
