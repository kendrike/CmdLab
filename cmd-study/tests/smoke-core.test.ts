import { describe, expect, it } from 'vitest'
import { createInitialState, addRunningContainer } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'

initCommands()

describe('浏览器冒烟场景对应的核心断言', () => {
  it('docker rmi 输出 Untagged', () => {
    const s = new ShellSession(createInitialState())
    addRunningContainer(s.state, 'web', 'nginx:latest', 8080, 80)
    s.execute('docker stop web')
    s.execute('docker rm web')
    const r = s.execute('docker rmi nginx')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Untagged: nginx:latest')
    expect(r.stdout).toContain('Deleted: sha256:')
  })

  it('docker run -d 输出 12 位容器 ID', () => {
    const s = new ShellSession(createInitialState())
    const r = s.execute('docker run -d --name web -p 8080:80 nginx')
    expect(r.exitCode).toBe(0)
    expect(/^[0-9a-f]{12}$/m.test(r.stdout)).toBe(true)
  })

  it('crashloop 修复后 rollout status 成功', () => {
    const s = new ShellSession(createInitialState())
    s.execute('kubectl create deployment broken --image=crashy-app:1.0')
    s.execute('kubectl set image deployment/broken broken=nginx')
    const r = s.execute('kubectl rollout status deployment broken')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('successfully rolled out')
  })

  it('apply -f 创建 2 个 Pod', () => {
    const s = new ShellSession(createInitialState())
    s.execute("cat > app.yaml <<'EOF'")
    s.execute('apiVersion: apps/v1')
    s.execute('kind: Deployment')
    s.execute('metadata:')
    s.execute('  name: app')
    s.execute('spec:')
    s.execute('  replicas: 2')
    s.execute('  template:')
    s.execute('    spec:')
    s.execute('      containers:')
    s.execute('        - name: app')
    s.execute('          image: nginx')
    s.execute('EOF')
    s.execute('kubectl apply -f app.yaml')
    s.execute('kubectl get pods')
    const appPods = s.state.k8s.pods.filter((p) => p.owner === 'app')
    expect(appPods.length).toBe(2)
    expect(appPods.every((p) => p.status === 'Running')).toBe(true)
  })
})
