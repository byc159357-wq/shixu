import { spawn } from 'node:child_process'
import readline from 'node:readline'

const exe = process.env.HERMES_ACP_EXE ||
  'C:\\Users\\16001\\AppData\\Local\\hermes\\bin\\hermes-acp.exe'
const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
const lines = readline.createInterface({ input: child.stdout })
const pending = new Map()
const streamedText = []
let printedTextShape = false
let nextId = 0

function rpc(method, params, timeout = 150_000) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timed out`))
    }, timeout)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

function textOf(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).join('')
  if (typeof value !== 'object') return ''
  if (value.result !== undefined) return textOf(value.result)
  for (const key of ['content', 'messages', 'output', 'message', 'text', 'response', 'answer', 'reply']) {
    const text = textOf(value[key])
    if (text) return text
  }
  return ''
}

lines.on('line', (line) => {
  let message
  try { message = JSON.parse(line) } catch { return }
  if (typeof message.id !== 'number') {
    const update = message?.method === 'session/update' ? message.params?.update : null
    const kind = update?.sessionUpdate ?? update?.session_update
    if (kind === 'agent_message_chunk' && typeof update?.content?.text === 'string') {
      streamedText.push(update.content.text)
      if (!printedTextShape) {
        printedTextShape = true
        console.error('ACP_TEXT_SHAPE=' + JSON.stringify(message))
      }
    }
    return
  }
  if (message.method) {
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: message.id,
      error: { code: -32601, message: 'Smoke test does not expose tools' }
    }) + '\n')
    return
  }
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  clearTimeout(request.timer)
  if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)))
  else request.resolve(message.result)
})

try {
  const started = Date.now()
  await rpc('initialize', {
    protocol_version: 1,
    client_capabilities: {},
    client_info: { name: 'workdeck-smoke', version: '1.0.0' }
  }, 30_000)
  const session = await rpc('session/new', { cwd: process.cwd(), mcpServers: [] }, 60_000)
  const sessionId = session?.sessionId ?? session?.session_id
  if (!sessionId) throw new Error('Hermes did not return a session id')
  const result = await rpc('session/prompt', {
    sessionId,
    prompt: [{ type: 'text', text: process.env.HERMES_SMOKE_PROMPT || '只回复两个字：正常' }]
  })
  const text = (textOf(result) || streamedText.join('')).trim()
  if (!text) throw new Error('Hermes completed without text')
  console.log(JSON.stringify({ ok: true, elapsedMs: Date.now() - started, text }))
} finally {
  child.kill()
}
