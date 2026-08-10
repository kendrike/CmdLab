import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Compass,
  Eye,
  EyeOff,
  Gauge,
  Lightbulb,
  ListChecks,
  Link2,
  Play,
  RotateCcw,
  Target,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { findLab } from '../courses/labs'
import type { Lab } from '../courses/validate'
import type { StepResult } from '../courses/validate'
import { hintButtonState, hintGroups, isAnswerRevealed } from '../courses/hintSystem'
import type { LearningMode } from '../sim/persistence'

interface TaskPanelProps {
  lab: Lab
  stepResults: StepResult[]
  done: boolean
  hintLevel: number
  onHint: () => void
  onCheck: () => void
  onNext: () => void
  onRestart: () => void
  hasNext: boolean
  isLast: boolean
  checkMessage: string | null
  checkFailed: boolean
  mode: LearningMode
  onToggleMode: () => void
}

const MODE_COLORS: Record<string, string> = {
  linux: 'mode-linux',
  docker: 'mode-docker',
  kubernetes: 'mode-kubernetes',
}

function GuideSection({
  title,
  children,
  defaultOpen,
  dataTestid,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  dataTestid?: string
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <section className="task-section guide-section" data-testid={dataTestid}>
      <button type="button" className="guide-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="guide-title">{title}</span>
        <ChevronDown size={14} className={`guide-chevron${open ? ' open' : ''}`} />
      </button>
      {open && <div className="guide-body">{children}</div>}
    </section>
  )
}

