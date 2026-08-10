import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'

initCommands()

function session() {
  return new ShellSession(createInitialState())
}

function podsOf(s: ShellSession, owner: string) {
  return s.state.k8s.pods.filter((p) => p.owner === owner)
}

describe('Kubernetes Deployment 扩缩容', () => {
  it('kubectl version 与 cluster-info', () => {
    const s = session()
    expect(s.execute('kubectl version').stdout).toContain('v1.29.3')
    expect(s.execute('kubectl cluster-info').stdout).toContain('6443')
  })

  it('kubectl get pods 显示预置 Pod', () => {
    const s = session()
    const r = s.execute('kubectl get pods -A')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('NAME')
    expect(r.stdout).toContain('Running')
  })

  it('create deployment 创建 1 个 Running Pod', () => {
    const s = session()
    const r = s.execute('kubectl create deployment web --image=nginx')
    expect(r.exitCode).toBe(0)
    const dep = s.state.k8s.deployments.find((d) => d.name === 'web')
    expect(dep).toBeDefined()
    expect(dep!.replicas).toBe(1)
    const pods = podsOf(s, 'web')
    expect(pods.length).toBe(1)
    expect(pods[0].status).toBe('Running')
  })

  it('scale 到 3 个副本，再缩回 1', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const r = s.execute('kubectl scale deployment web --replicas=3')
    expect(r.exitCode).toBe(0)
    expect(s.state.k8s.deployments.find((d) => d.name === 'web')!.replicas).toBe(3)
    expect(podsOf(s, 'web').length).toBe(3)
    expect(podsOf(s, 'web').every((p) => p.status === 'Running')).toBe(true)
    s.execute('kubectl scale deployment web --replicas=1')
    expect(podsOf(s, 'web').length).toBe(1)
  })

  it('重复创建报 AlreadyExists', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const r = s.execute('kubectl create deployment web --image=nginx')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('AlreadyExists')
  })

  it('expose deployment 创建 NodePort Service', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const r = s.execute('kubectl expose deployment web --port=80 --type=NodePort')
    expect(r.exitCode).toBe(0)
    const svc = s.state.k8s.services.find((sv) => sv.name === 'web')
    expect(svc).toBeDefined()
    expect(svc!.type).toBe('NodePort')
    expect(svc!.ports[0].port).toBe(80)
    expect(svc!.ports[0].nodePort).toBeGreaterThan(30000)
    expect(s.execute('kubectl get services').stdout).toContain('web')
  })

  it('rollout status 成功输出', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const r = s.execute('kubectl rollout status deployment web')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('successfully rolled out')
  })

  it('rollout restart 重建 Pod', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const before = podsOf(s, 'web')[0].name
    const r = s.execute('kubectl rollout restart deployment web')
    expect(r.exitCode).toBe(0)
    const after = podsOf(s, 'web')[0].name
    expect(after).not.toBe(before)
    expect(podsOf(s, 'web')[0].status).toBe('Running')
  })

  it('delete deployment 删除 Pod', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const r = s.execute('kubectl delete deployment web')
    expect(r.exitCode).toBe(0)
    expect(s.state.k8s.deployments.find((d) => d.name === 'web')).toBeUndefined()
    expect(podsOf(s, 'web').length).toBe(0)
  })

  it('get pods -n kube-system 按命名空间过滤', () => {
    const s = session()
    const r = s.execute('kubectl get pods -n kube-system')
    expect(r.stdout).toContain('coredns')
    expect(s.execute('kubectl get pods').stdout).not.toContain('coredns')
  })

  it('describe pod 输出详情', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const pod = podsOf(s, 'web')[0]
    const r = s.execute(`kubectl describe pod ${pod.name}`)
    expect(r.stdout).toContain('Name:')
    expect(r.stdout).toContain('Status:')
  })
})

describe('Kubernetes YAML apply', () => {
  it('apply -f 创建 Deployment（heredoc 写文件）', () => {
    const s = session()
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
    const r = s.execute('EOF')
    expect(r.exitCode).toBe(0)
    const apply = s.execute('kubectl apply -f app.yaml')
    expect(apply.exitCode).toBe(0)
    expect(apply.stdout).toContain('deployment.apps/app created')
    const dep = s.state.k8s.deployments.find((d) => d.name === 'app')
    expect(dep).toBeDefined()
    expect(dep!.replicas).toBe(2)
    expect(podsOf(s, 'app').length).toBe(2)
  })

  it('apply 支持管道 stdin（-f -）', () => {
    const s = session()
    const r = s.execute(
      "echo 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: hello\nspec:\n  containers:\n    - name: hello\n      image: nginx' | kubectl apply -f -",
    )
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('pod/hello created')
    expect(s.state.k8s.pods.some((p) => p.name === 'hello')).toBe(true)
  })

  it('无效 YAML 报教学错误', () => {
    const s = session()
    s.execute("cat > bad.yaml <<'EOF'")
    s.execute('kind: Deployment')
    s.execute('metadata:')
    s.execute('   name: x')
    const r = s.execute('EOF')
    void r
    const apply = s.execute('kubectl apply -f bad.yaml')
    expect(apply.exitCode).toBe(1)
    expect(apply.stderr).toContain('提示')
  })

  it('不支持的 kind 报错', () => {
    const s = session()
    s.execute("cat > ing.yaml <<'EOF'")
    s.execute('apiVersion: networking.k8s.io/v1')
    s.execute('kind: Ingress')
    s.execute('metadata:')
    s.execute('  name: web')
    s.execute('EOF')
    const apply = s.execute('kubectl apply -f ing.yaml')
    expect(apply.exitCode).toBe(1)
    expect(apply.stderr).toContain('no matches for kind "Ingress"')
  })

  it('CrashLoopBackOff 确定可复现，set image 修复', () => {
    const s = session()
    s.execute('kubectl create deployment broken --image=crashy-app:1.0')
    const pods = podsOf(s, 'broken')
    expect(pods.length).toBe(1)
    expect(pods[0].status).toBe('CrashLoopBackOff')
    expect(pods[0].ready).toBe('0/1')
    const rs = s.execute('kubectl rollout status deployment broken')
    expect(rs.exitCode).toBe(1)
    expect(rs.stderr).toContain('CrashLoopBackOff')
    const logs = s.execute(`kubectl logs ${pods[0].name}`)
    expect(logs.stdout).toContain('Error')
    const fix = s.execute('kubectl set image deployment/broken broken=nginx')
    expect(fix.exitCode).toBe(0)
    const fixed = podsOf(s, 'broken')[0]
    expect(fixed.status).toBe('Running')
    expect(s.execute('kubectl rollout status deployment broken').exitCode).toBe(0)
  })

  it('错误命令不会破坏状态', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const core = () => {
      const { history, exitCodes, clock, ...rest } = JSON.parse(JSON.stringify(s.state))
      void history
      void clock
      return JSON.stringify(rest)
    }
    const before = core()
    s.execute('kubectl get bogus')
    s.execute('kubectl scale deployment web --replicas=abc')
    s.execute('kubectl delete deployment missing')
    s.execute('kubectl expose deployment nope --port=80')
    expect(core()).toBe(before)
  })
})
