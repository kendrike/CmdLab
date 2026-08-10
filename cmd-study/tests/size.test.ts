import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import { LABS } from '../src/courses/labs'

initCommands()

describe('状态大小估算', () => {
  it('单课程状态 JSON 大小', () => {
    const sizes: Record<string, number> = {}
    let max = 0
    let maxId = ''
    for (const lab of LABS) {
      const session = new ShellSession(lab.build())
      session.execute('echo hello > output.txt')
      session.execute('touch a.txt b.txt')
      const bytes = new TextEncoder().encode(JSON.stringify(session.state)).length
      sizes[lab.id] = bytes
      if (bytes > max) {
        max = bytes
        maxId = lab.id
      }
    }
    console.log('最大课程状态:', maxId, max, 'bytes')
    const total = Object.values(sizes).reduce((a, b) => a + b, 0)
    console.log('26 课全部保存合计:', total, 'bytes =', (total / 1024).toFixed(1), 'KB')
    console.log('localStorage 限额: 约 5MB')
    expect(max).toBeLessThan(200 * 1024)
  })
})
