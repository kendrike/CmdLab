import type { TeachingContent } from './teaching/types'

export interface HintCarrier {
  hints: string[][]
  teaching?: TeachingContent
}

export const MAX_HINT_LEVELS = 5

export function hintGroups(carrier: HintCarrier): string[][] {
  if (carrier.teaching?.hintLevels) {
    const h = carrier.teaching.hintLevels
    return [[h.goal], [h.think], [h.commandType], [h.syntax], [h.answer]]
  }
  return carrier.hints
}

export function revealedHints(carrier: HintCarrier, level: number): string[] {
  const groups = hintGroups(carrier)
  const count = Math.min(level, groups.length)
  const flat: string[] = []
  for (let i = 0; i < count; i++) flat.push(...groups[i])
  return flat
}

export function hintButtonState(carrier: HintCarrier, level: number): { label: string; disabled: boolean; isAnswer: boolean } {
  const groups = hintGroups(carrier)
  if (level >= groups.length) return { label: '提示已全部给出', disabled: true, isAnswer: true }
  if (level === groups.length - 1) return { label: '显示答案', disabled: false, isAnswer: true }
  return { label: `请求提示（${level}/${groups.length}）`, disabled: false, isAnswer: false }
}

export function isAnswerRevealed(carrier: HintCarrier, level: number): boolean {
  return level >= hintGroups(carrier).length
}
