import { getParent, normalizePath, walk } from '../vfs/paths'
import { readAliases } from './executor'
import { registerMany } from './registry'

function registerBuiltins(): void {
  registerMany([
    [
      'pwd',
      (ctx) => ({ stdout: ctx.state.cwd + '\n', stderr: '', exitCode: 0 }),
    ],
    [
      'cd',
      (ctx) => {
        const home = ctx.state.env['HOME'] ?? '/home/student'
        const raw = ctx.args[1]
        let target: string
        if (raw === undefined) {
          target = home
        } else if (raw === '-') {
          const prev = ctx.state.env['OLDPWD'] ?? home
          target = prev
        } else {
          target = raw
        }
        const abs = normalizePath(ctx.state.cwd, target, home)
        const node = walk(ctx.state.fsRoot, abs)
        if (!node) {
          return { stdout: '', stderr: `bash: cd: ${target}: No such file or directory`, exitCode: 1 }
        }
        if (node.kind !== 'dir') {
          return { stdout: '', stderr: `bash: cd: ${target}: Not a directory`, exitCode: 1 }
        }
        ctx.state.env['OLDPWD'] = ctx.state.cwd
        ctx.state.cwd = abs
        ctx.state.env['PWD'] = abs
        return { stdout: raw === '-' ? abs + '\n' : '', stderr: '', exitCode: 0 }
      },
    ],
    [
      'echo',
      (ctx) => {
        const noNewline = ctx.args.includes('-n')
        const parts = ctx.args.slice(noNewline ? 2 : 1)
        return { stdout: parts.join(' ') + (noNewline ? '' : '\n'), stderr: '', exitCode: 0 }
      },
    ],
    ['true', () => ({ stdout: '', stderr: '', exitCode: 0 })],
    ['false', () => ({ stdout: '', stderr: '', exitCode: 1 })],
    [
      'export',
      (ctx) => {
        const args = ctx.args.slice(1)
        if (args.length === 0) {
          const lines = Object.keys(ctx.state.env)
            .sort()
            .map((k) => `declare -x ${k}="${ctx.state.env[k]}"`)
          return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 }
        }
        for (const a of args) {
          const eq = a.indexOf('=')
          if (eq === -1) {
            if (!(a in ctx.state.env)) ctx.state.env[a] = ''
            continue
          }
          ctx.state.env[a.slice(0, eq)] = a.slice(eq + 1)
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    ],
    ['clear', () => ({ stdout: '\x1b[2J\x1b[H', stderr: '', exitCode: 0 })],
    [
      'history',
      (ctx) => {
        if (ctx.args[1] === '-c') {
          ctx.state.history = []
          return { stdout: '', stderr: '', exitCode: 0 }
        }
        const start = Math.max(0, ctx.state.history.length - 100)
        const lines = ctx.state.history.slice(start).map((l, i) => `${String(start + i + 1).padStart(5)}  ${l}`)
        return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 }
      },
    ],
    ['exit', () => ({ stdout: '', stderr: '', exitCode: 0 })],
    [
      'alias',
      (ctx) => {
        const args = ctx.args.slice(1)
        const aliases = readAliases(ctx.state)
        if (args.length === 0) {
          const lines = Object.keys(aliases)
            .sort()
            .map((k) => `alias ${k}='${aliases[k]}'`)
          return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 }
        }
        const out: string[] = []
        for (const a of args) {
          const eq = a.indexOf('=')
          if (eq === -1) {
            const def = aliases[a]
            out.push(def ? `alias ${a}='${def}'` : `bash: alias: ${a}: not found`)
            continue
          }
          const name = a.slice(0, eq)
          let value = a.slice(eq + 1)
          if (/^['"]/.test(value) && value.length >= 2 && value[0] === value[value.length - 1]) {
            value = value.slice(1, -1)
          }
          const home = ctx.state.env['HOME'] ?? '/home/student'
          const bashrcPath = home + '/.bashrc'
          const node = walk(ctx.state.fsRoot, bashrcPath)
          const line = `alias ${name}='${value}'`
          if (node && node.kind === 'file') {
            const lines = node.content.split('\n').filter((l) => !new RegExp(`^\\s*alias\\s+${name}\\s*=`).test(l))
            lines.push(line)
            node.content = lines.join('\n') + '\n'
          } else {
            const p = getParent(ctx.state.fsRoot, bashrcPath)
            if (p) {
              p.parent.children![p.name] = {
                kind: 'file',
                name: p.name,
                content: line + '\n',
                mode: 0o644,
                uid: ctx.state.uid,
                gid: ctx.state.gids[0] ?? ctx.state.uid,
                mtime: ctx.state.clock,
              }
            }
          }
          out.push(`alias ${name}='${value}'`)
        }
        return { stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '', exitCode: 0 }
      },
    ],
  ])
}

export function installBuiltins(): void {
  registerBuiltins()
}
