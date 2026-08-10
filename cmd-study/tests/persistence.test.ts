import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialState, restoreState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import { clearSave, loadLabState, loadSave, writeLabState, writeSave } from '../src/sim/persistence'
import type { SimState } from '../src/sim/types'

initCommands()

const store = new Map<string, string>()
const storageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, String(v))
  },
  removeItem: (k: string) => {
    store.delete(k)
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  clear: () => store.clear(),
  get length() {
    return store.size
  },
}
globalThis.localStorage = storageMock as unknown as Storage

function putFile(s: SimState, name: string, content = 'x'): void {
  s.fsRoot.children!['home']!.children!['student']!.children![name] = {
    kind: 'file',
    name,
    content,
    mode: 0o644,
    uid: 1000,
    gid: 1000,
    mtime: 1,
  }
}

beforeEach(() => store.clear())

describe('按课程独立存档', () => {
  it('不同课程互不影响', () => {
    const s1 = createInitialState()
    putFile(s1, 'out.txt')
    const s2 = createInitialState()
    writeLabState('linux-redirect', s1)
    writeLabState('linux-cd', s2)
    expect(loadLabState('linux-redirect')!.fsRoot.children!.home!.children!.student!.children!['out.txt']).toBeDefined()
    expect(loadLabState('linux-cd')!.fsRoot.children!.home!.children!.student!.children!['out.txt']).toBeUndefined()
  })

  it('未保存的课程返回 null', () => {
    expect(loadLabState('linux-pipe')).toBeNull()
  })

  it('覆盖写入同一课程', () => {
    const s1 = createInitialState()
    putFile(s1, 'a.txt')
    writeLabState('linux-redirect', s1)
    const s2 = createInitialState()
    putFile(s2, 'b.txt')
    writeLabState('linux-redirect', s2)
    const loaded = loadLabState('linux-redirect')!
    expect(loaded.fsRoot.children!.home!.children!.student!.children!['b.txt']).toBeDefined()
    expect(loaded.fsRoot.children!.home!.children!.student!.children!['a.txt']).toBeUndefined()
  })

  it('clearSave 清空 UI 与所有课程存档', () => {
    writeLabState('a', createInitialState())
    writeLabState('b', createInitialState())
    writeSave({ currentLabId: 'a', completed: ['a'], hints: {}, theme: 'dark' })
    clearSave()
    expect(loadLabState('a')).toBeNull()
    expect(loadLabState('b')).toBeNull()
    expect(loadSave()).toBeNull()
  })
})

describe('学习模式持久化', () => {
  it('保存并恢复实战模式', () => {
    writeSave({ currentLabId: 'a', completed: [], hints: {}, theme: 'dark', mode: 'practice' })
    expect(loadSave()!.mode).toBe('practice')
  })

  it('旧存档没有 mode 时默认引导模式', () => {
    localStorage.setItem('cmdstudy-save-v1', JSON.stringify({ currentLabId: 'a', completed: [], hints: {}, theme: 'dark' }))
    expect(loadSave()!.mode).toBe('guided')
  })
})

describe('旧格式迁移', () => {
  it('含 state 的旧存档迁移为课程存档', () => {
    const s = createInitialState()
    putFile(s, 'legacy.txt')
    localStorage.setItem(
      'cmdstudy-save-v1',
      JSON.stringify({ currentLabId: 'linux-redirect', completed: [], hints: {}, theme: 'dark', state: s }),
    )
    const ui = loadSave()
    expect(ui?.currentLabId).toBe('linux-redirect')
    const migrated = loadLabState('linux-redirect')
    expect(migrated).not.toBeNull()
    expect(migrated!.fsRoot.children!.home!.children!.student!.children!['legacy.txt']).toBeDefined()
    const raw = localStorage.getItem('cmdstudy-save-v1')!
    expect(raw.includes('"state"')).toBe(false)
  })

  it('旧存档缺少 exitCodes 时也能正常执行命令', () => {
    const s = createInitialState()
    const { exitCodes, ...legacy } = JSON.parse(JSON.stringify(s)) as SimState & { exitCodes: number[] }
    void exitCodes
    localStorage.setItem(
      'cmdstudy-state-linux-cd',
      JSON.stringify({ savedAt: Date.now(), state: legacy }),
    )
    const restored = restoreState(loadLabState('linux-cd')!)
    expect(restored.exitCodes).toEqual([])
    const session = new ShellSession(restored)
    const r = session.execute('cd projects')
    expect(r.exitCode).toBe(0)
    expect(restored.exitCodes).toEqual([0])
  })
})

describe('兜底清理', () => {
  it('超过上限时删除最久未访问的课程存档', async () => {
    const big = createInitialState()
    putFile(big, 'big.bin', 'x'.repeat(700 * 1024))
    writeLabState('a', big)
    await new Promise((r) => setTimeout(r, 20))
    writeLabState('b', big)
    await new Promise((r) => setTimeout(r, 20))
    writeLabState('c', big)
    expect(loadLabState('a')).toBeNull()
    expect(loadLabState('b')).toBeNull()
    expect(loadLabState('c')).not.toBeNull()
  })

  it('未超限时全部保留', () => {
    writeLabState('a', createInitialState())
    writeLabState('b', createInitialState())
    writeLabState('c', createInitialState())
    expect(loadLabState('a')).not.toBeNull()
    expect(loadLabState('b')).not.toBeNull()
    expect(loadLabState('c')).not.toBeNull()
  })
})
