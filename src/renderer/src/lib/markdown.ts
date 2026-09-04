/**
 * Zero-dependency, minimal Markdown renderer (Phase 5).
 * Everything is HTML-escaped first — raw HTML in source never reaches the DOM.
 * Supported: ATX headings, bold/italic/strikethrough, inline code, fenced
 * code blocks, unordered/ordered lists (single level), blockquotes, thematic
 * breaks, links, paragraphs. Enough for notes; richer syntax later if needed.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInline(text: string): string {
  const escaped = escapeHtml(text)
  // code first (its contents stay untouched)
  let out = escaped.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`)
  // wiki links [[note title]] → clickable, handled by the editor via delegation
  out = out.replace(
    /\[\[([^\]\n]+)\]\]/g,
    (_m, label: string) => `<a class="wiki-link" data-title="${label}">${label}</a>`
  )
  // links [text](url) — only http/https/mailto
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, label: string, url: string) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`
  )
  // bold **x** then italic *x* then strikethrough ~~x~~
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return out
}

export function renderMarkdown(src: string): string {
  const lines = src.split(/\r?\n/)
  const html: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  let inCode = false
  let codeBuf: string[] = []
  let inQuote = false
  let quoteBuf: string[] = []

  const closeList = () => {
    if (list) {
      html.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`)
      list = null
    }
  }
  const closeQuote = () => {
    if (inQuote) {
      html.push(`<blockquote>${quoteBuf.join('<br/>')}</blockquote>`)
      inQuote = false
      quoteBuf = []
    }
  }
  const flushBlock = () => {
    closeList()
    closeQuote()
  }

  for (const raw of lines) {
    // fenced code
    if (raw.trimStart().startsWith('```')) {
      if (!inCode) {
        flushBlock()
        inCode = true
        codeBuf = []
      } else {
        inCode = false
        html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
      }
      continue
    }
    if (inCode) {
      codeBuf.push(raw)
      continue
    }

    const t = raw.trim()
    if (t === '') {
      flushBlock()
      continue
    }

    // headings
    const h = t.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      flushBlock()
      const level = h[1].length
      html.push(`<h${level}>${renderInline(h[2])}</h${level}>`)
      continue
    }
    // thematic break
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushBlock()
      html.push('<hr/>')
      continue
    }
    // blockquote
    if (t.startsWith('>')) {
      closeList()
      inQuote = true
      quoteBuf.push(renderInline(t.replace(/^>\s?/, '')))
      continue
    }
    // unordered list
    const ul = t.match(/^[-*+]\s+(.+)$/)
    if (ul) {
      closeQuote()
      if (!list || list.tag !== 'ul') {
        closeList()
        list = { tag: 'ul', items: [] }
      }
      list.items.push(renderInline(ul[1]))
      continue
    }
    // ordered list
    const ol = t.match(/^\d+[.)]\s+(.+)$/)
    if (ol) {
      closeQuote()
      if (!list || list.tag !== 'ol') {
        closeList()
        list = { tag: 'ol', items: [] }
      }
      list.items.push(renderInline(ol[1]))
      continue
    }

    flushBlock()
    html.push(`<p>${renderInline(t)}</p>`)
  }

  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  flushBlock()
  return html.join('\n')
}
