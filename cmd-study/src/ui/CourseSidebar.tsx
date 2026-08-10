import { CheckCircle2, Circle, Terminal } from 'lucide-react'
import { CATEGORIES, LABS } from '../courses/labs'
import type { Lab } from '../courses/validate'

export type ViewMode = 'linux' | 'docker' | 'kubernetes'

export const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'linux', label: 'Linux' },
  { id: 'docker', label: 'Docker' },
  { id: 'kubernetes', label: 'Kubernetes' },
]

interface CourseSidebarProps {
  currentLabId: string
  completed: string[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onSelect: (labId: string) => void
}

export default function CourseSidebar({
  currentLabId,
  completed,
  viewMode,
  onViewModeChange,
  onSelect,
}: CourseSidebarProps) {
  const visible = LABS.filter((l: Lab) => l.mode === viewMode)
  return (
    <div className="sidebar-content">
      <div className="sidebar-header">
        <Terminal size={16} />
        <span>课程目录</span>
      </div>
      <div className="mode-tabs" role="tablist" data-testid="mode-tabs">
        {VIEW_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={m.id === viewMode}
            className={`mode-tab${m.id === viewMode ? ` active mode-tab-${m.id}` : ''}`}
            onClick={() => onViewModeChange(m.id)}
            data-testid={`mode-tab-${m.id}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <nav className="course-list" data-testid="course-nav">
        {CATEGORIES.map((category) => {
          const labs = visible.filter((l) => l.category === category)
          if (labs.length === 0) return null
          return (
            <div className="course-group" key={category}>
              <div className="course-category">{category}</div>
              {labs.map((lab) => {
                const active = lab.id === currentLabId
                const done = completed.includes(lab.id)
                return (
                  <button
                    key={lab.id}
                    className={`course-item${active ? ' active' : ''}`}
                    onClick={() => onSelect(lab.id)}
                    data-testid={`lab-${lab.id}`}
                  >
                    {done ? (
                      <CheckCircle2 size={14} className="icon-done" />
                    ) : (
                      <Circle size={14} className="icon-todo" />
                    )}
                    <span className="course-item-title">{lab.title}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
        {visible.length === 0 && <p className="sidebar-empty">该模式下暂无实验</p>}
      </nav>
    </div>
  )
}
