import { describe, expect, it } from 'vitest'
import { LABS } from '../src/courses/labs'
import { TEACHING, teachingFor } from '../src/courses/teaching'

describe('50 节课程教学数据完整性', () => {
  it('每一课都有教学数据', () => {
    for (const lab of LABS) {
      expect(teachingFor(lab.id), lab.id).toBeDefined()
    }
  })

  it('教学数据键与课程 id 一一对应（无多余无遗漏）', () => {
    const ids = new Set(LABS.map((l) => l.id))
    for (const key of Object.keys(TEACHING)) {
      expect(ids.has(key), `多余的教学数据键: ${key}`).toBe(true)
    }
    expect(Object.keys(TEACHING)).toHaveLength(LABS.length)
  })

  it('每课基础字段非空', () => {
    for (const lab of LABS) {
      const t = teachingFor(lab.id)!
      expect(t.scenario.length, lab.id).toBeGreaterThan(10)
      expect(t.whyItMatters.length, lab.id).toBeGreaterThan(10)
      expect(t.commandSelection.length, lab.id).toBeGreaterThan(10)
    }
  })

  it('每课观察/推理/迁移/思考题数量达标', () => {
    for (const lab of LABS) {
      const t = teachingFor(lab.id)!
      expect(t.observationGuide.length, `${lab.id} observationGuide`).toBeGreaterThanOrEqual(2)
      expect(t.reasoningSteps.length, `${lab.id} reasoningSteps`).toBeGreaterThanOrEqual(2)
      expect(t.transferRules.length, `${lab.id} transferRules`).toBeGreaterThanOrEqual(3)
      expect(t.reflectionQuestions.length, `${lab.id} reflectionQuestions`).toBeGreaterThanOrEqual(2)
    }
  })

  it('每课五级提示齐全且逐级递进（L5 含命令，L1 不含命令）', () => {
    const L1_CMD_RE = /\b(pwd|ls|cd|cat|grep|find|docker|kubectl)\b/
    const ANSWER_RE = /docker run|docker ps|docker (pull|build|compose|network|volume|exec|logs|stop|start|rm|rmi|images)|kubectl |\b(pwd|ls|cd|cat|head|tail|grep|find|wc|sort|uniq|cut|chmod|chown|mkdir|touch|cp|mv|rm|echo|gzip|gunzip|tar|ps|top|kill|ping|curl|ss|systemctl|id|env|export|history|clear)\b/
    for (const lab of LABS) {
      const h = teachingFor(lab.id)!.hintLevels
      for (const key of ['goal', 'think', 'commandType', 'syntax', 'answer'] as const) {
        expect(h[key].length, `${lab.id} ${key}`).toBeGreaterThan(0)
      }
      expect(h.goal, `${lab.id} goal 不含命令`).not.toMatch(L1_CMD_RE)
      expect(h.answer, `${lab.id} answer 含完整命令`).toMatch(ANSWER_RE)
    }
  })

  it('每课完成反馈五个字段非空', () => {
    for (const lab of LABS) {
      const c = teachingFor(lab.id)!.completion
      expect(c.solved.length, lab.id).toBeGreaterThan(5)
      expect(c.clue.length, lab.id).toBeGreaterThan(5)
      expect(c.why.length, lab.id).toBeGreaterThan(5)
      expect(c.reuse.length, lab.id).toBeGreaterThan(5)
      expect(c.relatedCommand.length, lab.id).toBeGreaterThan(5)
    }
  })
})
