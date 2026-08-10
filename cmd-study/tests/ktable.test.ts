import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'

initCommands()

describe('k8s get 表格对齐', () => {
  it('所有资源表头与数据列对齐', () => {
    const s = new ShellSession(createInitialState())
    s.execute('kubectl create deployment web --image=nginx --replicas=3')
    s.execute('kubectl expose deployment web --port=80 --type=NodePort')
    s.execute('kubectl create configmap app-config --from-literal=APP_MODE=prod')
    s.execute('kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123')
    s.execute('kubectl create job hello --image=busybox')
    s.execute('kubectl create namespace prod')
    s.execute('kubectl get pods')
    s.execute('kubectl get rs')
    const kinds = ['pods', 'deployments', 'services', 'configmaps', 'secrets', 'namespaces', 'nodes', 'replicasets', 'jobs', 'events', 'endpoints']
    for (const k of kinds) {
      const r = s.execute(`kubectl get ${k}`)
      if (r.exitCode !== 0 || r.stdout.trim().length === 0) continue
      const [h, ...rows] = r.stdout.trimEnd().split('\n')
      if (rows.length === 0) continue
      const cols = h.trim().split(/\s+/)
      const starts: number[] = []
      let pos = 0
      for (const col of cols) {
        const w = h.indexOf(col, pos) - pos
        starts.push(pos)
        pos += w
      }
      for (const row of rows) {
        for (let i = 1; i < cols.length - 1; i++) {
          const start = starts[i]
          const cell = row.slice(start, starts[i + 1]).trim()
          if (cell) {
            expect(row[start] === ' ' && row.slice(start).trimStart().startsWith(cell) === false ? row[start] : row[start], `${k} 第 ${i} 列("${cols[i]}") 错位: ${row}`).not.toBe(' ')
          }
        }
      }
    }
  })
})
