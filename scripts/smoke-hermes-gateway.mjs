import fs from 'node:fs'
import path from 'node:path'

const localAppData = process.env.LOCALAPPDATA || ''
const ledgerPath = path.join(localAppData, 'hermes', 'spawn-ledger.json')
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
const active = [...ledger].reverse().find((entry) => entry?.purpose === 'serve' && entry?.port)

if (!active) throw new Error('Hermes serve gateway was not found')

const baseUrl = `http://127.0.0.1:${active.port}`
const html = await (await fetch(`${baseUrl}/`)).text()
const match = /window\.__HERMES_SESSION_TOKEN__\s*=\s*("(?:\\.|[^"\\])*")/.exec(html)

if (!match) throw new Error('Hermes session token was not advertised')

const token = JSON.parse(match[1])
const ws = new WebSocket(`ws://127.0.0.1:${active.port}/api/ws?token=${encodeURIComponent(token)}`)
const prompt = process.argv.includes('--prompt')
let sessionId = ''
let text = ''
const timeout = setTimeout(() => {
  console.error('gateway smoke timeout')
  process.exit(2)
}, prompt ? 60_000 : 10_000)

ws.addEventListener('message', (event) => {
  const frame = JSON.parse(String(event.data))
  if (frame?.params?.type === 'gateway.ready') {
    ws.send(JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: prompt ? 'session.create' : 'ping',
      params: prompt ? { cwd: process.cwd(), title: 'Workdeck Gateway Smoke', close_on_disconnect: true } : {}
    }))
  }
  if (frame?.id === 1 && prompt) {
    sessionId = frame.result?.session_id
    console.error(JSON.stringify({ sessionId, createError: frame.error?.message || null }))
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompt.submit', params: { session_id: sessionId, text: '/help' } }))
  } else if (frame?.id === 1) {
    clearTimeout(timeout)
    console.log(JSON.stringify({ ok: true, port: active.port, result: frame.result }))
    ws.close()
  }
  if (prompt && frame?.method === 'event' && frame?.params?.session_id === sessionId) {
    console.error(JSON.stringify({ event: frame.params.type }))
    if (frame.params.type === 'message.delta') text += frame.params.payload?.text || ''
    if (frame.params.type === 'message.complete') {
      clearTimeout(timeout)
      console.log(JSON.stringify({ ok: true, port: active.port, elapsedReply: true, text: frame.params.payload?.text || text }))
      ws.close()
    }
  }
  if (prompt && frame?.id === 2) console.error(JSON.stringify({ submit: frame.error?.message || frame.result || null }))
})

ws.addEventListener('error', () => {
  clearTimeout(timeout)
  throw new Error('Hermes gateway WebSocket failed')
})
