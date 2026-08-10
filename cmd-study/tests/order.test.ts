import { describe, expect, it } from 'vitest'
import { LABS } from '../src/courses/labs'

describe('课程顺序一致性', () => {
  it('相同 category 的课程在数组中必须连续（侧边栏分组顺序 = 下一个实验跳转顺序）', () => {
    for (const mode of ['linux', 'docker', 'kubernetes'] as const) {
      const labs = LABS.filter((l) => l.mode === mode)
      const seen: string[] = []
      for (const l of labs) {
        if (seen.length && seen[seen.length - 1] !== l.category) {
          expect(seen, `${mode} 模式 "${l.category}" 与上一分组 "${seen[seen.length - 1]}" 交错`).not.toContain(l.category)
        }
        if (!seen.includes(l.category)) seen.push(l.category)
      }
    }
  })
})
