import type { CommandResult, FsNode, SimState } from '../types'
import {
  canExec,
  canRead,
  canWrite,
  formatMtime,
  groupName,
  humanSize,
  modeString,
  userName,
  UID_ROOT,
  USERS,
} from '../vfs/access'
import { basenameOf, getParent, globRegex, normalizePath, parentOf, segmentsOf, walk } from '../vfs/paths'
import { MAN_PAGES } from './manpages'
import { err, ok, registerMany } from '../shell/registry'
import {
  SERVICE_DEFS,
  activePorts,
  addService,
  collectFileList,
  findServiceEntry,
  serviceNames,
  servicePid,
} from './services'
import { formatTable } from '../table'

function home(state: SimState): string {
  return state.env['HOME'] ?? '/home/student'
}

function nodeOrError(state: SimState, input: string): { node?: FsNode; error?: string; abs?: string } {
  const abs = normalizePath(state.cwd, input, home(state))
  const node = walk(state.fsRoot, abs)
  if (!node) return { error: `No such file or directory`, abs }
  if (!canRead(node, state.uid, state.gids)) return { error: `Permission denied`, abs, node }
  return { node, abs }
}

function sortedEntries(node: FsNode): { name: string; child: FsNode }[] {
  if (!node.children) return []
  return Object.keys(node.children)
    .sort()
    .map((name) => ({ name, child: node.children![name] }))
}

function writeLsEntries(
  entries: { name: string; child: FsNode }[],
  showHidden: boolean,
  long: boolean,
  human: boolean,
  state: SimState,
  markDirs = false,
): string {
  const list = showHidden ? entries : entries.filter((e) => !e.name.startsWith('.'))
  if (!long) {
    return (
      list
        .map((e) => (markDirs && e.child.kind === 'dir' ? e.name + '/' : e.name))
        .join('  ') + (list.length ? '\n' : '')
    )
  }
  const totalBytes = list.reduce((s, e) => s + Math.max(1, e.child.content.length), 0)
  const dirCount = list.filter((e) => e.child.kind === 'dir').length
  const total = Math.max(1, Math.ceil(totalBytes / 512) + dirCount * 8)
  const lines = list.map((e) => {
    const c = e.child
    const size = human ? humanSize(c.content.length) : String(c.content.length)
    const user = userName(c.uid)
    const grp = groupName(c.gid)
    const time = formatMtime(c.mtime, state.clock)
    return `${modeString(c)} ${String(c.uid === 0 ? 1 : 1).padStart(2)} ${user.padEnd(8)} ${grp.padEnd(8)} ${size.padStart(8)} ${time} ${e.name}`
  })
  return `total ${total}\n` + lines.join('\n') + (lines.length ? '\n' : '')
}

function parseFlags(args: string[], valid: string[]): { flags: Set<string>; rest: string[]; error?: string } {
  const flags = new Set<string>()
  const rest: string[] = []
  for (const a of args) {
    if (a.startsWith('-') && a.length > 1) {
      const body = a.slice(1)
      if (body === '-' ) {
        rest.push(a)
        continue
      }
      for (const ch of body) {
        if (!valid.includes(ch)) return { flags, rest, error: `invalid option -- '${ch}'` }
        flags.add(ch)
      }
    } else {
      rest.push(a)
    }
  }
  return { flags, rest }
}

