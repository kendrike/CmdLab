export interface HintLevels {
  goal: string
  think: string
  commandType: string
  syntax: string
  answer: string
}

export interface CompletionFeedback {
  solved: string
  clue: string
  why: string
  reuse: string
  relatedCommand: string
}

export interface TeachingContent {
  scenario: string
  whyItMatters: string
  observationGuide: string[]
  reasoningSteps: string[]
  commandSelection: string
  transferRules: string[]
  reflectionQuestions: string[]
  hintLevels: HintLevels
  completion: CompletionFeedback
}

export const HINT_LEVEL_TITLES = ['重新理解目标', '思考方向', '命令类型', '命令结构', '完整答案'] as const

export function hintLevelTitle(index: number): string {
  return HINT_LEVEL_TITLES[Math.min(Math.max(index, 0), HINT_LEVEL_TITLES.length - 1)]
}

export function isAnswerLevel(index: number): boolean {
  return index >= HINT_LEVEL_TITLES.length - 1
}
