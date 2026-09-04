import { describe, it, expect } from 'vitest'
import { normalizePath, extOf, nameOf, classifyType, isInstaller } from '../path-utils'

describe('path-utils', () => {
  it('normalizes forward slashes to backslashes', () => {
    expect(normalizePath('C:/Users/me/Desktop/file.png')).toBe('C:\\Users\\me\\Desktop\\file.png')
  })

  it('uppercases the drive letter', () => {
    expect(normalizePath('d:\\projects\\brand\\a.md')).toBe('D:\\projects\\brand\\a.md')
  })

  it('trims trailing separators but keeps the drive root', () => {
    expect(normalizePath('C:\\Users\\me\\folder\\')).toBe('C:\\Users\\me\\folder')
    expect(normalizePath('C:\\')).toBe('C:\\')
  })

  it('extracts lowercased extension without dot', () => {
    expect(extOf('C:\\x\\Logo.FINAL.PSD')).toBe('psd')
    expect(extOf('C:\\x\\noext')).toBe('')
  })

  it('gets basename', () => {
    expect(nameOf('C:\\x\\y\\logo-final.ai')).toBe('logo-final.ai')
  })

  it('classifies by extension', () => {
    expect(classifyType('C:\\x\\a.png', 'png')).toBe('image')
    expect(classifyType('C:\\x\\b.psd', 'psd')).toBe('design')
    expect(classifyType('C:\\x\\c.pdf', 'pdf')).toBe('document')
    expect(classifyType('C:\\x\\d.md', 'md')).toBe('markdown')
    expect(classifyType('C:\\x\\e.zip', 'zip')).toBe('archive')
  })

  it('classifies screenshot by name heuristics', () => {
    expect(classifyType('C:\\x\\Screenshot 2026-08-15.png', 'png')).toBe('screenshot')
    expect(classifyType('C:\\x\\截屏2026.png', 'png')).toBe('screenshot')
  })

  it('classifies AI output by path heuristics', () => {
    expect(classifyType('C:\\ComfyUI\\output\\img0001.png', 'png')).toBe('ai')
    expect(classifyType('C:\\x\\stable-diffusion\\out.png', 'png')).toBe('ai')
  })

  it('falls back to other', () => {
    expect(classifyType('C:\\x\\weird.zzz', 'zzz')).toBe('other')
  })

  it('detects installers by name and msi extension', () => {
    expect(isInstaller('C:\\Downloads\\setup.exe')).toBe(true)
    expect(isInstaller('C:\\Downloads\\VSCodeUserSetup-x64.exe')).toBe(true)
    expect(isInstaller('C:\\Downloads\\安装包123.zip')).toBe(true)
    expect(isInstaller('C:\\Downloads\\tool.msi')).toBe(true)
    expect(isInstaller('C:\\Downloads\\app.msi')).toBe(true)
    // Real apps / ROMs / media are NOT installers.
    expect(isInstaller('C:\\Desktop\\ROMS.lnk')).toBe(false)
    expect(isInstaller('C:\\Desktop\\微信.lnk')).toBe(false)
    expect(isInstaller('C:\\Downloads\\song.mp3')).toBe(false)
    expect(isInstaller('C:\\Downloads\\设计稿.psd')).toBe(false)
  })
})
