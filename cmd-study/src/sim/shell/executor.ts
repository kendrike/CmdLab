import type { CommandResult, FsNode, SimState } from '../types'
import { canRead, canWrite } from '../vfs/access'
import { getParent, normalizePath, walk } from '../vfs/paths'
import { expandArgs } from './expand'
import type { ParsedPipeline } from './lexer'
import { getHandler, ok } from './registry'
import type { CmdContext } from './registry'

export function readAliases(state: SimState): Record<string, string> {
  const aliases: Record<string, string> = {}
  const home = state.env['HOME'] ?? '/home/student'
  const bashrc = walk(state.fsRoot, home + '/.bashrc')
  if (bashrc && bashrc.kind === 'file') {
    for (const line of bashrc.content.split('\n')) {
      const m = /^\s*alias\s+([\w-]+)\s*=\s*(.+?)\s*$/.exec(line)
      if (m) aliases[m[1]] = m[2].replace(/^['"]/, '').replace(/['"]$/, '')
    }
  }
  const defaults: Record<string, string> = {
    ll: 'ls -alF',
    la: 'ls -A',
    l: 'ls -CF',
  }
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in aliases)) aliases[k] = v
  }
  return aliases
}

export function expandAliasArgs(state: SimState, args: string[], glob: boolean[]): { args: string[]; glob: boolean[] } {
  const aliases = readAliases(state)
  let result = args
  let resultGlob = glob
  for (let depth = 0; depth < 10; depth++) {
    const def = aliases[result[0]]
    if (!def) break
    const parts = def.trim().split(/\s+/)
    result = [...parts, ...result.slice(1)]
    resultGlob = [...parts.map(() => true), ...resultGlob.slice(1)]
  }
  return { args: result, glob: resultGlob }
}

export function readStdinFile(state: SimState, path: string): CommandResult {
  const abs = normalizePath(state.cwd, path, state.env['HOME'] ?? '/home/student')
  const node = walk(state.fsRoot, abs)
  if (!node) return { stdout: '', stderr: `bash: ${path}: No such file or directory`, exitCode: 1 }
  if (node.kind === 'dir') return { stdout: '', stderr: `bash: ${path}: Is a directory`, exitCode: 1 }
  if (!canRead(node, state.uid, state.gids)) {
    return { stdout: '', stderr: `bash: ${path}: Permission denied`, exitCode: 1 }
  }
  return ok(node.content)
}

function applyRedirect(state: SimState, cmdTarget: string, append: boolean, content: string): CommandResult {
  const home = state.env['HOME'] ?? '/home/student'
  const abs = normalizePath(state.cwd, cmdTarget, home)
  const p = getParent(state.fsRoot, abs)
  if (!p || !p.parent.children) {
    return { stdout: '', stderr: `bash: ${cmdTarget}: No such file or directory`, exitCode: 1 }
  }
  if (!canWrite(p.parent, state.uid, state.gids)) {
    return { stdout: '', stderr: `bash: ${cmdTarget}: Permission denied`, exitCode: 1 }
  }
  const existing = p.parent.children[p.name]
  if (existing && existing.kind === 'dir') {
    return { stdout: '', stderr: `bash: ${cmdTarget}: Is a directory`, exitCode: 1 }
  }
  if (append) {
    if (existing && existing.kind === 'file') existing.content += content
    else {
      p.parent.children[p.name] = {
        kind: 'file',
        name: p.name,
        content,
        mode: 0o644,
        uid: state.uid,
        gid: state.gids[0] ?? state.uid,
        mtime: state.clock,
      }
    }
  } else if (existing && existing.kind === 'file') {
    existing.content = content
    existing.mtime = state.clock
  } else {
    p.parent.children[p.name] = {
      kind: 'file',
      name: p.name,
      content,
      mode: 0o644,
      uid: state.uid,
      gid: state.gids[0] ?? state.uid,
      mtime: state.clock,
    }
  }
  return ok()
}

export function runPipeline(state: SimState, pipeline: ParsedPipeline): CommandResult {
  let stdin: string | null = null
  let stdout = ''
  let stderr = ''
  let exitCode = 0
  const home = state.env['HOME'] ?? '/home/student'

  for (const cmd of pipeline.commands) {
    const expanded = expandAliasArgs(state, cmd.args, cmd.argGlob)
    const args = expandArgs(expanded.args, state.cwd, home, state.fsRoot, expanded.glob)
    let result: CommandResult
    if (args.length === 0) {
      result = ok()
      stdin = cmd.stdinHeredoc ?? stdin
      continue
    }
    const handler = getHandler(args[0])
    let stdinForCmd: string | null = stdin
    if (cmd.stdinHeredoc !== null) stdinForCmd = cmd.stdinHeredoc
    else if (cmd.redirectIn) {
      const r = readStdinFile(state, cmd.redirectIn)
      if (r.exitCode !== 0) {
        result = r
        exitCode = r.exitCode
        stderr += r.stderr
        break
      }
      stdinForCmd = r.stdout
    }
    if (!handler) {
      result = { stdout: '', stderr: `bash: ${args[0]}: command not found`, exitCode: 127 }
    } else {
      const ctx: CmdContext = { state, args, stdin: stdinForCmd }
      try {
        result = handler(ctx)
      } catch (e) {
        result = { stdout: '', stderr: `bash: ${args[0]}: internal simulator error: ${String(e)}`, exitCode: 1 }
      }
    }
    if (cmd.redirectOut && result.exitCode === 0) {
      const r = applyRedirect(state, cmd.redirectOut.target, cmd.redirectOut.append, result.stdout)
      if (r.exitCode !== 0) {
        result = r
      } else {
        result = ok()
      }
    }
    if (cmd.redirectErr && result.stderr) {
      const r = applyRedirect(state, cmd.redirectErr.target, cmd.redirectErr.append, result.stderr)
      if (r.exitCode !== 0) {
        result = { ...result, stderr: r.stderr }
      } else {
        result = { stdout: result.stdout, stderr: '', exitCode: result.exitCode }
      }
    }
    stdout = result.stdout
    stderr += result.stderr
    exitCode = result.exitCode
    stdin = result.stdout
    if (result.exitCode !== 0) break
  }
  return { stdout, stderr, exitCode }
}