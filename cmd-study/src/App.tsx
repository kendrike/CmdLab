import { useEffect, useMemo, useRef, useState } from 'react'
import { LABS, findLab, nextLabId } from './courses/labs'
import { evaluateLab } from './courses/validate'
import { initCommands } from './sim/commands'
import { ShellSession } from './sim/shell/session'
import { restoreState } from './sim/state/build'
import { clearSave, loadLabState, loadSave, writeLabState, writeSave } from './sim/persistence'
import type { LearningMode } from './sim/persistence'
import { useMediaQuery } from './hooks/useMediaQuery'
import CourseSidebar from './ui/CourseSidebar'
import CodeEditor from './ui/CodeEditor'
import TaskPanel from './ui/TaskPanel'
import TerminalPane from './ui/TerminalPane'
import Toolbar from './ui/Toolbar'
import HelpModal from './ui/HelpModal'
import { coachError } from './courses/errorCoach'
import type { CoachAdvice } from './courses/errorCoach'
import { explainCommand, explainOutput } from './courses/commandExplain'
import type { CommandExplain, TableField } from './courses/commandExplain'
import { teachingFor } from './courses/teaching'
import { hintGroups } from './courses/hintSystem'

initCommands()

interface UiState {
  labId: string
  completed: string[]
  hints: Record<string, number>
  theme: 'dark' | 'light'
  mode: LearningMode
  checkMessage: string | null
  checkFailed: boolean
  navOpen: boolean
  taskOpen: boolean
  helpOpen: boolean
  editorTab: 'terminal' | 'dockerfile' | 'compose' | 'yaml'
  lastError: { line: string; advice: CoachAdvice } | null
  lastExplain: { line: string; explain: CommandExplain | null; fields: TableField[] | null } | null
}

function initialUi(): UiState {
  const save = loadSave()
  document.documentElement.dataset['theme'] = save?.theme ?? 'dark'
  const validLabId = LABS.some((l) => l.id === save?.currentLabId) ? save!.currentLabId : LABS[0].id
  return {
    labId: validLabId,
    completed: save?.completed ?? [],
    hints: save?.hints ?? {},
    theme: save?.theme ?? 'dark',
    mode: save?.mode ?? 'guided',
    checkMessage: null,
    checkFailed: false,
    navOpen: false,
    taskOpen: false,
    helpOpen: false,
    editorTab: 'terminal',
    lastError: null,
    lastExplain: null,
  }
}

