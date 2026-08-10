import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Save, FileCode2 } from 'lucide-react'
import type { ShellSession } from '../sim/shell/session'
import { normalizePath, walk } from '../sim/vfs/paths'
import { getParent } from '../sim/vfs/paths'

export interface CodeEditorFile {
  id: string
  name: string
  template: string
}

export const EDITOR_FILES: CodeEditorFile[] = [
  { id: 'dockerfile', name: 'Dockerfile', template: '# 在此编写 Dockerfile\n# 支持指令：FROM / WORKDIR / COPY / RUN / EXPOSE / CMD / ENV / HEALTHCHECK\nFROM nginx\n' },
  { id: 'compose', name: 'compose.yaml', template: '# 在此编写 docker compose 配置\nversion: "3"\nservices:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n' },
  {
    id: 'yaml',
    name: 'k8s.yaml',
    template:
      '# 在此编写 Kubernetes 资源清单（多文档用 --- 分隔）\n# 支持 kind：Pod / Deployment / Service / ConfigMap / Secret / Namespace / Job / CronJob / PersistentVolume / PersistentVolumeClaim\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx\n',
  },
]

interface CodeEditorProps {
  sessionRef: RefObject<ShellSession>
  fileId: string
  onChanged: () => void
  onSwitchFile: (id: string) => void
}

export default function CodeEditor({ sessionRef, fileId, onChanged, onSwitchFile }: CodeEditorProps) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [fileName, setFileName] = useState('')
  const file = EDITOR_FILES.find((f) => f.id === fileId) ?? EDITOR_FILES[0]
  const loadedForRef = useRef('')
  const sessionRefAtLoad = useRef(sessionRef.current)
  const fileRef = useRef(file.name)
  fileRef.current = file.name

  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    const home = s.state.env['HOME'] ?? '/home/student'
    const abs = normalizePath(s.state.cwd, file.name, home)
    const node = walk(s.state.fsRoot, abs)
    if (node && node.kind === 'file') {
      setText(node.content)
    } else {
      setText(file.template)
    }
    setFileName(file.name)
    loadedForRef.current = file.name
    sessionRefAtLoad.current = s
    setSaved(false)
  }, [fileId, file.name, sessionRef])

  const save = () => {
    const s = sessionRef.current
    if (!s) return
    const name = (fileName.trim() || fileRef.current).replace(/^~\/|\//g, '')
    const home = s.state.env['HOME'] ?? '/home/student'
    const abs = normalizePath(s.state.cwd, name, home)
    const par = getParent(s.state.fsRoot, abs)
    if (!par || !par.parent.children) return
    const existing = walk(s.state.fsRoot, abs)
    if (existing && existing.kind === 'file') {
      existing.content = text
      existing.mtime = s.state.clock
    } else {
      par.parent.children[par.name] = {
        kind: 'file',
        name: par.name,
        content: text,
        mode: 0o644,
        uid: s.state.uid,
        gid: s.state.gids[0] ?? s.state.uid,
        mtime: s.state.clock,
      }
    }
    setSaved(true)
    onChanged()
  }

  const dirty = loadedForRef.current === file.name && sessionRefAtLoad.current === sessionRef.current

  return (
    <div className="editor-wrap">
      <div className="editor-tabs">
        {EDITOR_FILES.map((f) => (
          <button
            key={f.id}
            className={`editor-tab${f.id === file.id ? ' active' : ''}`}
            onClick={() => onSwitchFile(f.id)}
            data-testid={`editor-tab-${f.id}`}
          >
            <FileCode2 size={12} /> {f.name}
          </button>
        ))}
        <span className="editor-hint">保存后可在终端使用 docker build / docker compose / kubectl apply 读取</span>
      </div>
      <textarea
        className="editor-textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        spellCheck={false}
        data-testid="editor-textarea"
      />
      <div className="editor-footer">
        <span className="editor-filename-label">保存为</span>
        <input
          className="editor-filename"
          value={fileName}
          onChange={(e) => {
            setFileName(e.target.value)
            setSaved(false)
          }}
          spellCheck={false}
          data-testid="editor-filename"
        />
        <button className="btn btn-secondary" onClick={save} data-testid="editor-save">
          <Save size={14} /> 保存
        </button>
        {saved && dirty && <span className="editor-saved">已保存到 ~/{fileName || file.name}</span>}
        {!dirty && saved && <span className="editor-saved">已保存</span>}
      </div>
    </div>
  )
}
