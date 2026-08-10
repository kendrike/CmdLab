import type { SimState } from '../sim/types'
import { walk } from '../sim/vfs/paths'
import { canRead, canWrite } from '../sim/vfs/access'
import type { TeachingContent } from './teaching/types'

export interface StepDef {
  id: string
  label: string
  check: (s: SimState) => boolean
}

export type Difficulty = '入门' | '基础' | '进阶' | '挑战'

export interface Lab {
  id: string
  mode: 'linux' | 'docker' | 'kubernetes'
  category: string
  title: string
  difficulty: Difficulty
  estimatedMinutes: number
  prerequisites: string[]
  summary: string
  initialEnv: string
  description: string
  goals: string[]
  steps: StepDef[]
  hints: string[][]
  commonErrors: { cmd: string; explanation: string; hint: string }[]
  teaching?: TeachingContent
  build: () => SimState
}

export interface StepResult {
  id: string
  label: string
  done: boolean
}

export function evaluateLab(lab: Lab, state: SimState): { done: boolean; steps: StepResult[] } {
  const steps = lab.steps.map((s) => ({ id: s.id, label: s.label, done: s.check(state) }))
  return { done: steps.every((s) => s.done), steps }
}

export function historyHas(state: SimState, re: RegExp): boolean {
  return state.history.some((l) => re.test(l.trim()))
}

export function historyRan(state: SimState, re: RegExp): boolean {
  return state.history.some((l, i) => re.test(l.trim()) && state.exitCodes?.[i] === 0)
}

export function historyFailed(state: SimState, re: RegExp): boolean {
  return state.history.some((l, i) => re.test(l.trim()) && state.exitCodes?.[i] !== undefined && state.exitCodes[i] !== 0)
}

export function historyHasAny(state: SimState, res: RegExp[]): boolean {
  return res.some((re) => historyHas(state, re))
}

export function historyRanAny(state: SimState, res: RegExp[]): boolean {
  return res.some((re) => historyRan(state, re))
}

export function fsExists(state: SimState, absPath: string): boolean {
  return walk(state.fsRoot, absPath) !== undefined
}

export function fsIsDir(state: SimState, absPath: string): boolean {
  const node = walk(state.fsRoot, absPath)
  return !!node && node.kind === 'dir'
}

export function fsIsFile(state: SimState, absPath: string): boolean {
  const node = walk(state.fsRoot, absPath)
  return !!node && node.kind === 'file'
}

export function fsMode(state: SimState, absPath: string): number | null {
  const node = walk(state.fsRoot, absPath)
  return node ? node.mode : null
}

export function fsContent(state: SimState, absPath: string): string | null {
  const node = walk(state.fsRoot, absPath)
  return node && node.kind === 'file' ? node.content : null
}

export function fsOwner(state: SimState, absPath: string): { uid: number; gid: number } | null {
  const node = walk(state.fsRoot, absPath)
  return node ? { uid: node.uid, gid: node.gid } : null
}

export function fsReadWritableByStudent(state: SimState, absPath: string): boolean {
  const node = walk(state.fsRoot, absPath)
  if (!node || node.kind !== 'file') return false
  return canWrite(node, state.uid, state.gids) && canRead(node, state.uid, state.gids)
}

export function envValue(state: SimState, name: string): string | null {
  return state.env[name] ?? null
}

export function serviceStatus(state: SimState, name: string): string | null {
  const svc = state.services.find((s) => s.name === name)
  return svc ? svc.status : null
}
