import type { CommandResult, SimState } from '../types'

export interface CmdContext {
  state: SimState
  args: string[]
  stdin: string | null
}

export type CommandHandler = (ctx: CmdContext) => CommandResult

const handlers = new Map<string, CommandHandler>()

export function register(name: string, handler: CommandHandler): void {
  handlers.set(name, handler)
}

export function registerMany(entries: [string, CommandHandler][]): void {
  for (const [n, h] of entries) handlers.set(n, h)
}

export function getHandler(name: string): CommandHandler | undefined {
  return handlers.get(name)
}

export function commandNames(): string[] {
  return [...handlers.keys()].sort()
}

export function ok(stdout = '', exitCode = 0): CommandResult {
  return { stdout, stderr: '', exitCode }
}

export function err(stderr: string, exitCode = 1): CommandResult {
  return { stdout: '', stderr, exitCode }
}
