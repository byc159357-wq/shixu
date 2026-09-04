import { describe, expect, it } from 'vitest'
import { extractHighResIcon } from '../high-res-icon'

function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

describe('extractHighResIcon', () => {
  const samples = [
    'C:\\Windows\\explorer.exe',
    'C:\\Windows\\System32\\notepad.exe',
    'C:\\Windows\\System32\\calc.exe'
  ]

  for (const p of samples) {
    it(`extracts a high-res PNG from ${p}`, () => {
      const buf = extractHighResIcon(p)
      expect(buf).not.toBeNull()
      const size = pngSize(buf!)
      expect(size).not.toBeNull()
      expect(size!.w).toBeGreaterThanOrEqual(32)
      expect(size!.w).toBeLessThanOrEqual(256)
      console.log(`  ${p} -> ${size!.w}x${size!.h} PNG (${buf!.length} bytes)`)
    })
  }
})
