import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HermesStreamEvent } from '../../../shared/types'
import { HermesAcpService } from '../hermes-acp.service'

/**
 * Headless smoke test for the ACP tool bridge + permission flow.
 *
 * We drive the service's inbound REQUEST handlers directly through a stubbed
 * stdio transport instead of spawning the real Hermes process, so the tests
 * verify the actual bridge logic (read-only tools run immediately; sensitive
 * tools are deferred to a permission card and only execute on 允许) without
 * depending on a model, network, or a configured provider.
 */

/** Build a service whose child transport captures outbound JSON-RPC frames. */
function makeBridge() {
  const push: HermesStreamEvent[] = []
  const outbox: string[] = []
  const stdin = {
    writable: true,
    write: (frame: string) => {
      outbox.push(frame)
    }
  }
  const child = { stdin, killed: false } as any
  const svc = new HermesAcpService((ev) => push.push(ev))
  ;(svc as any).child = child
  ;(svc as any).started = true

  /** Feed one inbound tool REQUEST the way the readline handler does. */
  const deliver = (id: number, method: string, params?: any) => {
    ;(svc as any).handleInboundRequest({ id, method, params })
  }

  return { svc, push, outbox, child, deliver }
}

const SET_WS = process.env.WORKDECK_WORKSPACE
let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workdeck-bridge-'))
  process.env.WORKDECK_WORKSPACE = tmp
})

afterEach(() => {
  if (SET_WS) process.env.WORKDECK_WORKSPACE = SET_WS
  else delete process.env.WORKDECK_WORKSPACE
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('Hermes ACP tool bridge', () => {
  it('read-only fs/list_directory executes immediately and returns real entries', async () => {
    fs.mkdirSync(path.join(tmp, 'sub'))
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'hello')

    const { outbox, push, deliver } = makeBridge()
    deliver(1, 'fs/list_directory', { path: tmp })

    // First frame is the JSON-RPC response (an object, not an array).
    const reply = JSON.parse(outbox[0])
    expect(reply.id).toBe(1)
    expect(reply.result.entries.map((e: any) => e.name).sort()).toEqual(['a.txt', 'sub'])
    expect(push.some((e) => e.type === 'tool_result')).toBe(true)
  })

  it('read-only fs/read_text_file returns file content', async () => {
    const file = path.join(tmp, 'note.md')
    fs.writeFileSync(file, '# hi')

    const { outbox, deliver } = makeBridge()
    deliver(7, 'fs/read_text_file', { path: file })
    const reply = JSON.parse(outbox[0])
    expect(reply.id).toBe(7)
    expect(reply.result.content).toContain('# hi')
  })

  it('sensitive write defers to permission and only runs on 允许', async () => {
    const { outbox, push, deliver, svc } = makeBridge()

    deliver(10, 'fs/write_text_file', { path: path.join(tmp, 'out.txt'), content: 'data' })

    // Nothing written yet — the tool is queued behind the confirm card.
    expect(fs.existsSync(path.join(tmp, 'out.txt'))).toBe(false)
    const perm = push.find((e) => e.type === 'permission') as Extract<HermesStreamEvent, { type: 'permission' }>
    expect(perm).toBeTruthy()
    expect(perm.requestId).toBe('tool_10')

    // 允许 → runSensitive executes the write and replies ok.
    ;(svc as any).respondPermission(perm.requestId, true)
    await new Promise((r) => setTimeout(r, 10))
    const file = path.join(tmp, 'out.txt')
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe('data')
    const ok = outbox[outbox.length - 1]
    expect(JSON.parse(ok).result.ok).toBe(true)
  })

  it('sensitive write denied never touches the filesystem and replies an error', async () => {
    const { outbox, push, deliver, svc } = makeBridge()
    deliver(11, 'fs/write_text_file', { path: path.join(tmp, 'deny.txt'), content: 'x' })

    const perm = push.find((e) => e.type === 'permission') as Extract<HermesStreamEvent, { type: 'permission' }>
    ;(svc as any).respondPermission(perm.requestId, false)
    await new Promise((r) => setTimeout(r, 10))

    expect(fs.existsSync(path.join(tmp, 'deny.txt'))).toBe(false)
    const last = JSON.parse(outbox[outbox.length - 1])
    expect(last.error).toBeTruthy()
    expect(String(last.error.message)).toContain('拒绝')
  })

  it('unknown tool is answered with not-bridged error', async () => {
    const { outbox, deliver } = makeBridge()
    deliver(12, 'fs/some_unknown_tool', {})
    const reply = JSON.parse(outbox[0])
    expect(reply.id).toBe(12)
    expect(reply.error.code).toBe(-32601)
  })
})
