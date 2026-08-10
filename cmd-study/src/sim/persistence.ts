import type { SimState } from './types'

const UI_KEY = 'cmdstudy-save-v1'
const STATE_PREFIX = 'cmdstudy-state-'
export const MAX_STATE_BYTES = 2 * 1024 * 1024

export type LearningMode = 'guided' | 'practice'

export interface SaveData {
  currentLabId: string
  completed: string[]
  hints: Record<string, number>
  theme: 'dark' | 'light'
  mode?: LearningMode
}

interface LabStateEntry {
  savedAt: number
  state: SimState
}

function bytesOf(text: string): number {
  return new TextEncoder().encode(text).length
}

function stateKey(labId: string): string {
  return STATE_PREFIX + labId
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SaveData & { state?: SimState }
    if (!data || typeof data.currentLabId !== 'string') return null
    if (data.state) {
      writeLabState(data.currentLabId, data.state)
      const { state: _legacy, ...ui } = data
      localStorage.setItem(UI_KEY, JSON.stringify(ui))
    }
    return {
      currentLabId: data.currentLabId,
      completed: data.completed ?? [],
      hints: data.hints ?? {},
      theme: data.theme ?? 'dark',
      mode: data.mode ?? 'guided',
    }
  } catch {
    return null
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable: ignore
  }
}

export function loadLabState(labId: string): SimState | null {
  try {
    const raw = localStorage.getItem(stateKey(labId))
    if (!raw) return null
    const entry = JSON.parse(raw) as LabStateEntry
    if (!entry || !entry.state || entry.state.version !== 1) return null
    entry.state.exitCodes = entry.state.exitCodes ?? []
    return entry.state
  } catch {
    return null
  }
}

export function writeLabState(labId: string, state: SimState): void {
  try {
    localStorage.setItem(stateKey(labId), JSON.stringify({ savedAt: Date.now(), state } satisfies LabStateEntry))
    enforceStateLimit()
  } catch {
    // storage full or unavailable: ignore
  }
}

export function clearLabState(labId: string): void {
  try {
    localStorage.removeItem(stateKey(labId))
  } catch {
    // ignore
  }
}

function enforceStateLimit(): void {
  try {
    const entries: { key: string; savedAt: number; bytes: number }[] = []
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(STATE_PREFIX)) continue
      const raw = localStorage.getItem(key) ?? ''
      let savedAt = 0
      try {
        savedAt = (JSON.parse(raw) as LabStateEntry).savedAt ?? 0
      } catch {
        savedAt = 0
      }
      const size = bytesOf(raw)
      entries.push({ key, savedAt, bytes: size })
      total += size
    }
    if (total <= MAX_STATE_BYTES) return
    entries.sort((a, b) => a.savedAt - b.savedAt)
    for (const e of entries) {
      if (total <= MAX_STATE_BYTES / 2) break
      localStorage.removeItem(e.key)
      total -= e.bytes
    }
  } catch {
    // ignore
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(UI_KEY)
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STATE_PREFIX)) keys.push(key)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}
