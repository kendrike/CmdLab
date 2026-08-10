import type { TeachingContent } from './types'
import { LINUX_TEACHING } from './linuxData'
import { DOCKER_TEACHING } from './dockerData'
import { K8S_TEACHING } from './k8sData'

export type { TeachingContent, HintLevels, CompletionFeedback } from './types'
export { HINT_LEVEL_TITLES, hintLevelTitle, isAnswerLevel } from './types'

export const TEACHING: Record<string, TeachingContent> = {
  ...LINUX_TEACHING,
  ...DOCKER_TEACHING,
  ...K8S_TEACHING,
}

export function teachingFor(id: string): TeachingContent | undefined {
  return TEACHING[id]
}