export default function App() {
  const isMobile = useMediaQuery('(max-width: 900px)')
  const [ui, setUi] = useState<UiState>(initialUi)
  const uiRef = useRef(ui)
  uiRef.current = ui
  const [resetSignal, setResetSignal] = useState(0)
  const [viewMode, setViewMode] = useState<'linux' | 'docker' | 'kubernetes'>(() => findLab(ui.labId).mode)
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode
  const sessionRef = useRef<ShellSession | null>(null)
  if (!sessionRef.current) {
    const stored = loadLabState(ui.labId)
    sessionRef.current = new ShellSession(stored ? restoreState(stored) : findLab(ui.labId).build())
  }

  const lab = useMemo(() => {
    const found = findLab(ui.labId)
    if (!found.teaching) found.teaching = teachingFor(found.id)
    return found
  }, [ui.labId])
  const evaluation = useMemo(() => evaluateLab(lab, sessionRef.current!.state), [lab, sessionRef.current!.state.history.length, ui.checkMessage])
  const done = evaluation.done

  useEffect(() => {
    if (done && !uiRef.current.completed.includes(ui.labId)) {
      update((u) => ({ ...u, completed: [...u.completed, u.labId], checkMessage: '✅ 所有步骤已完成，实验通过！', checkFailed: false }))
      persist()
    }
  }, [done])

  const persist = () => {
    const u = uiRef.current
    writeSave({
      currentLabId: u.labId,
      completed: u.completed,
      hints: u.hints,
      theme: u.theme,
      mode: u.mode,
    })
    writeLabState(u.labId, sessionRef.current!.state)
  }

  const update = (fn: (u: UiState) => UiState) => {
    const next = fn(uiRef.current)
    uiRef.current = next
    setUi(next)
  }

  const rebuildSession = (labId: string, savedState?: unknown) => {
    if (savedState) {
      sessionRef.current = new ShellSession(restoreState(savedState as Parameters<typeof restoreState>[0]))
      return
    }
    const stored = loadLabState(labId)
    sessionRef.current = new ShellSession(stored ? restoreState(stored) : findLab(labId).build())
  }

  const handleExecute = (line: string) => {
    const outcome = sessionRef.current!.execute(line)
    const currentLab = findLab(uiRef.current.labId)
    const evalResult = evaluateLab(currentLab, sessionRef.current!.state)
    if (evalResult.done && !uiRef.current.completed.includes(currentLab.id)) {
      update((u) => ({ ...u, completed: [...u.completed, currentLab.id] }))
    } else {
      const advice =
        outcome.exitCode !== 0
          ? coachError(currentLab, sessionRef.current!.state, {
              line,
              stdout: outcome.stdout,
              stderr: outcome.stderr,
              exitCode: outcome.exitCode,
            })
          : null
      const explain = explainCommand(line)
      const fields = explainOutput(line, outcome.stdout)
      update((u) => ({
        ...u,
        lastError: advice ? { line, advice } : null,
        lastExplain: { line, explain, fields },
      }))
    }
    persist()
    return outcome
  }

  const switchLab = (labId: string) => {
    writeLabState(uiRef.current.labId, sessionRef.current!.state)
    rebuildSession(labId)
    setResetSignal((s) => s + 1)
    update((u) => ({ ...u, labId, checkMessage: null, checkFailed: false, navOpen: false, lastError: null, lastExplain: null }))
    if (findLab(labId).mode !== viewModeRef.current) setViewMode(findLab(labId).mode)
    persist()
  }

  const resetLab = () => {
    sessionRef.current = new ShellSession(findLab(uiRef.current.labId).build())
    setResetSignal((s) => s + 1)
    update((u) => ({ ...u, checkMessage: null, checkFailed: false, lastError: null, lastExplain: null }))
    persist()
  }

  const requestHint = () => {
    update((u) => {
      const groups = hintGroups(lab)
      const level = Math.min(groups.length, (u.hints[u.labId] ?? 0) + 1)
      return { ...u, hints: { ...u.hints, [u.labId]: level } }
    })
    persist()
  }

  const toggleMode = () => {
    update((u) => ({ ...u, mode: u.mode === 'guided' ? 'practice' : 'guided' }))
    persist()
  }

  const dismissError = () => {
    update((u) => ({ ...u, lastError: null }))
  }

  const checkAnswer = () => {
    const evalResult = evaluateLab(lab, sessionRef.current!.state)
    if (evalResult.done) {
      update((u) => ({
        ...u,
        completed: u.completed.includes(u.labId) ? u.completed : [...u.completed, u.labId],
        checkMessage: '✅ 所有步骤已完成，实验通过！',
        checkFailed: false,
      }))
    } else {
      const undone = evalResult.steps.filter((s) => !s.done)
      update((u) => ({
        ...u,
        checkMessage: `❌ 还有 ${undone.length} 个步骤未完成：${undone.map((s) => s.label).join('；')}`,
        checkFailed: true,
      }))
    }
    persist()
  }

  const next = () => {
    const nxt = nextLabId(ui.labId)
    if (nxt) switchLab(nxt)
  }

  const toggleTheme = () => {
    update((u) => {
      const theme = u.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset['theme'] = theme
      return { ...u, theme }
    })
    persist()
  }

  const resetAll = () => {
    clearSave()
    update((u) => ({ ...u, completed: [], hints: {}, checkMessage: null, checkFailed: false, lastError: null, lastExplain: null }))
    sessionRef.current = new ShellSession(findLab(LABS[0].id).build())
    setResetSignal((s) => s + 1)
    persist()
  }

  const stepResults = evaluation.steps
  const nxt = nextLabId(ui.labId)
  const isLast = nxt === null

  return (
    <div className="app">
      <Toolbar
        mode={lab.mode}
        completedCount={ui.completed.length}
        totalCount={LABS.length}
        theme={ui.theme}
        onToggleTheme={toggleTheme}
        onReset={resetLab}
        onHelp={() => update((u) => ({ ...u, helpOpen: true }))}
        onToggleNav={() => update((u) => ({ ...u, navOpen: !u.navOpen }))}
        onToggleTask={() => update((u) => ({ ...u, taskOpen: !u.taskOpen }))}
        isMobile={isMobile}
        labTitle={lab.title}
      />

      <div className="app-body">
        {!isMobile && (
          <aside className="sidebar" data-testid="sidebar">
            <CourseSidebar
              currentLabId={ui.labId}
              completed={ui.completed}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSelect={switchLab}
            />
          </aside>
        )}

        {isMobile && ui.navOpen && (
          <>
            <div className="drawer-backdrop" onClick={() => update((u) => ({ ...u, navOpen: false }))} />
            <aside className="drawer drawer-left" data-testid="drawer-nav">
              <CourseSidebar
                currentLabId={ui.labId}
                completed={ui.completed}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onSelect={switchLab}
              />
            </aside>
          </>
        )}

        <main className="terminal-area">
          <div className="terminal-tabs" role="tablist" data-testid="terminal-tabs">
            <button
              role="tab"
              aria-selected={ui.editorTab === 'terminal'}
              className={`terminal-tab${ui.editorTab === 'terminal' ? ' active' : ''}`}
              onClick={() => update((u) => ({ ...u, editorTab: 'terminal' }))}
              data-testid="tab-terminal"
            >
              终端
            </button>
            <button
              role="tab"
              aria-selected={ui.editorTab === 'dockerfile'}
              className={`terminal-tab${ui.editorTab === 'dockerfile' ? ' active' : ''}`}
              onClick={() => update((u) => ({ ...u, editorTab: 'dockerfile' }))}
              data-testid="tab-dockerfile"
            >
              Dockerfile
            </button>
            <button
              role="tab"
              aria-selected={ui.editorTab === 'compose'}
              className={`terminal-tab${ui.editorTab === 'compose' ? ' active' : ''}`}
              onClick={() => update((u) => ({ ...u, editorTab: 'compose' }))}
              data-testid="tab-compose"
            >
              compose.yaml
            </button>
            <button
              role="tab"
              aria-selected={ui.editorTab === 'yaml'}
              className={`terminal-tab${ui.editorTab === 'yaml' ? ' active' : ''}`}
              onClick={() => update((u) => ({ ...u, editorTab: 'yaml' }))}
              data-testid="tab-yaml"
            >
              k8s.yaml
            </button>
          </div>
          {ui.editorTab === 'terminal' ? (
            <TerminalPane
              sessionRef={sessionRef}
              theme={ui.theme}
              resetSignal={resetSignal}
              mode={lab.mode}
              onExecute={handleExecute}
              lastError={ui.lastError}
              lastExplain={ui.lastExplain}
              onDismissError={dismissError}
            />
          ) : (
            <CodeEditor
              sessionRef={sessionRef}
              fileId={ui.editorTab}
              onChanged={persist}
              onSwitchFile={(id) => update((u) => ({ ...u, editorTab: id as 'dockerfile' | 'compose' | 'yaml' }))}
            />
          )}
        </main>

        {!isMobile && (
          <aside className="task-panel" data-testid="task-panel">
            <TaskPanel
              lab={lab}
              stepResults={stepResults}
              done={done}
              hintLevel={ui.hints[ui.labId] ?? 0}
              onHint={requestHint}
              onCheck={checkAnswer}
              onNext={next}
              onRestart={resetLab}
              hasNext={!!nxt}
              isLast={isLast}
              checkMessage={ui.checkMessage}
              checkFailed={ui.checkFailed}
              mode={ui.mode}
              onToggleMode={toggleMode}
            />
          </aside>
        )}

        {isMobile && ui.taskOpen && (
          <>
            <div className="drawer-backdrop" onClick={() => update((u) => ({ ...u, taskOpen: false }))} />
            <aside className="drawer drawer-right" data-testid="drawer-task">
              <TaskPanel
                lab={lab}
                stepResults={stepResults}
                done={done}
                hintLevel={ui.hints[ui.labId] ?? 0}
                onHint={requestHint}
                onCheck={checkAnswer}
                onNext={next}
                onRestart={resetLab}
                hasNext={!!nxt}
                isLast={isLast}
                checkMessage={ui.checkMessage}
                checkFailed={ui.checkFailed}
                mode={ui.mode}
                onToggleMode={toggleMode}
              />
            </aside>
          </>
        )}
      </div>

      {ui.helpOpen && (
        <HelpModal
          onClose={() => update((u) => ({ ...u, helpOpen: false }))}
          onResetAll={resetAll}
        />
      )}
    </div>
  )
}