function registerLinuxCommands(): void {
  registerMany([
    [
      'ls',
      (ctx) => {
        const { flags, rest, error } = parseFlags(ctx.args.slice(1), ['a', 'A', 'l', 'h', 'd', 'C', 'F', 'R'])
        if (error) return err(`ls: ${error}\nTry 'ls --help' for more information.`, 2)
        const paths = rest.length ? rest : ['.']
        const long = flags.has('l')
        const hidden = flags.has('a') || flags.has('A')
        const human = flags.has('h')
        const out: string[] = []
        const errOut: string[] = []
        let hadError = false
        const showHeaders = paths.length > 1
        for (const p of paths) {
          const r = nodeOrError(ctx.state, p)
          if (r.error) {
            hadError = true
            errOut.push(`ls: cannot access '${p}': ${r.error}`)
            continue
          }
          if (showHeaders) out.push(`${p}:`)
          const node = r.node!
          if (node.kind === 'dir') {
            if (flags.has('d')) {
              out.push(node.name + '/')
            } else if (flags.has('R')) {
              const recursive = (dir: FsNode, path: string): string[] => {
                const lines: string[] = [
                  path + ':',
                  writeLsEntries(sortedEntries(dir), hidden, long, human, ctx.state, flags.has('F')).replace(/\n$/, ''),
                ]
                for (const { name, child } of sortedEntries(dir)) {
                  if (child.kind === 'dir') lines.push('', ...recursive(child, `${path}/${name}`))
                }
                return lines
              }
              out.push(recursive(node, p === '.' ? '.' : p.replace(/\/$/, '')).join('\n'))
            } else {
              out.push(writeLsEntries(sortedEntries(node), hidden, long, human, ctx.state, flags.has('F')).replace(/\n$/, ''))
            }
          } else {
            if (long) {
              out.push(
                `${modeString(node)} ${String(1).padStart(2)} ${userName(node.uid).padEnd(8)} ${groupName(node.gid).padEnd(8)} ${(human ? humanSize(node.content.length) : String(node.content.length)).padStart(8)} ${formatMtime(node.mtime, ctx.state.clock)} ${basenameOf(p)}`,
              )
            } else {
              out.push(basenameOf(p))
            }
          }
        }
        return {
          stdout: out.length ? out.join('\n') + '\n' : '',
          stderr: errOut.length ? errOut.join('\n') + '\n' : '',
          exitCode: hadError ? 2 : 0,
        }
      },
    ],
    [
      'mkdir',
      (ctx) => {
        const { flags, rest, error } = parseFlags(ctx.args.slice(1), ['p'])
        if (error) return err(`mkdir: ${error}\nTry 'mkdir --help' for more information.`, 2)
        if (rest.length === 0) return err(`mkdir: missing operand\nTry 'mkdir --help' for more information.`, 1)
        const out: string[] = []
        for (const p of rest) {
          const abs = normalizePath(ctx.state.cwd, p, home(ctx.state))
          const existing = walk(ctx.state.fsRoot, abs)
          if (existing) {
            if (!flags.has('p')) out.push(`mkdir: cannot create directory '${p}': File exists`)
            continue
          }
          const parts = segmentsOf(abs)
          let node: FsNode = ctx.state.fsRoot
          let created = false
          for (let i = 0; i < parts.length; i++) {
            const seg = parts[i]
            if (!node.children) break
            const child = node.children[seg]
            if (child) {
              if (child.kind !== 'dir') {
                out.push(`mkdir: cannot create directory '${p}': Not a directory`)
                created = false
                break
              }
              node = child
              continue
            }
            if (!flags.has('p') && i !== parts.length - 1) {
              out.push(`mkdir: cannot create directory '${p}': No such file or directory`)
              created = false
              break
            }
            if (!canWrite(node, ctx.state.uid, ctx.state.gids)) {
              out.push(`mkdir: cannot create directory '${p}': Permission denied`)
              created = false
              break
            }
            node.children[seg] = {
              kind: 'dir',
              name: seg,
              content: '',
              mode: 0o755,
              uid: ctx.state.uid,
              gid: ctx.state.gids[0] ?? ctx.state.uid,
              mtime: ctx.state.clock,
              children: {},
            }
            created = true
            node = node.children[seg]
          }
          void created
        }
        return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: out.length ? 1 : 0 }
      },
    ],
    [
      'touch',
      (ctx) => {
        const { rest, error } = parseFlags(ctx.args.slice(1), [])
        if (error) return err(`touch: ${error}\nTry 'touch --help' for more information.`, 2)
        if (rest.length === 0) return err(`touch: missing file operand\nTry 'touch --help' for more information.`, 1)
        const out: string[] = []
        for (const p of rest) {
          const abs = normalizePath(ctx.state.cwd, p, home(ctx.state))
          const par = getParent(ctx.state.fsRoot, abs)
          const existing = walk(ctx.state.fsRoot, abs)
          if (existing) {
            existing.mtime = ctx.state.clock
            continue
          }
          if (!par) {
            out.push(`touch: cannot touch '${p}': No such file or directory`)
            continue
          }
          if (!canWrite(par.parent, ctx.state.uid, ctx.state.gids)) {
            out.push(`touch: cannot touch '${p}': Permission denied`)
            continue
          }
          par.parent.children![par.name] = {
            kind: 'file',
            name: par.name,
            content: '',
            mode: 0o644,
            uid: ctx.state.uid,
            gid: ctx.state.gids[0] ?? ctx.state.uid,
            mtime: ctx.state.clock,
          }
        }
        return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: out.length ? 1 : 0 }
      },
    ],
    [
      'cp',
      (ctx) => {
        const { flags, rest, error } = parseFlags(ctx.args.slice(1), ['r', 'R', 'i', 'f'])
        if (error) return err(`cp: ${error}\nTry 'cp --help' for more information.`, 2)
        if (rest.length < 2) return err(`cp: missing file operand\nTry 'cp --help' for more information.`, 1)
        const recursive = flags.has('r') || flags.has('R')
        const sources = rest.slice(0, -1)
        const destInput = rest[rest.length - 1]
        const destAbs = normalizePath(ctx.state.cwd, destInput, home(ctx.state))
        const destNode = walk(ctx.state.fsRoot, destAbs)
        const destIsDir = !!destNode && destNode.kind === 'dir'
        const out: string[] = []
        let failed = false

        for (const src of sources) {
          const r = nodeOrError(ctx.state, src)
          if (r.error) {
            out.push(`cp: cannot stat '${src}': ${r.error}`)
            failed = true
            continue
          }
          const node = r.node!
          const target = destIsDir
            ? destAbs + '/' + basenameOf(normalizePath(ctx.state.cwd, src, home(ctx.state)))
            : destAbs
          if (node.kind === 'dir') {
            if (!recursive) {
              out.push(`cp: -r not specified; omitting directory '${src}'`)
              failed = true
              continue
            }
            const t = getParent(ctx.state.fsRoot, target)
            if (!t) {
              out.push(`cp: cannot create '${destInput}': No such file or directory`)
              failed = true
              continue
            }
            if (!canWrite(t.parent, ctx.state.uid, ctx.state.gids)) {
              out.push(`cp: cannot create '${destInput}': Permission denied`)
              failed = true
              continue
            }
            t.parent.children![t.name] = cloneTree(node, t.name)
          } else {
            if (!canRead(node, ctx.state.uid, ctx.state.gids)) {
              out.push(`cp: cannot open '${src}' for reading: Permission denied`)
              failed = true
              continue
            }
            const t = getParent(ctx.state.fsRoot, target)
            if (!t) {
              out.push(`cp: cannot create '${target}': No such file or directory`)
              failed = true
              continue
            }
            if (!canWrite(t.parent, ctx.state.uid, ctx.state.gids)) {
              out.push(`cp: cannot create '${target}': Permission denied`)
              failed = true
              continue
            }
            const copy: FsNode = {
              kind: 'file',
              name: t.name,
              content: node.content,
              mode: node.mode,
              uid: ctx.state.uid,
              gid: ctx.state.gids[0] ?? ctx.state.uid,
              mtime: ctx.state.clock,
            }
            t.parent.children![t.name] = copy
          }
        }
        return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: failed ? 1 : 0 }
      },
    ],
    [
      'mv',
      (ctx) => {
        const { rest, error } = parseFlags(ctx.args.slice(1), ['i', 'f'])
        if (error) return err(`mv: ${error}\nTry 'mv --help' for more information.`, 2)
        if (rest.length < 2) return err(`mv: missing file operand\nTry 'mv --help' for more information.`, 1)
        const sources = rest.slice(0, -1)
        const destInput = rest[rest.length - 1]
        const destAbs = normalizePath(ctx.state.cwd, destInput, home(ctx.state))
        const destNode = walk(ctx.state.fsRoot, destAbs)
        const destIsDir = !!destNode && destNode.kind === 'dir'
        const out: string[] = []
        let failed = false
        for (const src of sources) {
          const abs = normalizePath(ctx.state.cwd, src, home(ctx.state))
          const r = nodeOrError(ctx.state, src)
          if (r.error) {
            out.push(`mv: cannot stat '${src}': ${r.error}`)
            failed = true
            continue
          }
          const target = destIsDir ? destAbs + '/' + basenameOf(abs) : destAbs
          if (target === abs) {
            out.push(`mv: '${src}' and '${destInput}' are the same file`)
            failed = true
            continue
          }
          const srcPar = getParent(ctx.state.fsRoot, abs)
          const dstPar = getParent(ctx.state.fsRoot, target)
          if (!srcPar || !dstPar) {
            out.push(`mv: cannot move '${src}' to '${destInput}': No such file or directory`)
            failed = true
            continue
          }
          if (!canWrite(srcPar.parent, ctx.state.uid, ctx.state.gids) || !canWrite(dstPar.parent, ctx.state.uid, ctx.state.gids)) {
            out.push(`mv: cannot move '${src}' to '${destInput}': Permission denied`)
            failed = true
            continue
          }
          const node = srcPar.parent.children![srcPar.name]
          const existing = dstPar.parent.children![dstPar.name]
          if (existing && existing.kind === 'dir' && node.kind !== 'dir') {
            out.push(`mv: cannot overwrite directory '${destInput}' with non-directory`)
            failed = true
            continue
          }
          delete srcPar.parent.children![srcPar.name]
          node.name = dstPar.name
          node.mtime = ctx.state.clock
          dstPar.parent.children![dstPar.name] = node
        }
        return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: failed ? 1 : 0 }
      },
    ],
    [
      'rm',
      (ctx) => {
        const { flags, rest, error } = parseFlags(ctx.args.slice(1), ['r', 'R', 'f', 'i'])
        if (error) return err(`rm: ${error}\nTry 'rm --help' for more information.`, 2)
        if (rest.length === 0) {
          if (flags.has('f')) return ok()
          return err(`rm: missing operand\nTry 'rm --help' for more information.`, 1)
        }
        const recursive = flags.has('r') || flags.has('R')
        const force = flags.has('f')
        const out: string[] = []
        let failed = false
        for (const p of rest) {
          const abs = normalizePath(ctx.state.cwd, p, home(ctx.state))
          if (abs === '/') {
            if (recursive && force) {
              out.push(`rm: it is dangerous to operate recursively on '/'`)
              out.push(`rm: use --no-preserve-root to override this failsafe`)
            } else {
              out.push(`rm: cannot remove '/': Operation not permitted`)
            }
            failed = true
            continue
          }
          const par = getParent(ctx.state.fsRoot, abs)
          if (!par || !(par.name in par.parent.children!)) {
            if (!force) {
              out.push(`rm: cannot remove '${p}': No such file or directory`)
              failed = true
            }
            continue
          }
          const node = par.parent.children![par.name]
          if (node.kind === 'dir' && !recursive) {
            out.push(`rm: cannot remove '${p}': Is a directory`)
            failed = true
            continue
          }
          if (!canWrite(par.parent, ctx.state.uid, ctx.state.gids)) {
            out.push(`rm: cannot remove '${p}': Permission denied`)
            failed = true
            continue
          }
          delete par.parent.children![par.name]
        }
        return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: failed ? 1 : 0 }
      },
    ],
    [
      'cat',
      (ctx) => {
        const { rest, error } = parseFlags(ctx.args.slice(1), ['n'])
        if (error) return err(`cat: ${error}\nTry 'cat --help' for more information.`, 2)
        if (rest.length === 0) {
          if (ctx.stdin === null) {
            return err(`cat: 缺少文件参数（模拟器提示：请写成 cat 文件，或通过管道传入内容）`, 2)
          }
          return ok(ctx.stdin ?? '')
        }
        const out: string[] = []
        const errOut: string[] = []
        let failed = false
        for (const p of rest) {
          const r = nodeOrError(ctx.state, p)
          if (r.error) {
            errOut.push(`cat: ${p}: ${r.error}`)
            failed = true
            continue
          }
          const node = r.node!
          if (node.kind === 'dir') {
            errOut.push(`cat: ${p}: Is a directory`)
            failed = true
            continue
          }
          out.push(node.content)
        }
        return { stdout: out.join(''), stderr: errOut.join('\n') + (errOut.length ? '\n' : ''), exitCode: failed ? 1 : 0 }
      },
    ],
    ['head', headOrTail('head', true)],
    ['tail', headOrTail('tail', false)],
    ['grep', grepHandler],
    ['find', findHandler],
    ['wc', wcHandler],
    ['sort', sortHandler],
    ['uniq', uniqHandler],
    ['cut', cutHandler],
    ['chmod', chmodHandler],
    ['chown', chownHandler],
    ['env', envHandler],
    ['top', topHandler],
    ['gzip', gzipHandler],
    ['gunzip', gzipHandler],
    ['tar', tarHandler],
    ['ping', pingHandler],
    ['curl', curlHandler],
    ['ss', ssHandler],
    ['systemctl', systemctlHandler],
    [
      'whoami',
      (ctx) => ok(userName(ctx.state.uid) + '\n'),
    ],
    [
      'id',
      () => ok('uid=1000(student) gid=1000(student) groups=1000(student),27(sudo)\n'),
    ],
    [
      'ps',
      (ctx) => {
        const table = formatTable(
          [
            { name: 'PID', align: 'right' },
            { name: 'TTY', align: 'left' },
            { name: 'TIME', align: 'right' },
            { name: 'CMD', flex: true },
          ],
          ctx.state.procs.map((p) => [String(p.pid), p.tty, p.time, p.cmd]),
        )
        return ok(table + '\n')
      },
    ],
    [
      'kill',
      (ctx) => {
        let sig = 'TERM'
        let args = ctx.args.slice(1)
        if (args[0] && /^-\d+$/.test(args[0])) {
          sig = args[0]
          args = args.slice(1)
        } else if (args[0] && /^-(SIG\w+|\w+)$/.test(args[0])) {
          sig = args[0].slice(1)
          args = args.slice(1)
        }
        if (args.length === 0) return err(`kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]`)
        const out: string[] = []
        for (const a of args) {
          const pid = Number(a)
          if (!Number.isInteger(pid)) {
            out.push(`kill: ${a}: arguments must be process or job IDs`)
            continue
          }
          const idx = ctx.state.procs.findIndex((p) => p.pid === pid)
          if (idx === -1) {
            out.push(`bash: kill: (${pid}) - No such process`)
            continue
          }
          if (pid === 1234) {
            out.push(`bash: kill: (${pid}) - Operation not permitted`)
            continue
          }
          const proc = ctx.state.procs[idx]
          ctx.state.procs.splice(idx, 1)
          out.push(`[1]+  Killed            ${proc.cmd}`)
        }
        return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '', exitCode: 0 }
      },
    ],
    [
      'man',
      (ctx) => {
        const name = ctx.args[1]
        if (!name) return err(`What manual page do you want?\nFor example, try 'man man'.`, 1)
        const page = MAN_PAGES[name]
        if (!page) return err(`No manual entry for ${name}`, 1)
        return ok(page)
      },
    ],
    [
      'help',
      () => ok(MAN_PAGES['help_all']),
    ],
  ])
}

