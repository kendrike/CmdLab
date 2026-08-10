import type { SimState } from '../types'
import { normalizePath, walk } from '../vfs/paths'
import { expandArgs } from './expand'
import { runPipeline } from './executor'
import { parseInput } from './lexer'
import { commandNames } from './registry'

const SUBCOMMANDS: Record<string, string[]> = {
  systemctl: ['status', 'start', 'stop', 'restart', 'reload', 'enable', 'disable', 'is-active', 'list-units', 'daemon-reload'],
  docker: ['version', 'info', 'images', 'pull', 'ps', 'run', 'start', 'stop', 'restart', 'rm', 'rmi', 'logs', 'exec', 'inspect', 'network', 'volume'],
  kubectl: ['version', 'cluster-info', 'get', 'describe', 'logs', 'create', 'apply', 'expose', 'scale', 'set', 'rollout', 'delete', 'config'],
}

export interface ExecuteOutcome {
  stdout: string
  stderr: string
  exitCode: number
  needsMoreInput: boolean
}

export class ShellSession {
  state: SimState
  private pending = ''

  constructor(state: SimState) {
    this.state = state
  }

  execute(line: string): ExecuteOutcome {
    this.pending += line + '\n'
    const parsed = parseInput(this.pending, this.state.env)
    if (parsed.incomplete || parsed.pipelines.length === 0) {
      if (parsed.pipelines.length === 0 && !parsed.incomplete) {
        this.pending = ''
        return { stdout: '', stderr: '', exitCode: 0, needsMoreInput: false }
      }
      return { stdout: '', stderr: '', exitCode: 0, needsMoreInput: true }
    }
    const source = this.pending.trim()
    this.pending = ''
    this.state.clock += 1
    this.state.exitCodes = this.state.exitCodes ?? []

    let stdout = ''
    let stderr = ''
    let exitCode = 0
    for (const pipeline of parsed.pipelines) {
      const r = runPipeline(this.state, pipeline)
      stdout += r.stdout
      stderr += r.stderr
      exitCode = r.exitCode
    }
    if (source) {
      this.state.history.push(source)
      this.state.exitCodes.push(exitCode)
    }
    return { stdout, stderr, exitCode, needsMoreInput: false }
  }

  cancelPending(): void {
    this.pending = ''
  }

  get isPending(): boolean {
    return this.pending.length > 0
  }

  complete(line: string): { completion: string | null; candidates: string[] } {
    const trimmed = line.trimStart()
    const words = trimmed.split(/\s+/)
    const isFirst = !/\s/.test(trimmed)
    const prefix = words[words.length - 1] ?? ''
    if (isFirst) {
      const cands = commandNames().filter((c) => c.startsWith(prefix))
      if (cands.length === 1) return { completion: cands[0].slice(prefix.length) + ' ', candidates: [] }
      if (cands.length > 1) return { completion: null, candidates: cands }
      return { completion: null, candidates: [] }
    }
    const subcommands = SUBCOMMANDS[words[0]]
    if (subcommands) {
      const cands = subcommands.filter((c) => c.startsWith(prefix))
      if (cands.length === 1) return { completion: cands[0].slice(prefix.length) + ' ', candidates: [] }
      if (cands.length > 1) return { completion: null, candidates: cands }
    }
    const home = this.state.env['HOME'] ?? '/home/student'
    const dirPart = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : ''
    const base = prefix.includes('/') ? prefix.slice(prefix.lastIndexOf('/') + 1) : prefix
    const dirAbs = dirPart ? normalizePath(this.state.cwd, dirPart, home) : this.state.cwd
    const dirNode = walk(this.state.fsRoot, dirAbs)
    if (!dirNode || dirNode.kind !== 'dir' || !dirNode.children) {
      return { completion: null, candidates: [] }
    }
    const cands = Object.keys(dirNode.children)
      .filter((n) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')))
      .sort()
      .map((n) => n + (dirNode.kind === 'dir' && dirNode.children![n].kind === 'dir' ? '/' : ''))
    if (cands.length === 1) return { completion: cands[0].slice(base.length), candidates: [] }
    return { completion: null, candidates: cands }
  }

  resolve(path: string): string {
    return normalizePath(this.state.cwd, path, this.state.env['HOME'] ?? '/home/student')
  }
}

export function expandForCompletion(args: string[], state: SimState): string[] {
  return expandArgs(args, state.cwd, state.env['HOME'] ?? '/home/student', state.fsRoot, args.map(() => true))
}
