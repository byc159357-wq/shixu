import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveUserDataDirectory } from '../user-data-migration'

describe('user data migration', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('copies persistent legacy data into the branded directory', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'shixu-profile-'))
    roots.push(root)
    const legacy = path.join(root, 'workdeck')
    mkdirSync(path.join(legacy, 'Local Storage'), { recursive: true })
    mkdirSync(path.join(legacy, 'Cache'), { recursive: true })
    writeFileSync(path.join(legacy, 'workdeck.db'), 'database')
    writeFileSync(path.join(legacy, 'Local Storage', 'state'), 'sessions')
    writeFileSync(path.join(legacy, 'Cache', 'cache.bin'), 'cache')

    const result = resolveUserDataDirectory(root)

    expect(result).toBe(path.join(root, '拾序'))
    expect(readFileSync(path.join(result, 'workdeck.db'), 'utf8')).toBe('database')
    expect(readFileSync(path.join(result, 'Local Storage', 'state'), 'utf8')).toBe('sessions')
    expect(existsSync(path.join(result, 'Cache'))).toBe(false)
  })

  it('creates a fresh branded directory when no legacy database exists', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'shixu-profile-'))
    roots.push(root)
    const result = resolveUserDataDirectory(root)

    expect(result).toBe(path.join(root, '拾序'))
    expect(existsSync(result)).toBe(true)
  })
})
