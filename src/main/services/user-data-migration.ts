import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const CACHE_DIRECTORIES = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache'
])

/**
 * Resolve the branded Electron profile directory and copy a legacy Workdeck
 * profile on first launch. Cache directories and the live lock file are not
 * migrated; Electron recreates them safely.
 */
export function resolveUserDataDirectory(appDataRoot: string): string {
  const branded = path.join(appDataRoot, '拾序')
  const legacy = path.join(appDataRoot, 'workdeck')
  const legacyDb = path.join(legacy, 'workdeck.db')
  const brandedDb = path.join(branded, 'workdeck.db')

  if (!existsSync(legacyDb) || existsSync(brandedDb)) {
    mkdirSync(branded, { recursive: true })
    return branded
  }

  try {
    mkdirSync(branded, { recursive: true })
    cpSync(legacy, branded, {
      recursive: true,
      force: false,
      errorOnExist: false,
      filter: (source) => {
        const relative = path.relative(legacy, source)
        const rootName = relative.split(path.sep)[0]
        return relative !== 'lockfile' && !CACHE_DIRECTORIES.has(rootName)
      }
    })
    return branded
  } catch (error) {
    // Data continuity is more important than the folder rename. If Windows has
    // a legacy SQLite/WAL file locked, keep using the known-good profile and
    // retry migration on a later launch.
    console.warn('[shixu] legacy profile migration deferred:', String(error))
    return legacy
  }
}

