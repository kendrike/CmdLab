import { BookOpen, Menu, Moon, RotateCcw, Sun, Terminal } from 'lucide-react'

interface ToolbarProps {
  mode: 'linux' | 'docker' | 'kubernetes'
  completedCount: number
  totalCount: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onReset: () => void
  onHelp: () => void
  onToggleNav: () => void
  onToggleTask: () => void
  isMobile: boolean
  labTitle: string
}

export default function Toolbar({
  mode,
  completedCount,
  totalCount,
  theme,
  onToggleTheme,
  onReset,
  onHelp,
  onToggleNav,
  onToggleTask,
  isMobile,
  labTitle,
}: ToolbarProps) {
  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="toolbar-left">
        {isMobile && (
          <button className="icon-btn" onClick={onToggleNav} data-testid="open-nav" title="课程目录">
            <Menu size={16} />
          </button>
        )}
        <div className="brand">
          <Terminal size={16} />
          <span className="brand-name">CmdLab</span>
        </div>
        <span className={`mode-badge mode-${mode}`} data-testid="mode-badge">
          {mode === 'linux' ? 'Linux' : mode === 'docker' ? 'Docker' : 'Kubernetes'}
        </span>
        {!isMobile && <span className="toolbar-lab-title">{labTitle}</span>}
      </div>
      <div className="toolbar-right">
        {isMobile && (
          <button className="icon-btn" onClick={onToggleTask} data-testid="open-task" title="任务面板">
            <BookOpen size={16} />
          </button>
        )}
        <span className="progress-chip" data-testid="progress">
          进度 {completedCount}/{totalCount}
        </span>
        <button className="icon-btn" onClick={onReset} title="重置环境" data-testid="reset-btn">
          <RotateCcw size={16} />
        </button>
        <button className="icon-btn" onClick={onToggleTheme} title="切换主题" data-testid="theme-btn">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="icon-btn" onClick={onHelp} title="帮助" data-testid="help-btn">
          <BookOpen size={16} />
        </button>
      </div>
    </header>
  )
}
