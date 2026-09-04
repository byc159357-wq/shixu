export function isSmokeRun(): boolean {
  return process.argv.includes('--smoke')
}