export default function TaskPanel({
  lab,
  stepResults,
  done,
  hintLevel,
  onHint,
  onCheck,
  onNext,
  onRestart,
  hasNext,
  isLast,
  checkMessage,
  checkFailed,
  mode,
  onToggleMode,
}: TaskPanelProps) {
  const doneCount = stepResults.filter((s) => s.done).length
  const percent = stepResults.length ? Math.round((doneCount / stepResults.length) * 100) : 0
  const t = lab.teaching
  const groups = hintGroups(lab)
  const answerRevealed = isAnswerRevealed(lab, hintLevel)
  const hintBtn = hintButtonState(lab, hintLevel)
  const guided = mode === 'guided'

  const renderHintItem = (text: string, i: number) => (
    <p key={i} className="hint-item" data-testid={`hint-${i}`}>
      {text}
    </p>
  )

  return (
    <div className="task-content">
      <div className="mode-switch" data-testid="mode-switch">
        <button
          type="button"
          className={`mode-switch-btn${guided ? ' active' : ''}`}
          onClick={guided ? undefined : onToggleMode}
          data-testid="mode-guided"
        >
          <Eye size={12} /> 引导模式
        </button>
        <button
          type="button"
          className={`mode-switch-btn${!guided ? ' active' : ''}`}
          onClick={!guided ? undefined : onToggleMode}
          data-testid="mode-practice"
        >
          <EyeOff size={12} /> 实战模式
        </button>
      </div>

      <div className="task-header">
        <span className={`mode-badge ${MODE_COLORS[lab.mode]}`}>
          {lab.mode === 'linux' ? 'Linux' : lab.mode === 'docker' ? 'Docker' : 'Kubernetes'}
        </span>
        <h2 data-testid="lab-title">{lab.title}</h2>
        <div className="task-meta" data-testid="lab-meta">
          <span className={`difficulty diff-${lab.difficulty}`}>
            <Gauge size={12} /> {lab.difficulty}
          </span>
          <span className="meta-item">
            <Clock size={12} /> 约 {lab.estimatedMinutes} 分钟
          </span>
          {lab.prerequisites.length > 0 && (
            <span className="meta-item">
              <Link2 size={12} /> 前置：{lab.prerequisites.map((p) => findLab(p).title).join('、')}
            </span>
          )}
        </div>
        <p className="task-description">{lab.description}</p>
      </div>

      {guided && t && (
        <GuideSection title="场景：为什么要做这件事" defaultOpen dataTestid="section-scenario">
          <p className="guide-text">{t.scenario}</p>
          <p className="guide-text guide-why">
            <strong>为什么重要：</strong>
            {t.whyItMatters}
          </p>
        </GuideSection>
      )}

      {guided && (
        <GuideSection title="知识摘要与初始环境" dataTestid="section-summary">
          <p className="task-summary" data-testid="lab-summary">{lab.summary}</p>
          <p className="guide-label">初始环境：</p>
          <p className="task-summary" data-testid="lab-initial-env">{lab.initialEnv}</p>
        </GuideSection>
      )}

      {guided && t && (
        <GuideSection title="观察与分析：先看什么、怎么想" dataTestid="section-observe">
          <p className="guide-label">先观察：</p>
          <ul className="guide-list">
            {t.observationGuide.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <p className="guide-label">思考线索（任务关键词 → 结论）：</p>
          <ul className="guide-list">
            {t.reasoningSteps.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <p className="guide-label">为什么是这条命令：</p>
          <p className="guide-text">{t.commandSelection}</p>
        </GuideSection>
      )}

      <section className="task-section">
        <h3>
          <Target size={14} /> 目标
        </h3>
        <ul className="goal-list">
          {lab.goals.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </section>

      <section className="task-section">
        <h3>
          任务步骤 <span className="step-count">{doneCount}/{stepResults.length}</span>
        </h3>
        <div className="progress-bar" data-testid="progress-bar">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <ul className="step-list">
          {stepResults.map((s) => (
            <li key={s.id} className={s.done ? 'step-done' : ''} data-testid={`step-${s.id}`}>
              {s.done ? <CheckCircle2 size={14} className="icon-done" /> : <Circle size={14} className="icon-todo" />}
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {done && (
        <div className="task-success" data-testid="lab-done">
          <CheckCircle2 size={16} /> 实验完成！
        </div>
      )}

      {done && t && (
        <GuideSection title="小结：这次你学会了什么" defaultOpen dataTestid="section-completion">
          <ul className="guide-list completion-list">
            <li>
              <strong>解决了什么：</strong>
              {t.completion.solved}
            </li>
            <li>
              <strong>判断线索：</strong>
              {t.completion.clue}
            </li>
            <li>
              <strong>为什么合适：</strong>
              {t.completion.why}
            </li>
            <li>
              <strong>以后何时再用：</strong>
              {t.completion.reuse}
            </li>
            <li>
              <strong>相关命令：</strong>
              {t.completion.relatedCommand}
            </li>
          </ul>
        </GuideSection>
      )}

      {guided && t && (
        <GuideSection title="规律总结：怎么想到这个命令" dataTestid="section-transfer">
          <ul className="guide-list">
            {t.transferRules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </GuideSection>
      )}

      <section className="task-section">
        <h3>
          <Lightbulb size={14} /> 提示
        </h3>
        {!guided && <p className="hint-empty">实战模式下提示默认收起，遇到困难可手动展开。</p>}
        {hintLevel === 0 ? (
          <p className="hint-empty">遇到困难时，点击下方按钮逐级获取提示。</p>
        ) : (
          <div className="hint-list" data-testid="hint-list">
            {groups.slice(0, hintLevel).flat().map(renderHintItem)}
            {answerRevealed && (
              <p className="hint-answer-note">答案已显示。展示答案不会直接完成课程——你仍然需要在终端实际执行，系统只按环境状态判定。</p>
            )}
          </div>
        )}
        <button className="btn btn-ghost" onClick={onHint} disabled={hintBtn.disabled} data-testid="hint-btn">
          <Lightbulb size={14} /> {hintBtn.label}
        </button>
      </section>

      {guided && t && (
        <GuideSection title="思考题：检验是否真的理解" dataTestid="section-reflection">
          <ul className="guide-list">
            {t.reflectionQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </GuideSection>
      )}

      <section className="task-section">
        <h3>
          <Wrench size={14} /> 常见错误
        </h3>
        <ul className="guide-list error-list">
          {lab.commonErrors.length === 0 ? (
            <li>暂无记录——出错时终端下方会出现新手解释。</li>
          ) : (
            lab.commonErrors.map((e, i) => (
              <li key={i}>
                <code>{e.cmd}</code>
                <span>：{e.explanation}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      {checkMessage && (
        <div className={`check-result${checkFailed ? ' check-fail' : ' check-pass'}`} data-testid="check-result">
          {checkMessage}
        </div>
      )}

      <div className="task-actions">
        <button className="btn btn-secondary" onClick={onCheck} data-testid="check-btn">
          <Play size={14} /> 检查答案
        </button>
        <button className="btn btn-secondary" onClick={onRestart} data-testid="restart-btn">
          <RotateCcw size={14} /> 重新开始
        </button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={!hasNext}
          data-testid="next-btn"
        >
          下一个实验
        </button>
      </div>
      {isLast && <p className="task-footer">这是最后一个实验，全部通关！</p>}
    </div>
  )
}