function cloneTree(node: FsNode, name: string): FsNode {
  const copy: FsNode = { ...node, name }
  if (node.children) {
    const children: Record<string, FsNode> = {}
    for (const k of Object.keys(node.children)) {
      children[k] = cloneTree(node.children[k], k)
    }
    copy.children = children
  }
  return copy
}

function headOrTail(name: string, isHead: boolean) {
  return (ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult => {
    const flags: string[] = []
    const rest: string[] = []
    let n = 10
    let follow = false
    for (let i = 1; i < ctx.args.length; i++) {
      const a = ctx.args[i]
      if (a === '-n' || a === '--lines') {
        const v = ctx.args[i + 1]
        if (v === undefined) return err(`${name}: option requires an argument -- 'n'`, 2)
        const parsed = Number(v)
        if (!Number.isInteger(parsed)) return err(`${name}: invalid number of lines: '${v}'`, 1)
        n = parsed
        i++
      } else if (/^-\d+$/.test(a)) {
        n = Number(a.slice(1))
      } else if (a.startsWith('--lines=')) {
        const parsed = Number(a.slice(8))
        if (!Number.isInteger(parsed)) return err(`${name}: invalid number of lines: '${a.slice(8)}'`, 1)
        n = parsed
      } else if (a === '-f' || a === '--follow') {
        follow = true
      } else if (a.startsWith('-')) {
        flags.push(a)
      } else {
        rest.push(a)
      }
    }
    void flags
    const take = (text: string) => {
      const lines = text.split('\n')
      const picked = isHead ? lines.slice(0, Math.max(0, n)) : lines.slice(Math.max(0, lines.length - Math.max(0, n)))
      return picked.join('\n') + (picked.length ? '\n' : '')
    }
    if (rest.length === 0) {
      if (ctx.stdin === null) {
        return err(`${name}: 缺少文件参数（模拟器提示：请写成 ${name} [选项] 文件，或通过管道传入内容）`, 2)
      }
      return ok(take(ctx.stdin ?? ''))
    }
    const out: string[] = []
    const errOut: string[] = []
    for (const p of rest) {
      const r = nodeOrError(ctx.state, p)
      if (r.error) {
        errOut.push(`${name}: ${p}: ${r.error}`)
        continue
      }
      const node = r.node!
      if (node.kind === 'dir') {
        errOut.push(`${name}: ${p}: Is a directory`)
        continue
      }
      if (rest.length > 1) out.push(`==> ${p} <==`)
      out.push(take(node.content).replace(/\n$/, ''))
    }
    let result = out.join('\n') + (out.length ? '\n' : '')
    if (follow && !isHead) {
      result += `\x1b[90m（tail -f 模拟模式：以上是当前末尾内容。真实系统中 tail -f 会持续跟随新增的行，直到按 Ctrl+C 退出。）\x1b[0m\n`
    }
    return { stdout: result, stderr: errOut.join('\n') + (errOut.length ? '\n' : ''), exitCode: errOut.length ? 1 : 0 }
  }
}

function grepHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  const flags = new Set<string>()
  const rest: string[] = []
  for (const a of ctx.args.slice(1)) {
    if (a.startsWith('-') && a.length > 1 && !a.startsWith('--')) {
      for (const ch of a.slice(1)) {
        if (!'inrcvws'.includes(ch)) return err(`grep: invalid option -- '${ch}'\nUsage: grep [OPTION]... PATTERN [FILE]...`, 2)
        flags.add(ch)
      }
    } else {
      rest.push(a)
    }
  }
  if (rest.length === 0) return err(`grep: missing pattern\nUsage: grep [OPTION]... PATTERN [FILE]...`, 2)
  const pattern = rest[0]
  const files = rest.slice(1)
  let regex: RegExp
  try {
    const core = flags.has('w') ? `\\b(?:${pattern})\\b` : pattern
    regex = new RegExp(core, flags.has('i') ? 'i' : '')
  } catch {
    return err(`grep: Invalid regular expression '${pattern}'`, 2)
  }
  const output: string[] = []
  let anyMatch = false

  const processText = (text: string, label: string | null) => {
    let count = 0
    const lines = text.split('\n')
    if (text.endsWith('\n')) lines.pop()
    lines.forEach((line, i) => {
      const hit = flags.has('v') ? !regex.test(line) : regex.test(line)
      if (!hit) return
      count++
      anyMatch = true
      if (flags.has('c')) return
      const num = flags.has('n') ? `${i + 1}:` : ''
      output.push(label && files.length > 1 ? `${label}:${num}${line}` : `${num}${line}`)
    })
    if (flags.has('c')) {
      if (label && files.length > 1) output.push(`${label}:${count}`)
      else output.push(String(count))
    }
  }

  if (files.length === 0) {
    if (ctx.stdin === null) {
      return err(`grep: 缺少文件参数（模拟器提示：请写成 grep [选项] 模式 文件，或通过管道传入内容）`, 2)
    }
    processText(ctx.stdin ?? '', null)
  } else {
    for (const f of files) {
      const r = nodeOrError(ctx.state, f)
      if (!r.node) {
        if (!flags.has('s')) output.push(`grep: ${f}: ${r.error}`)
        continue
      }
      if (r.node.kind === 'dir') {
        if (!flags.has('r')) {
          output.push(`grep: ${f}: Is a directory`)
          continue
        }
        const walkDir = (node: FsNode, prefix: string) => {
          for (const e of sortedEntries(node)) {
            if (e.child.kind === 'dir') walkDir(e.child, prefix + '/' + e.name)
            else processText(e.child.content, prefix + '/' + e.name)
          }
        }
        walkDir(r.node, f)
        continue
      }
      processText(r.node.content, f)
    }
  }
  return { stdout: output.join('\n') + (output.length ? '\n' : ''), stderr: '', exitCode: anyMatch ? 0 : 1 }
}

function findHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  let namePattern: string | null = null
  let typeFilter: string | null = null
  const paths: string[] = []
  const rest = ctx.args.slice(1)
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '-name') {
      namePattern = rest[i + 1]
      i++
    } else if (a === '-type') {
      const t = rest[i + 1]
      if (t !== 'f' && t !== 'd') return err(`find: unknown argument to -type: ${t}`, 1)
      typeFilter = t
      i++
    } else if (a.startsWith('-')) {
      return err(`find: unknown predicate '${a}'`, 1)
    } else {
      paths.push(a)
    }
  }
  const roots = paths.length ? paths : ['.']
  const out: string[] = []
  let failed = false
  const re = namePattern ? globRegex(namePattern) : null

  const walkRec = (node: FsNode, prefix: string) => {
    const rel = prefix === '.' ? '.' : prefix
    const matches = (n: FsNode) =>
      (namePattern === null || re!.test(n.name)) && (typeFilter === null || (typeFilter === 'f' && n.kind === 'file') || (typeFilter === 'd' && n.kind === 'dir'))
    if (node.kind === 'file') {
      if (matches(node)) {
        out.push(prefix === '.' ? './' + node.name : prefix)
      }
      return
    }
    if (matches(node)) {
      if (prefix !== '.' && prefix !== '') out.push(prefix)
    }
    const entries = sortedEntries(node)
    for (const e of entries) {
      if (node.kind === 'dir') {
        if (!canRead(node, ctx.state.uid, ctx.state.gids)) {
          out.push(`find: '${prefix === '.' ? '' : prefix}': Permission denied`)
          failed = true
          continue
        }
        walkRec(e.child, prefix === '.' ? '.' + (node.children ? '/' + e.name : '') : prefix + '/' + e.name)
      }
    }
  }

  for (const rp of roots) {
    const r = nodeOrError(ctx.state, rp)
    if (!r.node) {
      out.push(`find: '${rp}': No such file or directory`)
      failed = true
      continue
    }
    walkRec(r.node, rp === '.' ? '.' : rp)
  }
  return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '', exitCode: failed ? 1 : 0 }
}

function wcHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  const flags = new Set<string>()
  const rest: string[] = []
  for (const a of ctx.args.slice(1)) {
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (!'lwc'.includes(ch)) return err(`wc: invalid option -- '${ch}'\nUsage: wc [OPTION]... [FILE]...`, 2)
        flags.add(ch)
      }
    } else {
      rest.push(a)
    }
  }
  const showL = flags.size === 0 || flags.has('l')
  const showW = flags.size === 0 || flags.has('w')
  const showC = flags.size === 0 || flags.has('c')
  const count = (text: string) => {
    const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text
    const lines = trimmed === '' ? 0 : trimmed.split('\n').length
    const words = trimmed.trim() ? trimmed.trim().split(/\s+/).length : 0
    const bytes = text.length
    return { lines, words, bytes }
  }
  const fmt = (c: { lines: number; words: number; bytes: number }, name: string) => {
    const parts: string[] = []
    if (showL) parts.push(String(c.lines).padStart(7))
    if (showW) parts.push(String(c.words).padStart(7))
    if (showC) parts.push(String(c.bytes).padStart(7))
    return parts.join(' ') + (name ? ' ' + name : '')
  }
  if (rest.length === 0) {
    if (ctx.stdin === null) {
      return err(`wc: 缺少文件参数（模拟器提示：请写成 wc [选项] 文件，或通过管道传入内容）`, 2)
    }
    return ok(fmt(count(ctx.stdin ?? ''), '') + '\n')
  }
  const out: string[] = []
  const totals = { lines: 0, words: 0, bytes: 0 }
  for (const p of rest) {
    const r = nodeOrError(ctx.state, p)
    if (r.error) {
      out.push(`wc: ${p}: ${r.error}`)
      continue
    }
    const c = count(r.node!.content)
    totals.lines += c.lines
    totals.words += c.words
    totals.bytes += c.bytes
    out.push(fmt(c, p))
  }
  if (rest.length > 1) out.push(fmt(totals, 'total'))
  return ok(out.join('\n') + '\n')
}

function sortHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  const flags = new Set<string>()
  const rest: string[] = []
  for (const a of ctx.args.slice(1)) {
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (!'rn'.includes(ch)) return err(`sort: invalid option -- '${ch}'`, 2)
        flags.add(ch)
      }
    } else {
      rest.push(a)
    }
  }
  let text = ''
  if (rest.length === 0) {
    if (ctx.stdin === null) {
      return err(`sort: 缺少文件参数（模拟器提示：请写成 sort [选项] 文件，或通过管道传入内容）`, 2)
    }
    text = ctx.stdin ?? ''
  } else {
    for (const p of rest) {
      const r = nodeOrError(ctx.state, p)
      if (r.error) return err(`sort: cannot read: ${p}: ${r.error}`, 1)
      text += r.node!.content
    }
  }
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  lines.sort((a, b) => {
    if (flags.has('n')) {
      const na = Number(a)
      const nb = Number(b)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    }
    return a < b ? -1 : a > b ? 1 : 0
  })
  if (flags.has('r')) lines.reverse()
  return ok(lines.join('\n') + (lines.length ? '\n' : ''))
}

function uniqHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  const flags = new Set<string>()
  const rest: string[] = []
  for (const a of ctx.args.slice(1)) {
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (!'c'.includes(ch)) return err(`uniq: invalid option -- '${ch}'`, 2)
        flags.add(ch)
      }
    } else {
      rest.push(a)
    }
  }
  let text = ''
  let inputName = 'stdin'
  if (rest.length > 0) {
    const r = nodeOrError(ctx.state, rest[0])
    if (r.error) return err(`uniq: ${rest[0]}: ${r.error}`, 1)
    text = r.node!.content
    inputName = rest[0]
  } else {
    if (ctx.stdin === null) {
      return err(`uniq: 缺少文件参数（模拟器提示：请写成 uniq [选项] 文件，或通过管道传入内容）`, 2)
    }
    text = ctx.stdin ?? ''
  }
  void inputName
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const out: string[] = []
  let prev: string | null = null
  let count = 0
  const flush = () => {
    if (prev === null) return
    if (flags.has('c')) out.push(`${String(count).padStart(4)} ${prev}`)
    else out.push(prev)
  }
  for (const l of lines) {
    if (l === prev) count++
    else {
      flush()
      prev = l
      count = 1
    }
  }
  flush()
  return ok(out.join('\n') + (out.length ? '\n' : ''))
}

function chmodHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  const rest = ctx.args.slice(1)
  if (rest.length === 0) return err(`chmod: missing operand\nTry 'chmod --help' for more information.`, 1)
  if (rest.length < 2) return err(`chmod: missing operand after '${rest[0]}'\nTry 'chmod --help' for more information.`, 1)
  const modeArg = rest[0]
  const files = rest.slice(1)
  interface ModeOp {
    who: string
    op: '+' | '-' | '='
    perms: string
    octal: number | null
  }
  const ops: ModeOp[] = []
  if (/^[0-7]{3,4}$/.test(modeArg)) {
    ops.push({ who: 'a', op: '=', perms: '', octal: parseInt(modeArg.slice(-3), 8) })
  } else {
    for (const part of modeArg.split(',')) {
      const m = /^([ugoa]*)([+\-=])([rwx]+)$/.exec(part)
      if (!m) return err(`chmod: invalid mode: '${modeArg}'\nTry 'chmod --help' for more information.`, 1)
      ops.push({ who: m[1] || 'a', op: m[2] as '+' | '-' | '=', perms: m[3], octal: null })
    }
  }
  const out: string[] = []
  let failed = false
  const bitFor = (ch: string, offset: number): number => {
    if (ch === 'r') return 0o400 >> offset
    if (ch === 'w') return 0o200 >> offset
    return 0o100 >> offset
  }
  for (const f of files) {
    const abs = normalizePath(ctx.state.cwd, f, home(ctx.state))
    const node = walk(ctx.state.fsRoot, abs)
    if (!node) {
      out.push(`chmod: cannot access '${f}': No such file or directory`)
      failed = true
      continue
    }
    if (ctx.state.uid !== 0 && node.uid !== ctx.state.uid) {
      out.push(`chmod: changing permissions of '${f}': Operation not permitted`)
      failed = true
      continue
    }
    for (const op of ops) {
      if (op.octal !== null) {
        node.mode = op.octal
        continue
      }
      const groups: { offset: number; enabled: boolean }[] = [
        { offset: 0, enabled: op.who.includes('u') || op.who.includes('a') },
        { offset: 3, enabled: op.who.includes('g') || op.who.includes('a') },
        { offset: 6, enabled: op.who.includes('o') || op.who.includes('a') },
      ]
      for (const g of groups) {
        if (!g.enabled) continue
        for (const ch of op.perms) {
          const b = bitFor(ch, g.offset)
          if (op.op === '+') node.mode |= b
          else if (op.op === '-') node.mode &= ~b
          else node.mode = (node.mode & ~(0o700 >> g.offset)) | b
        }
      }
    }
  }
  return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: failed ? 1 : 0 }
}

function parseFieldList(s: string | undefined): number[] | null {
  if (s === undefined) return null
  const out: number[] = []
  for (const part of s.split(',')) {
    const m = /^(\d+)(?:-(\d*))?$/.exec(part)
    if (!m) return null
    const a = Number(m[1])
    if (m[2] === undefined) {
      out.push(a)
    } else if (m[2] === '') {
      out.push(a, -1)
    } else {
      const b = Number(m[2])
      if (b < a) return null
      for (let k = a; k <= b; k++) out.push(k)
    }
  }
  return out
}

function cutHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  let delim = '\t'
  let fields: number[] | null = null
  let chars: number[] | null = null
  const rest: string[] = []
  const args = ctx.args.slice(1)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-d' || a === '--delimiter') {
      delim = args[++i] ?? '\t'
      continue
    }
    if (a === '-f' || a === '--fields') {
      fields = parseFieldList(args[++i])
      if (!fields) return err(`cut: invalid field value: '${args[i]}'`, 1)
      continue
    }
    if (a === '-c' || a === '--characters') {
      chars = parseFieldList(args[++i])
      if (!chars) return err(`cut: invalid byte/character position: '${args[i]}'`, 1)
      continue
    }
    if (/^-[dfc]/.test(a) && a.length > 2) {
      const body = a.slice(1)
      if (body[0] === 'd') {
        delim = body.slice(1)
        continue
      }
      if (body[0] === 'f') {
        fields = parseFieldList(body.slice(1))
        if (!fields) return err(`cut: invalid field value: '${body.slice(1)}'`, 1)
        continue
      }
      if (body[0] === 'c') {
        chars = parseFieldList(body.slice(1))
        if (!chars) return err(`cut: invalid byte/character position: '${body.slice(1)}'`, 1)
        continue
      }
    }
    if (a.startsWith('-') && a.length > 1) {
      return err(`cut: invalid option -- '${a.slice(1)}'`, 1)
    }
    rest.push(a)
  }
  if (fields === null && chars === null) {
    return err(`cut: you must specify a list of bytes, characters, or fields\nTry 'cut --help' for more information.`, 1)
  }
  const pick = (line: string): string => {
    if (chars !== null) {
      const list = [...line]
      return chars
        .map((idx) => (idx === -1 ? list.slice(list.length) : idx <= list.length ? list[idx - 1] : undefined))
        .filter((v) => v !== undefined)
        .join('')
    }
    const cols = line.split(delim)
    return fields!
      .map((idx) => (idx === -1 ? cols.slice(idx + 1) : idx <= cols.length ? cols[idx - 1] : undefined))
      .filter((v) => v !== undefined)
      .join(delim)
  }
  let text = ''
  if (rest.length === 0) {
    if (ctx.stdin === null) {
      return err(`cut: 缺少文件参数（模拟器提示：请写成 cut 选项 文件，或通过管道传入内容）`, 2)
    }
    text = ctx.stdin ?? ''
  } else {
    for (const p of rest) {
      const r = nodeOrError(ctx.state, p)
      if (r.error) return err(`cut: ${p}: ${r.error}`, 1)
      if (r.node!.kind === 'dir') return err(`cut: ${p}: Is a directory`, 1)
      text += r.node!.content
    }
  }
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return ok(lines.map(pick).join('\n') + (lines.length ? '\n' : ''))
}

function envHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const args = ctx.args.slice(1)
  if (args.includes('-i') || args.includes('--ignore-environment')) {
    return ok(ctx.args.slice(1).join(' ') + (args.length ? '\n' : ''))
  }
  const keys = Object.keys(ctx.state.env).sort()
  return ok(keys.map((k) => `${k}=${ctx.state.env[k]}`).join('\n') + (keys.length ? '\n' : ''))
}

function resolveUser(spec: string): number | null {
  if (/^\d+$/.test(spec)) return Number(spec)
  const u = USERS.find((x) => x.name === spec)
  return u ? u.uid : null
}

function resolveGroup(spec: string): number | null {
  if (/^\d+$/.test(spec)) return Number(spec)
  const g: Record<string, number> = { root: 0, student: 1000, sudo: 27 }
  return g[spec] ?? null
}

function chownHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const rest = ctx.args.slice(1)
  if (rest.length === 0) return err(`chown: missing operand\nTry 'chown --help' for more information.`, 1)
  const files = rest.slice(1)
  const spec = rest[0]
  if (files.length === 0) return err(`chown: missing operand after '${spec}'\nTry 'chown --help' for more information.`, 1)
  let uidTarget: number | null = null
  let gidTarget: number | null = null
  if (spec.includes(':')) {
    const parts = spec.split(':')
    const u = parts[0]
    const g = parts[1]
    if (u) {
      uidTarget = resolveUser(u)
      if (uidTarget === null) return err(`chown: invalid user: '${u}'`, 1)
    }
    if (g !== undefined && g !== '') {
      gidTarget = resolveGroup(g)
      if (gidTarget === null) return err(`chown: invalid group: '${g}'`, 1)
    }
  } else {
    uidTarget = resolveUser(spec)
    if (uidTarget === null) return err(`chown: invalid user: '${spec}'`, 1)
  }
  const out: string[] = []
  let failed = false
  for (const f of files) {
    const abs = normalizePath(ctx.state.cwd, f, home(ctx.state))
    const node = walk(ctx.state.fsRoot, abs)
    if (!node) {
      out.push(`chown: cannot access '${f}': No such file or directory`)
      failed = true
      continue
    }
    if (ctx.state.uid !== UID_ROOT) {
      if (uidTarget !== null) {
        out.push(`chown: changing ownership of '${f}': Operation not permitted`)
        failed = true
        continue
      }
      if (gidTarget !== null && !(node.uid === ctx.state.uid && ctx.state.gids.includes(gidTarget))) {
        out.push(`chown: changing group of '${f}': Operation not permitted`)
        failed = true
        continue
      }
    }
    if (uidTarget !== null) node.uid = uidTarget
    if (gidTarget !== null) node.gid = gidTarget
    node.mtime = ctx.state.clock
  }
  return { stdout: '', stderr: out.join('\n') + (out.length ? '\n' : ''), exitCode: failed ? 1 : 0 }
}

function topHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  void ctx.args
  const hour = String(8 + Math.floor(ctx.state.clock / 60) % 12).padStart(2, '0')
  const minute = String(ctx.state.clock % 60).padStart(2, '0')
  const tasks = ctx.state.procs.length
  const running = Math.max(1, Math.floor(tasks / 2))
  const sleeping = tasks - running
  const table = formatTable(
    [
      { name: 'PID', align: 'right' },
      { name: 'USER', align: 'left' },
      { name: 'PR', align: 'right' },
      { name: 'NI', align: 'right' },
      { name: 'VIRT', align: 'right' },
      { name: 'RES', align: 'right' },
      { name: '%CPU', align: 'right' },
      { name: '%MEM', align: 'right' },
      { name: 'TIME', align: 'right' },
      { name: 'COMMAND', flex: true },
    ],
    ctx.state.procs.map((p) => {
      const mem = 0.5 + (p.pid % 10) * 0.4
      const cpu = 0.1 + ((p.pid * 7) % 25) / 10
      return [
        String(p.pid),
        'student',
        '20',
        '0',
        '108M',
        `${mem.toFixed(1)}M`,
        cpu.toFixed(1),
        mem.toFixed(1),
        '0:00',
        p.cmd,
      ]
    }),
  )
  const out = [
    `top - ${hour}:${minute}:00 up 2:10, 1 user, load average: 0.00, 0.01, 0.05`,
    `Tasks: ${tasks} total, ${running} running, ${sleeping} sleeping, 0 stopped, 0 zombie`,
    '%Cpu(s):  2.0 us,  0.5 sy,  0.0 ni, 97.0 id,  0.5 wa',
    'MiB Mem :   1987.4 total,   1502.1 free,    211.2 used,    274.1 buff/cache',
    '',
    table,
    '',
    '\x1b[90m（top 模拟模式：真实系统每 3 秒刷新一次界面，这里是静态快照，按 q 退出。）\x1b[0m',
  ]
  return ok(out.join('\n') + '\n')
}

const GZ_MARK = 'GZV1:'

function encodeB64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeB64(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function gzipHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const argv = ctx.args.slice(1)
  const isGunzip = ctx.args[0] === 'gunzip'
  const decompress = isGunzip || argv.includes('-d') || argv.includes('--decompress')
  const keep = argv.includes('-k') || argv.includes('--keep')
  const quiet = argv.includes('-q') || argv.includes('--quiet')
  const files = argv.filter((a) => !a.startsWith('-'))
  if (files.length === 0) {
    return err(isGunzip ? `gunzip: usage: gunzip [OPTION]... FILE...` : `gzip: compressed data not written to a terminal. Use -f to force compression.\nFor help, type: gzip -h`, 1)
  }
  const out: string[] = []
  let failed = false
  for (const f of files) {
    const abs = normalizePath(ctx.state.cwd, f, home(ctx.state))
    const node = walk(ctx.state.fsRoot, abs)
    const par = getParent(ctx.state.fsRoot, abs)
    if (!node || node.kind !== 'file' || !par) {
      if (!quiet) out.push(`${isGunzip ? 'gunzip' : 'gzip'}: ${f}: No such file or directory`)
      failed = true
      continue
    }
    if (decompress) {
      if (!f.endsWith('.gz')) {
        if (!quiet) out.push(`${isGunzip ? 'gunzip' : 'gzip'}: ${f}: unknown suffix -- ignored`)
        failed = true
        continue
      }
      if (!node.content.startsWith(GZ_MARK)) {
        if (!quiet) out.push(`${isGunzip ? 'gunzip' : 'gzip'}: ${f}: not in gzip format`)
        failed = true
        continue
      }
      const content = decodeB64(node.content.slice(GZ_MARK.length))
      const targetName = f.slice(0, -3)
      const targetAbs = normalizePath(ctx.state.cwd, targetName, home(ctx.state))
      if (walk(ctx.state.fsRoot, targetAbs)) {
        if (!quiet) out.push(`${isGunzip ? 'gunzip' : 'gzip'}: ${targetName} already exists; not overwritten`)
        failed = true
        continue
      }
      const tp = getParent(ctx.state.fsRoot, targetAbs)!
      tp.parent.children![tp.name] = {
        kind: 'file',
        name: tp.name,
        content,
        mode: node.mode,
        uid: node.uid,
        gid: node.gid,
        mtime: ctx.state.clock,
      }
      if (!keep) delete par.parent.children![par.name]
    } else {
      const gzName = f + '.gz'
      const gzAbs = normalizePath(ctx.state.cwd, gzName, home(ctx.state))
      if (walk(ctx.state.fsRoot, gzAbs)) {
        if (!quiet) out.push(`gzip: ${gzName} already exists; not overwritten`)
        failed = true
        continue
      }
      const tp = getParent(ctx.state.fsRoot, gzAbs)!
      tp.parent.children![tp.name] = {
        kind: 'file',
        name: tp.name,
        content: GZ_MARK + encodeB64(node.content),
        mode: node.mode,
        uid: node.uid,
        gid: node.gid,
        mtime: ctx.state.clock,
      }
      if (!keep) delete par.parent.children![par.name]
    }
  }
  return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '', exitCode: failed ? 1 : 0 }
}

const TAR_MARK = 'TARV1:'
const TARGZ_MARK = 'TARGZ1:'

interface TarFileEntry {
  path: string
  content: string
  mode: number
  uid: number
  gid: number
}

function tarHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const args = ctx.args.slice(1)
  let action: 'c' | 't' | 'x' | null = null
  let archive: string | null = null
  let cdir: string | null = null
  let gzipCompress = false
  const paths: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-f' || a === '--file') {
      archive = args[++i] ?? null
      continue
    }
    if (a === '-C' || a === '--directory') {
      cdir = args[++i] ?? null
      continue
    }
    if (a === '-z' || a === '--gzip') {
      gzipCompress = true
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (ch === 'c') action = 'c'
        else if (ch === 't') action = 't'
        else if (ch === 'x') action = 'x'
        else if (ch === 'v') {
          // verbose: no-op
        } else if (ch === 'z') {
          gzipCompress = true
        } else if (ch === 'f') {
          archive = args[++i] ?? null
        } else {
          return err(`tar: invalid option -- '${ch}'\nTry 'tar --help' or 'tar --usage' for more information.`, 2)
        }
      }
      continue
    }
    paths.push(a)
  }
  if (!action) return err(`tar: you must specify one of the '-Acdtrux' options\nTry 'tar --help' or 'tar --usage' for more information.`, 2)
  if (!archive) return err(`tar: option requires an argument -- 'f'\nTry 'tar --help' or 'tar --usage' for more information.`, 2)

  const homeDir = home(ctx.state)
  const archiveAbs = normalizePath(ctx.state.cwd, archive, homeDir)
  const markerOf = (compressed: boolean) => (compressed ? TARGZ_MARK : TAR_MARK)

  if (action === 'c') {
    if (paths.length === 0) return err(`tar: no files or directories specified`, 1)
    const files: TarFileEntry[] = []
    let failed = false
    for (const p of paths) {
      const abs = normalizePath(ctx.state.cwd, p, homeDir)
      const node = walk(ctx.state.fsRoot, abs)
      if (!node) {
        return err(`tar: ${p}: Cannot stat: No such file or directory`, 2)
      }
      collectFileList(node, p.replace(/\/$/, ''), files)
    }
    void failed
    const payload = JSON.stringify({ files })
    const par = getParent(ctx.state.fsRoot, archiveAbs)
    if (!par) return err(`tar: ${archive}: Cannot open: No such file or directory`, 2)
    par.parent.children![par.name] = {
      kind: 'file',
      name: par.name,
      content: markerOf(gzipCompress) + encodeB64(payload),
      mode: 0o644,
      uid: ctx.state.uid,
      gid: ctx.state.gids[0] ?? ctx.state.uid,
      mtime: ctx.state.clock,
    }
    return ok()
  }

  const node = walk(ctx.state.fsRoot, archiveAbs)
  if (!node || node.kind !== 'file') {
    return err(`tar: ${archive}: Cannot open: No such file or directory`, 2)
  }
  if (!node.content.startsWith(TAR_MARK) && !node.content.startsWith(TARGZ_MARK)) {
    return err(`tar: This does not look like a tar archive`, 2)
  }
  const payload = node.content.slice(node.content.startsWith(TARGZ_MARK) ? TARGZ_MARK.length : TAR_MARK.length)
  let files: TarFileEntry[]
  try {
    files = (JSON.parse(decodeB64(payload)) as { files: TarFileEntry[] }).files
  } catch {
    return err(`tar: This does not look like a tar archive`, 2)
  }

  if (action === 't') {
    return ok(files.map((f) => f.path).join('\n') + (files.length ? '\n' : ''))
  }

  const baseAbs = cdir ? normalizePath(ctx.state.cwd, cdir, homeDir) : ctx.state.cwd
  const baseNode = walk(ctx.state.fsRoot, baseAbs)
  if (!baseNode || baseNode.kind !== 'dir') {
    return err(`tar: ${cdir ?? '.'}: Cannot open: No such file or directory`, 2)
  }
  const out: string[] = []
  let failed = false
  for (const f of files) {
    const relSegs = segmentsOf(f.path)
    if (relSegs.length === 0) continue
    let dirNode: FsNode = baseNode
    for (let i = 0; i < relSegs.length - 1; i++) {
      const seg = relSegs[i]
      if (!dirNode.children) return err(`tar: ${f.path}: Cannot create: Not a directory`, 2)
      let child = dirNode.children[seg]
      if (!child) {
        dirNode.children[seg] = {
          kind: 'dir',
          name: seg,
          content: '',
          mode: 0o755,
          uid: ctx.state.uid,
          gid: ctx.state.gids[0] ?? ctx.state.uid,
          mtime: ctx.state.clock,
          children: {},
        }
        child = dirNode.children[seg]
      }
      if (child.kind !== 'dir') return err(`tar: ${f.path}: Cannot create: Not a directory`, 2)
      dirNode = child
    }
    const name = relSegs[relSegs.length - 1]
    if (!dirNode.children) return err(`tar: ${f.path}: Cannot create`, 2)
    if (dirNode.children[name]) {
      out.push(`tar: ${f.path}: Not found in archive`)
      failed = true
      continue
    }
    dirNode.children[name] = {
      kind: 'file',
      name,
      content: f.content,
      mode: f.mode,
      uid: f.uid,
      gid: f.gid,
      mtime: ctx.state.clock,
    }
    out.push(f.path)
  }
  return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '', exitCode: failed ? 1 : 0 }
}

