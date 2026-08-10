import { describe, expect, it } from 'vitest'
import { findLab } from '../src/courses/labs'
import { hintButtonState, hintGroups, isAnswerRevealed, revealedHints } from '../src/courses/hintSystem'
import { teachingFor } from '../src/courses/teaching'
import type { TeachingContent } from '../src/courses/teaching'

function withTeaching(id: string) {
  const lab = findLab(id)
  return { hints: lab.hints, teaching: teachingFor(id) }
}

function legacy(id: string) {
  const lab = findLab(id)
  return { hints: lab.hints, teaching: undefined as TeachingContent | undefined }
}

describe('五级提示系统（教学模式下 5 级）', () => {
  it('hintGroups 返回 5 个分级数组', () => {
    const groups = hintGroups(withTeaching('linux-pwd'))
    expect(groups).toHaveLength(5)
    for (const g of groups) expect(g.length).toBeGreaterThan(0)
  })

  it('逐级解锁：level=n 只显示前 n 级', () => {
    const carrier = withTeaching('linux-pwd')
    expect(revealedHints(carrier, 0)).toEqual([])
    const l1 = revealedHints(carrier, 1)
    expect(l1.length).toBeGreaterThan(0)
    expect(l1.join('')).not.toMatch(/pwd|whoami/)
    expect(revealedHints(carrier, 2).length).toBeGreaterThan(l1.length)
  })

  it('第一级（goal）不含命令名', () => {
    for (const id of ['linux-pwd', 'docker-run-nginx', 'k8s-intro']) {
      const goal = hintGroups(withTeaching(id))[0][0]
      expect(goal).toBeTruthy()
      expect(goal).not.toMatch(/\b(pwd|ls|cd|docker|kubectl)\b/)
    }
  })

  it('第 5 级（答案）包含完整命令', () => {
    const answer = hintGroups(withTeaching('linux-pwd'))[4][0]
    expect(answer).toMatch(/pwd/)
  })

  it('按钮状态：渐进 → 显示答案 → 已全部给出', () => {
    const carrier = withTeaching('linux-pwd')
    expect(hintButtonState(carrier, 0).label).toContain('请求提示')
    expect(hintButtonState(carrier, 0).isAnswer).toBe(false)
    expect(hintButtonState(carrier, 4)).toMatchObject({ label: '显示答案', isAnswer: true, disabled: false })
    expect(hintButtonState(carrier, 5)).toMatchObject({ disabled: true })
    expect(isAnswerRevealed(carrier, 5)).toBe(true)
    expect(isAnswerRevealed(carrier, 4)).toBe(false)
  })
})

describe('兼容：无教学数据时回退到旧 hints', () => {
  it('hintGroups 直接返回 lab.hints', () => {
    const carrier = legacy('linux-pwd')
    expect(hintGroups(carrier)).toBe(carrier.hints)
  })

  it('按钮在最后一组之前为渐进，最后一组为答案', () => {
    const carrier = legacy('linux-pwd')
    const n = carrier.hints.length
    expect(hintButtonState(carrier, 0).isAnswer).toBe(false)
    expect(hintButtonState(carrier, n - 1)).toMatchObject({ label: '显示答案' })
    expect(hintButtonState(carrier, n)).toMatchObject({ disabled: true })
  })

  it('已显示的提示不改变课程数据', () => {
    const carrier = legacy('linux-pwd')
    const before = JSON.stringify(carrier.hints)
    revealedHints(carrier, 3)
    expect(JSON.stringify(carrier.hints)).toBe(before)
  })
})

describe('答案展示不影响完成条件', () => {
  it('revealedHints 是纯函数，不改状态', () => {
    const carrier = withTeaching('linux-pwd')
    const groupsBefore = JSON.stringify(hintGroups(carrier))
    revealedHints(carrier, 5)
    expect(JSON.stringify(hintGroups(carrier))).toBe(groupsBefore)
  })
})
