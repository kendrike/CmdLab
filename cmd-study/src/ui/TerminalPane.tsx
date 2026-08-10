import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ShellSession } from '../sim/shell/session'
import type { ExecuteOutcome } from '../sim/shell/session'
import type { CoachAdvice } from '../courses/errorCoach'
import type { CommandExplain, TableField } from '../courses/commandExplain'
import { X, ChevronDown, BookOpen } from 'lucide-react'

export const TERMINAL_THEMES: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#264f78',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
  light: {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: '#bfdfff',
    black: '#1f2328',
    red: '#cf222e',
    green: '#1a7f37',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#116329',
    brightYellow: '#4d2d00',
    brightBlue: '#218bff',
    brightMagenta: '#8250df',
    brightCyan: '#3192aa',
    brightWhite: '#6e7781',
  },
}

interface TerminalPaneProps {
  sessionRef: RefObject<ShellSession>
  theme: 'dark' | 'light'
  resetSignal: number
  mode: 'linux' | 'docker' | 'kubernetes'
  onExecute: (line: string) => ExecuteOutcome
  lastError: { line: string; advice: CoachAdvice } | null
  lastExplain: { line: string; explain: CommandExplain | null; fields: TableField[] | null } | null
  onDismissError: () => void
}

function ErrorCoachCard({ line, advice, onDismiss }: { line: string; advice: CoachAdvice; onDismiss: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="coach-card coach-error" data-testid="coach-error">
      <div className="coach-head">
        <button className="coach-clickable" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="coach-toggle">
          <span className="coach-title">⚠ 命令出错了 · 新手解释（点击展开）</span>
        </button>
        <button className="icon-btn" title="关闭" onClick={onDismiss} data-testid="coach-dismiss">
          <X size={14} />
        </button>
      </div>
      {open && (
        <div className="coach-body">
          <p className="coach-cmd">
            <code>{line}</code>
          </p>
          <p>
            <strong>发生了什么：</strong>
            {advice.summary}
          </p>
          <p>
            <strong>关键信息：</strong>
            <code>{advice.keyword}</code> —— {advice.cause}
          </p>
          <p>
            <strong>先检查：</strong>
          </p>
          <ul className="guide-list">
            {advice.checkFirst.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p>
            <strong>下一步：</strong>
            {advice.nextStep}
          </p>
          <p className="coach-note">终端里的红色文字是贴近真实的原始报错，这里给你翻译成新手语言。</p>
        </div>
      )}
    </div>
  )
}

function ExplainCard({ line, explain, fields }: { line: string; explain: CommandExplain | null; fields: TableField[] | null }) {
  const [open, setOpen] = useState(false)
  if (!explain && !fields) return null
  return (
    <div className="coach-card coach-explain" data-testid="coach-explain">
      <button className="coach-head coach-clickable" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="coach-title">
          <BookOpen size={13} /> 命令解析：<code>{line}</code>
        </span>
        <ChevronDown size={14} className={`guide-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="coach-body">
          {explain && (
            <>
              {explain.mnemonic && (
                <p>
                  <strong>名字记忆：</strong>
                  {explain.mnemonic}
                </p>
              )}
              {explain.args.length > 0 && (
                <>
                  <p>
                    <strong>逐段参数解释：</strong>
                  </p>
                  <ul className="guide-list">
                    {explain.args.map((a, i) => (
                      <li key={i}>
                        <code>{a.token}</code>
                        {a.isPlaceholder ? '（占位符）' : ''}：{a.meaning}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {explain.reads && (
                <p>
                  <strong>读取什么：</strong>
                  {explain.reads}
                </p>
              )}
              {explain.modifies && (
                <p>
                  <strong>修改什么：</strong>
                  {explain.modifies}
                </p>
              )}
              {explain.risk && (
                <p className="coach-risk">
                  <strong>风险提示：</strong>
                  {explain.risk}
                </p>
              )}
            </>
          )}
          {fields && (
            <>
              <p>
                <strong>输出字段解释：</strong>
              </p>
              <ul className="guide-list">
                {fields.map((f, i) => (
                  <li key={i}>
                    <code>{f.field}</code>：{f.meaning}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function TerminalPane({ sessionRef, theme, resetSignal, mode, onExecute, lastError, lastExplain, onDismissError }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const lineRef = useRef('')
  const cursorRef = useRef(0)
  const historyIndexRef = useRef(-1)
  const bannerSignalRef = useRef(-1)

  const currentLine = () => lineRef.current

  const promptText = () => {
    const s = sessionRef.current?.state
    if (!s) return '\x1b[32mstudent@lab\x1b[0m:\x1b[34m~\x1b[0m$ '
    const home = s.env['HOME'] ?? '/home/student'
    const disp = s.cwd === home ? '~' : s.cwd.startsWith(home + '/') ? '~' + s.cwd.slice(home.length) : s.cwd
    return `\x1b[32mstudent@lab\x1b[0m:\x1b[34m${disp}\x1b[0m$ `
  }

  const redrawLine = () => {
    const term = termRef.current
    if (!term) return
    const line = lineRef.current
    term.write('\r\x1b[2K')
    term.write(promptText())
    term.write(line)
    const back = line.length - cursorRef.current
    if (back > 0) term.write(`\x1b[${back}D`)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.35,
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      scrollback: 5000,
      theme: TERMINAL_THEMES[theme],
      convertEol: true,
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      // container not laid out yet
    }
    termRef.current = term

    const prompt = () => {
      term.write('\r' + promptText())
    }

    const banner = () => {
      term.write('\r\x1b[2J\x1b[H')
      term.writeln('\x1b[36mCmdLab 终端模拟器\x1b[0m  — 纯浏览器环境，不执行任何真实命令')
      term.writeln('输入 \x1b[33mhelp\x1b[0m 查看可用命令，输入 \x1b[33mman <命令>\x1b[0m 查看手册')
      term.writeln('')
    }

    const printHistory = () => {
      const s = sessionRef.current?.state
      if (s && s.history.length > 0) {
        const last = s.history[s.history.length - 1]
        term.writeln(`\r\x1b[90m↑ 历史: ${last}\x1b[0m`)
      }
    }

    const showCandidates = (cands: string[]) => {
      term.writeln('')
      term.writeln(cands.join('  '))
      redrawLine()
    }

    const historyNavigate = (dir: 1 | -1) => {
      const s = sessionRef.current
      if (!s || s.state.history.length === 0) return
      const hist = s.state.history
      if (historyIndexRef.current === -1) historyIndexRef.current = hist.length
      historyIndexRef.current = Math.min(hist.length, Math.max(0, historyIndexRef.current + dir))
      const prev = historyIndexRef.current >= hist.length ? '' : hist[historyIndexRef.current]
      if (historyIndexRef.current >= hist.length) historyIndexRef.current = -1
      lineRef.current = prev
      cursorRef.current = prev.length
      redrawLine()
    }

    const handleData = (data: string) => {
      const term = termRef.current
      if (!term) return
      if (data === '\x1b[A' || data === '\x1bOA') {
        historyNavigate(-1)
        return
      }
      if (data === '\x1b[B' || data === '\x1bOB') {
        historyNavigate(1)
        return
      }
      if (data === '\x1b[D' || data === '\x1bOD') {
        if (cursorRef.current > 0) {
          cursorRef.current -= 1
          term.write('\b')
        }
        return
      }
      if (data === '\x1b[C' || data === '\x1bOC') {
        const line = lineRef.current
        if (cursorRef.current < line.length) {
          term.write(line[cursorRef.current])
          cursorRef.current += 1
        }
        return
      }
      if (data === '\x1b[H' || data === '\x1b[1~' || data === '\x1bOH') {
        if (cursorRef.current !== 0) {
          cursorRef.current = 0
          term.write('\r')
        }
        return
      }
      if (data === '\x1b[F' || data === '\x1b[4~' || data === '\x1bOF') {
        if (cursorRef.current !== lineRef.current.length) {
          cursorRef.current = lineRef.current.length
          redrawLine()
        }
        return
      }
      if (data === '\x1b[3~') {
        const line = lineRef.current
        if (cursorRef.current < line.length) {
          lineRef.current = line.slice(0, cursorRef.current) + line.slice(cursorRef.current + 1)
          redrawLine()
        }
        return
      }
      if (data.startsWith('\x1b')) {
        return
      }
      for (const ch of data) {
        if (ch === '\r') {
          const line = currentLine()
          term.writeln('')
          lineRef.current = ''
          cursorRef.current = 0
          historyIndexRef.current = -1
          const s = sessionRef.current
          if (!s) return
          const outcome = onExecute(line)
          if (outcome.needsMoreInput) {
            term.write('\x1b[33m> \x1b[0m')
            continue
          }
          if (outcome.stdout) term.write(outcome.stdout)
          if (outcome.stderr) term.write('\x1b[31m' + outcome.stderr + '\x1b[0m')
          const outEndsNewline = outcome.stdout === '' || outcome.stdout.endsWith('\n')
          const errEndsNewline = outcome.stderr === '' || outcome.stderr.endsWith('\n')
          if (!(outEndsNewline && errEndsNewline)) term.write('\r\n')
          printHistory()
          prompt()
          continue
        }
        if (ch === '\x7f') {
          const line = lineRef.current
          if (line.length === 0 || cursorRef.current === 0) continue
          lineRef.current = line.slice(0, cursorRef.current - 1) + line.slice(cursorRef.current)
          cursorRef.current -= 1
          redrawLine()
          continue
        }
        if (ch === '\x03') {
          lineRef.current = ''
          cursorRef.current = 0
          historyIndexRef.current = -1
          sessionRef.current?.cancelPending()
          term.write('^C\r\n')
          prompt()
          continue
        }
        if (ch === '\x0c') {
          term.clear()
          redrawLine()
          continue
        }
        if (ch === '\t') {
          const s = sessionRef.current
          if (!s) continue
          const res = s.complete(currentLine())
          if (res.completion !== null) {
            lineRef.current += res.completion
            cursorRef.current = lineRef.current.length
            term.write(res.completion)
          } else if (res.candidates.length > 1) {
            showCandidates(res.candidates)
          }
          continue
        }
        if (cursorRef.current === lineRef.current.length) {
          lineRef.current += ch
          cursorRef.current += 1
          term.write(ch)
        } else {
          const line = lineRef.current
          lineRef.current = line.slice(0, cursorRef.current) + ch + line.slice(cursorRef.current)
          cursorRef.current += 1
          redrawLine()
        }
      }
    }

    const onDataDisposable = term.onData(handleData)
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // ignore
      }
    })
    ro.observe(container)

    const s = sessionRef.current
    void s
    banner()
    prompt()
    bannerSignalRef.current = resetSignal

    term.focus()

    return () => {
      onDataDisposable.dispose()
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (bannerSignalRef.current === resetSignal) return
    bannerSignalRef.current = resetSignal
    lineRef.current = ''
    cursorRef.current = 0
    historyIndexRef.current = -1
    term.clear()
    term.writeln('\x1b[36mCmdLab 终端模拟器\x1b[0m  — 纯浏览器环境，不执行任何真实命令')
    term.writeln('输入 \x1b[33mhelp\x1b[0m 查看可用命令，输入 \x1b[33mman <命令>\x1b[0m 查看手册')
    term.writeln('')
    redrawLine()
    term.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  const copyOutput = async () => {
    const term = termRef.current
    if (!term) return
    let text = ''
    for (let i = 0; i < term.buffer.active.length; i++) {
      const line = term.buffer.active.getLine(i)
      if (line) text += line.translateToString(true) + '\n'
    }
    try {
      await navigator.clipboard.writeText(text.trim())
    } catch {
      // clipboard unavailable
    }
  }

  const clearTerminal = () => {
    const term = termRef.current
    if (!term) return
    term.clear()
    redrawLine()
    term.focus()
  }

  return (
    <div className="terminal-wrap">
      <div className="terminal-toolbar">
        <span className="terminal-mode" data-testid="terminal-mode">
          {mode === 'linux' ? 'Linux' : mode === 'docker' ? 'Docker' : 'Kubernetes'}
        </span>
        <div className="terminal-actions">
          <button className="icon-btn" title="复制输出" onClick={copyOutput} data-testid="copy-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button className="icon-btn" title="清空终端 (Ctrl+L)" onClick={clearTerminal} data-testid="clear-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l18 18M21 3L3 21" />
            </svg>
          </button>
        </div>
      </div>
      <div className="terminal-host">
        <div className="terminal-anchor" ref={containerRef} data-testid="terminal" />
      </div>
      {lastError && <ErrorCoachCard line={lastError.line} advice={lastError.advice} onDismiss={onDismissError} />}
      {lastExplain && <ExplainCard line={lastExplain.line} explain={lastExplain.explain} fields={lastExplain.fields} />}
    </div>
  )
}