const KNOWN_HOSTS: Record<string, string> = {
  'example.com': '93.184.216.34',
  'google.com': '142.250.72.14',
  'github.com': '140.82.112.4',
  'openai.com': '104.18.36.42',
}

function resolveHost(state: SimState, host: string): string | null {
  const hostsFile = walk(state.fsRoot, '/etc/hosts')
  if (hostsFile && hostsFile.kind === 'file') {
    for (const line of hostsFile.content.split('\n')) {
      const m = /^\s*([\d.]+)\s+(.+)$/.exec(line)
      if (m && m[2].split(/\s+/).includes(host)) return m[1]
    }
  }
  return KNOWN_HOSTS[host] ?? null
}

function pingHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  let count = 4
  const rest: string[] = []
  const args = ctx.args.slice(1)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-c' || a === '--count') {
      count = Number(args[++i])
      continue
    }
    if (/^-\d+$/.test(a)) {
      count = Number(a.slice(1))
      continue
    }
    if (a.startsWith('-')) {
      rest.push(a)
      continue
    }
    rest.push(a)
  }
  const host = rest[0]
  if (!host) return err(`ping: usage error: Destination address required`, 2)
  const ip = resolveHost(ctx.state, host)
  if (!ip) return err(`ping: ${host}: Name or service not known`, 2)
  const times: number[] = []
  for (let i = 1; i <= count; i++) times.push((ctx.state.clock + i * 7) % 12 + 3)
  const lines: string[] = [`PING ${host} (${ip}) 56(84) bytes of data.`]
  for (let i = 1; i <= count; i++) {
    const ttl = 60 - ((i - 1) % 3) * 4
    lines.push(`64 bytes from ${ip}: icmp_seq=${i} ttl=${ttl} time=${times[i - 1]}.${((i * 13) % 100).toString().padStart(2, '0')} ms`)
  }
  lines.push('')
  lines.push(`--- ${host} ping statistics ---`)
  lines.push(`${count} packets transmitted, ${count} packets received, 0% packet loss`)
  if (count > 0) {
    const min = Math.min(...times)
    const max = Math.max(...times)
    const avg = times.reduce((s, t) => s + t, 0) / times.length
    lines.push(`round-trip min/avg/max = ${min}.0/${avg.toFixed(1)}/${max}.0 ms`)
  }
  return ok(lines.join('\n') + '\n')
}

const KNOWN_SITES: Record<string, string> = {
  'example.com':
    '<!DOCTYPE html>\n<html>\n<head>\n  <title>Example Domain</title>\n</head>\n<body>\n<div>\n<h1>Example Domain</h1>\n<p>This domain is for use in illustrative examples in documents.</p>\n</div>\n</body>\n</html>\n',
  'httpbin.org': '{\n  "origin": "203.0.113.42",\n  "url": "https://httpbin.org/get"\n}\n',
}

function dockerHttpResponse(state: SimState, ctr: { fsRoot: FsNode; image: string; exposedPorts: number[] }, path: string): string {
  void path
  const indexNode = walk(ctr.fsRoot, '/usr/share/nginx/html/index.html')
  if (indexNode && indexNode.kind === 'file') return indexNode.content
  const repo = ctr.image.split(':')[0]
  if (repo === 'api' || repo === 'api-broken' || repo === 'web') {
    return '{\n  "status": "ok",\n  "service": "' + repo + '",\n  "uptime": "12m"\n}\n'
  }
  if (ctr.exposedPorts.includes(80)) {
    return '<!DOCTYPE html>\n<html>\n<head><title>' + repo + '</title></head>\n<body><h1>' + repo + ' container</h1></body></html>\n'
  }
  return '{\n  "status": "ok"\n}\n'
}

function curlHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const args = ctx.args.slice(1)
  const silent = args.includes('-s') || args.includes('--silent')
  const headOnly = args.includes('-I') || args.includes('--head')
  let outputFile: string | null = null
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-o' || a === '--output') {
      outputFile = args[++i] ?? null
      continue
    }
    if (a.startsWith('-')) continue
    rest.push(a)
  }
  const url = rest[0]
  if (!url) return err(`curl: try 'curl --help' or 'curl --manual' for more information`, 2)
  const m = /^https?:\/\/([^/]+)(\/.*)?$/.exec(url)
  if (!m) return err(`curl: (1) Protocol "${url.split(':')[0]}" not supported or disabled in libcurl`, 2)
  const hostPort = m[1]
  const reqPath = m[2] ?? '/'
  let host = hostPort
  let port = 80
  if (hostPort.includes(':')) {
    const parts = hostPort.split(':')
    host = parts[0]
    port = Number(parts[1])
  }
  let page: string | null = null
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === 'lab-host') {
    const svc = activePorts(ctx.state).find((p) => p.port === port)
    if (svc) {
      page = SERVICE_DEFS[svc.name].page
    } else {
      const dctr = ctx.state.docker.containers.find(
        (c) => c.status === 'running' && c.ports.some((p) => p.host === port),
      )
      if (dctr) {
        page = dockerHttpResponse(ctx.state, dctr, reqPath)
      } else {
        const msg = `curl: (7) Failed to connect to ${host} port ${port}: Connection refused`
        return { stdout: '', stderr: silent ? '' : msg + '\n', exitCode: 7 }
      }
    }
  } else {
    const dctr = ctx.state.docker.containers.find(
      (c) => c.status === 'running' && c.name === host && c.exposedPorts.includes(port),
    )
    if (dctr) {
      page = dockerHttpResponse(ctx.state, dctr, reqPath)
    } else {
      page = KNOWN_SITES[host] ?? null
      if (!page) {
        const msg = `curl: (6) Could not resolve host: ${host}`
        return { stdout: '', stderr: silent ? '' : msg + '\n', exitCode: 6 }
      }
    }
  }
  void reqPath
  const headers = [
    'HTTP/1.1 200 OK',
    `Content-Type: ${page.startsWith('{') ? 'application/json' : 'text/html; charset=UTF-8'}`,
    `Content-Length: ${page.length}`,
    'Server: CmdLab/1.0',
    'Connection: keep-alive',
    '',
  ]
  const body = headOnly ? '' : page
  const full = headers.join('\r\n') + '\r\n' + body
  if (outputFile) {
    const abs = normalizePath(ctx.state.cwd, outputFile, home(ctx.state))
    const par = getParent(ctx.state.fsRoot, abs)
    if (!par) return err(`curl: (23) Failure writing output to destination`, 23)
    par.parent.children![par.name] = {
      kind: 'file',
      name: par.name,
      content: body,
      mode: 0o644,
      uid: ctx.state.uid,
      gid: ctx.state.gids[0] ?? ctx.state.uid,
      mtime: ctx.state.clock,
    }
    return ok()
  }
  return ok(full)
}

function ssHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const flags = new Set(ctx.args.slice(1).filter((a) => a.startsWith('-')).flatMap((a) => [...a.slice(1)]))
  const showProcess = flags.has('p')
  const listeningOnly = flags.has('l')
  const ports: { port: number; name: string }[] = [{ port: 22, name: 'sshd' }, ...activePorts(ctx.state)]
  const lines: string[] = ['Netid  State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port  Process']
  const rows: string[] = []
  for (const { port, name } of ports) {
    const proc = showProcess ? `  users:(("${name}",pid=${3100 + (port % 100)},fd=3))` : ''
    rows.push(`tcp    LISTEN  0      128      0.0.0.0:${port}   0.0.0.0:*${proc}`)
  }
  if (!listeningOnly) {
    for (let i = 0; i < 2; i++) {
      const port = ports[i % ports.length]
      rows.push(`tcp    ESTAB   0      0        192.168.1.20:${40000 + i}  192.168.1.10:${port.port}`)
    }
  }
  return ok(lines.join('\n') + '\n' + rows.join('\n') + '\n')
}

function startService(state: SimState, name: string): CommandResult {
  const def = SERVICE_DEFS[name]
  const entry = findServiceEntry(state, name)
  if (!def || !entry) return err(`Failed to start ${name}.service: Unit not found.`, 1)
  if (entry.status === 'active') {
    entry.log.push(`${state.clock}: ${name}.service: Start request repeated too quickly.`)
    return err(`Failed to start ${name}.service: Unit is already active.`)
  }
  const check = def.readyCheck(state)
  if (!check.ready) {
    entry.status = 'failed'
    entry.pid = null
    entry.log.push(`${state.clock}: ${name}.service: Failed with result 'exit-code'.`)
    entry.log.push(`${state.clock}: ${name}.service: ${check.reason}`)
    return err(
      `Job for ${name}.service failed because the control process exited with error code.\n${name}.service: ${check.reason}\n（提示：服务需要日志文件同时具备读和写权限，如 chmod 644 / chmod 664）\nSee "systemctl status ${name}.service" and "journalctl -xe" for details.`,
      1,
    )
  }
  entry.status = 'active'
  entry.pid = servicePid(state, name)
  entry.startTime = state.clock
  entry.log.push(`${state.clock}: ${name}.service: Started ${def.description}.`)
  if (!state.procs.some((p) => p.pid === entry.pid)) {
    state.procs.push({ pid: entry.pid, cmd: def.execPath, tty: '?', time: '00:00:00' })
  }
  return ok()
}

function stopService(state: SimState, name: string): CommandResult {
  const entry = findServiceEntry(state, name)
  if (!entry) return err(`Failed to stop ${name}.service: Unit not found.`, 1)
  if (entry.status !== 'active') {
    entry.log.push(`${state.clock}: ${name}.service: Unit is not loaded.`)
    return err(`Failed to stop ${name}.service: Unit is not active.`)
  }
  entry.status = 'inactive'
  if (entry.pid !== null) {
    state.procs = state.procs.filter((p) => p.pid !== entry.pid)
  }
  entry.pid = null
  entry.log.push(`${state.clock}: ${name}.service: Stopped.`)
  return ok()
}

function formatServiceStatus(state: SimState, name: string): string {
  const def = SERVICE_DEFS[name]
  const entry = findServiceEntry(state, name)
  const activeDot = entry!.status === 'active' ? '●' : entry!.status === 'failed' ? '●' : '○'
  const color = entry!.status === 'active' ? '' : entry!.status === 'failed' ? '\x1b[31m' : ''
  const lines = [
    `${activeDot} ${name}.service - ${def!.description}`,
    `     Loaded: loaded (/etc/systemd/system/${name}.service; enabled; vendor preset: enabled)`,
    `     Active: ${color}${entry!.status === 'active' ? 'active (running)' : entry!.status === 'failed' ? 'failed (Result: exit-code)' : 'inactive (dead)'}\x1b[0m since ${entry!.startTime !== null ? 'a few seconds ago' : 'never'}`,
    `       Docs: man:${name}(8)`,
  ]
  if (entry!.status === 'active') {
    lines.push(`   Main PID: ${entry!.pid}`)
  } else if (entry!.status === 'failed') {
    lines.push(`   Main PID: (code=exited, status=1/FAILURE)`)
  }
  if (def!.port !== null && entry!.status === 'active') {
    lines.push(`     Listen: 0.0.0.0:${def!.port}`)
  }
  const recent = entry!.log.slice(-6)
  if (recent.length > 0) {
    lines.push('')
    lines.push(`${name}.service - ${def!.description}`)
    for (const l of recent) lines.push('  ' + l)
  }
  lines.push(`\x1b[90m（systemctl 模拟模式：日志为模拟生成。）\x1b[0m`)
  return lines.join('\n') + '\n'
}

function systemctlHandler(ctx: { args: string[]; state: SimState; stdin: string | null }): CommandResult {
  void ctx.stdin
  const args = ctx.args.slice(1)
  const cmd = args[0]
  if (cmd === 'list-units' || cmd === 'list-units --type=service' || cmd === 'list-unit-files') {
    const lines: string[] = []
    for (const name of serviceNames()) {
      const def = SERVICE_DEFS[name]
      const entry = findServiceEntry(ctx.state, name)
      if (!entry) continue
      lines.push(`${name}.service   loaded ${entry.status === 'active' ? 'active running' : entry.status === 'failed' ? 'failed failed' : 'inactive dead'}`)
      void def
    }
    lines.push('\x1b[90m（模拟模式：仅显示本教程涉及的服务。）\x1b[0m')
    return ok(lines.join('\n') + '\n')
  }
  const name = args[1]?.replace(/\.service$/, '')
  if (!cmd || !name) {
    if (cmd === '--help' || cmd === '-h') return ok(MAN_PAGES['systemctl'] ?? '')
    return err(`Unknown operation '${cmd ?? ''}'.`, 1)
  }
  if (!SERVICE_DEFS[name] || !findServiceEntry(ctx.state, name)) {
    return err(`Failed to get unit file state for ${name}.service: No such file or directory`, 1)
  }
  switch (cmd) {
    case 'status':
      return ok(formatServiceStatus(ctx.state, name))
    case 'start':
      return startService(ctx.state, name)
    case 'stop':
      return stopService(ctx.state, name)
    case 'restart': {
      stopService(ctx.state, name)
      return startService(ctx.state, name)
    }
    case 'reload':
      return err(`Job for ${name}.service failed because the control process exited with error code.\nSee "systemctl status ${name}.service" and "journalctl -xe" for details.`, 1)
    case 'enable':
      return ok(`Created symlink /etc/systemd/system/multi-user.target.wants/${name}.service → /etc/systemd/system/${name}.service.\n`)
    case 'disable':
      return ok(`Removed "/etc/systemd/system/multi-user.target.wants/${name}.service".\n`)
    case 'is-active':
      return ok((findServiceEntry(ctx.state, name)!.status === 'active' ? 'active' : 'inactive') + '\n')
    default:
      return err(`Unknown operation '${cmd}'.`, 1)
  }
}

export function installLinuxCommands(): void {
  registerLinuxCommands()
}
