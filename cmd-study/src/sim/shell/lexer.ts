export interface Token {
  type: 'word' | 'pipe' | 'out' | 'append' | 'in' | 'heredoc' | 'errout' | 'errappend'
  value: string
  glob: boolean
}

export interface ParsedCommand {
  args: string[]
  argGlob: boolean[]
  redirectOut: { append: boolean; target: string } | null
  redirectErr: { append: boolean; target: string } | null
  redirectIn: string | null
  stdinHeredoc: string | null
}

export interface ParsedPipeline {
  commands: ParsedCommand[]
}

export interface ParseResult {
  pipelines: ParsedPipeline[]
  incomplete: boolean
}

function freshCommand(): ParsedCommand {
  return { args: [], argGlob: [], redirectOut: null, redirectErr: null, redirectIn: null, stdinHeredoc: null }
}

function readDollar(text: string, i: number, env: Record<string, string>): { value: string; nextIndex: number } {
  const n = text.length
  if (text[i + 1] === '{') {
    const j = text.indexOf('}', i + 2)
    if (j === -1) return { value: '', nextIndex: n }
    const name = text.slice(i + 2, j)
    return { value: env[name] ?? '', nextIndex: j + 1 }
  }
  const m = /[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i + 1))
  if (!m) return { value: '$', nextIndex: i + 1 }
  return { value: env[m[0]] ?? '', nextIndex: i + 1 + m[0].length }
}

interface WordResult {
  token: Token
  nextIndex: number
  complete: boolean
}

function readWord(text: string, i: number, env: Record<string, string>): WordResult {
  let value = ''
  let glob = true
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '|' || c === ';' || c === '>' || c === '<') break
    if (c === '\\') {
      glob = false
      const nx = text[i + 1]
      if (nx !== undefined) {
        value += nx
        i += 2
      } else {
        value += '\\'
        i++
      }
      continue
    }
    if (c === "'") {
      glob = false
      let j = i + 1
      while (j < n && text[j] !== "'") {
        value += text[j]
        j++
      }
      if (j >= n) return { token: { type: 'word', value, glob }, nextIndex: n, complete: false }
      i = j + 1
      continue
    }
    if (c === '"') {
      glob = false
      let j = i + 1
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\' && (text[j + 1] === '"' || text[j + 1] === '\\' || text[j + 1] === '$')) {
          value += text[j + 1]
          j += 2
        } else if (text[j] === '$') {
          const r = readDollar(text, j, env)
          value += r.value
          j = r.nextIndex
        } else {
          value += text[j]
          j++
        }
      }
      if (j >= n) return { token: { type: 'word', value, glob }, nextIndex: n, complete: false }
      i = j + 1
      continue
    }
    if (c === '$') {
      const r = readDollar(text, i, env)
      value += r.value
      i = r.nextIndex
      continue
    }
    if (c === '~' && value === '') {
      value += env['HOME'] ?? '/home/student'
      i++
      continue
    }
    value += c
    i++
  }
  return { token: { type: 'word', value, glob }, nextIndex: i, complete: true }
}

function readHeredoc(text: string, from: number): { found: boolean; content: string; nextIndex: number } {
  const n = text.length
  let j = from
  while (j < n && (text[j] === ' ' || text[j] === '\t')) j++
  let delim = ''
  while (j < n && !' \t\n;|><'.includes(text[j])) {
    delim += text[j]
    j++
  }
  if (!delim) return { found: false, content: '', nextIndex: from }
  if ((delim.startsWith("'") && delim.endsWith("'")) || (delim.startsWith('"') && delim.endsWith('"'))) {
    delim = delim.slice(1, -1)
  }
  while (j < n && text[j] !== '\n') j++
  if (j >= n) return { found: false, content: '', nextIndex: from }
  j++
  let content = ''
  while (j < n) {
    const lineEnd = text.indexOf('\n', j)
    const end = lineEnd === -1 ? n : lineEnd
    const line = text.slice(j, end)
    if (line.replace(/\r$/, '').trimEnd() === delim) {
      return { found: true, content, nextIndex: end < n ? end + 1 : n }
    }
    content += line + '\n'
    if (end >= n) break
    j = end + 1
  }
  return { found: false, content, nextIndex: n }
}

export function parseInput(text: string, env: Record<string, string>): ParseResult {
  const tokens: Token[] = []
  let incomplete = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === '\n' || c === ' ' || c === '\t' || c === ';') {
      i++
      continue
    }
    if (c === '#') {
      while (i < n && text[i] !== '\n') i++
      continue
    }
    if (c === '|') {
      tokens.push({ type: 'pipe', value: '|', glob: false })
      i++
      continue
    }
    if (c === '>') {
      if (text[i + 1] === '>') {
        tokens.push({ type: 'append', value: '>>', glob: false })
        i += 2
      } else {
        tokens.push({ type: 'out', value: '>', glob: false })
        i++
      }
      continue
    }
    if (c === '2' && text[i + 1] === '>') {
      if (text[i + 2] === '>') {
        tokens.push({ type: 'errappend', value: '2>>', glob: false })
        i += 3
      } else {
        tokens.push({ type: 'errout', value: '2>', glob: false })
        i += 2
      }
      continue
    }
    if (c === '<') {
      if (text[i + 1] === '<') {
        const res = readHeredoc(text, i + 2)
        if (!res.found) {
          incomplete = true
          break
        }
        tokens.push({ type: 'heredoc', value: res.content, glob: false })
        i = res.nextIndex
      } else {
        tokens.push({ type: 'in', value: '<', glob: false })
        i++
      }
      continue
    }
    const w = readWord(text, i, env)
    tokens.push(w.token)
    i = w.nextIndex
    if (!w.complete) {
      incomplete = true
      break
    }
  }

  const pipelines: ParsedPipeline[] = []
  let curCmd = freshCommand()
  let curPipe: ParsedPipeline = { commands: [curCmd] }
  let meaningful = false
  let lastWasPipe = false

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (t.type === 'pipe') {
      curPipe.commands.push((curCmd = freshCommand()))
      lastWasPipe = true
      continue
    }
    lastWasPipe = false
    meaningful = true
    if (t.type === 'word') {
      curCmd.args.push(t.value)
      curCmd.argGlob.push(t.glob)
    } else if (t.type === 'out' || t.type === 'append') {
      const nxt = tokens[k + 1]
      if (nxt && nxt.type === 'word') {
        curCmd.redirectOut = { append: t.type === 'append', target: nxt.value }
        k++
      }
    } else if (t.type === 'errout' || t.type === 'errappend') {
      const nxt = tokens[k + 1]
      if (nxt && nxt.type === 'word') {
        curCmd.redirectErr = { append: t.type === 'errappend', target: nxt.value }
        k++
      }
    } else if (t.type === 'in') {
      const nxt = tokens[k + 1]
      if (nxt && nxt.type === 'word') {
        curCmd.redirectIn = nxt.value
        k++
      }
    } else if (t.type === 'heredoc') {
      curCmd.stdinHeredoc = t.value
    }
  }

  if (meaningful && !lastWasPipe) {
    if (curPipe.commands.length > 0) pipelines.push(curPipe)
  }
  if (lastWasPipe) incomplete = true

  return { pipelines, incomplete }
}
