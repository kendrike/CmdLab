import { describe, expect, it } from 'vitest'
import { coachError } from '../src/courses/errorCoach'
import { findLab } from '../src/courses/labs'
import { createInitialState, addRunningContainer } from '../src/sim/state/build'
import type { SimState } from '../src/sim/types'

function putFile(s: SimState, name: string, content = 'hello'): void {
  s.fsRoot.children!['home']!.children!['student']!.children![name] = {
    kind: 'file',
    name,
    content,
    mode: 0o644,
    uid: 1000,
    gid: 1000,
    mtime: 1,
  }
}

function makeLab(id: string): ReturnType<typeof findLab> {
  const lab = findLab(id)
  return { ...lab, build: lab.build }
}

function coach(labId: string, line: string, stderr: string, exitCode = 1): ReturnType<typeof coachError> {
  const state: SimState = createInitialState()
  return coachError(makeLab(labId), state, { line, stdout: '', stderr, exitCode })
}

describe('错误识别：Linux', () => {
  it('命令拼写错误 → command-not-found + 相近命令建议', () => {
    const a = coach('linux-pwd', 'poewr', 'bash: poewr: command not found', 127)!
    expect(a.kind).toBe('command-not-found')
    expect(a.summary).toContain('poewr')
    expect(a.checkFirst.join(' ')).toMatch(/help/)
  })

  it('cat 文件不存在 → 建议先 pwd + ls', () => {
    const a = coach('linux-text-view', 'cat app.log', 'cat: app.log: No such file or directory')!
    expect(a.kind).toBe('no-such-file')
    expect(a.checkFirst.join(' ')).toContain('pwd')
    expect(a.checkFirst.join(' ')).toContain('ls')
    expect(a.nextStep).not.toContain('创建')
  })

  it('cd 目录不存在 → 针对性建议', () => {
    const a = coach('linux-cd', 'cd projects', 'bash: cd: projects: No such file or directory')!
    expect(a.kind).toBe('no-such-file')
    expect(a.checkFirst.join(' ')).toContain('ls')
  })

  it('权限不足 → 建议 ls -l / chmod', () => {
    const a = coach('linux-chmod', 'cat secret.txt', 'cat: secret.txt: Permission denied')!
    expect(a.kind).toBe('permission-denied')
    expect(a.checkFirst.join(' ')).toContain('ls -l')
    expect(a.nextStep).toContain('chmod')
  })

  it('cat 目录 → Is a directory', () => {
    const a = coach('linux-ls', 'cat projects', 'cat: projects: Is a directory')!
    expect(a.kind).toBe('is-directory')
    expect(a.nextStep).toContain('ls')
  })

  it('缺参数 → missing operand', () => {
    const a = coach('linux-touch-mkdir', 'cp', 'cp: missing operand')!
    expect(a.kind).toBe('missing-operand')
  })

  it('非法选项 → bad-option', () => {
    const a = coach('linux-ls', 'ls --colr', "ls: unrecognized option '--colr'")!
    expect(a.kind).toBe('bad-option')
  })

  it('curl 连接拒绝 → Connection refused', () => {
    const a = coach('linux-network', 'curl http://localhost:8080/', 'curl: (7) Failed to connect to localhost port 8080: Connection refused')!
    expect(a.kind).toBe('connection-refused')
    expect(a.checkFirst.join(' ')).toContain('ss -tlnp')
  })

  it('服务日志权限 → log-permission', () => {
    const a = coach('linux-troubleshoot', 'systemctl start webapp', 'Failed to open log file /var/log/webapp/app.log: Permission denied')!
    expect(a.kind).toBe('log-permission')
    expect(a.nextStep).toContain('chmod')
  })

  it('成功命令不返回错误辅导', () => {
    expect(coach('linux-pwd', 'pwd', '', 0)).toBeNull()
  })
})

describe('错误识别：Docker', () => {
  it('端口冲突', () => {
    const a = coach('docker-ports', 'docker run -d --name web2 -p 8080:80 nginx', 'docker: Error response from daemon: driver failed programming external connectivity: Error starting userland proxy: listen tcp4 0.0.0.0:8080: bind: address already in use.')!
    expect(a.kind).toBe('port-conflict')
    expect(a.nextStep).toMatch(/8081|停止/)
  })

  it('容器不存在 → 建议 docker ps -a', () => {
    const a = coach('docker-lifecycle', 'docker stop web', 'docker: Error response from daemon: No such container: web')!
    expect(a.kind).toBe('no-such-container')
    expect(a.checkFirst.join(' ')).toContain('docker ps -a')
  })

  it('容器已停止 → 建议 docker start', () => {
    const a = coach('docker-logs-stop', 'docker exec web ls /', 'docker: Error response from daemon: Container web is not running')!
    expect(a.kind).toBe('container-stopped')
    expect(a.nextStep).toContain('docker start')
  })

  it('名称冲突 → already exists', () => {
    const a = coach('docker-run-nginx', 'docker run -d --name web nginx', 'docker: Error response from daemon: Conflict. The container name "/web" is already in use')!
    expect(a.kind).toBe('name-conflict')
  })
})

describe('错误识别：Kubernetes', () => {
  it('命名空间不存在', () => {
    const a = coach('k8s-app', 'kubectl get pods -n prod', 'Error from server (NotFound): namespaces "prod" not found')!
    expect(a.kind).toBe('namespace-not-found')
    expect(a.nextStep).toContain('create namespace')
  })

  it('资源不存在', () => {
    const a = coach('k8s-pods', 'kubectl get pod hello', 'Error from server (NotFound): pods "hello" not found')!
    expect(a.kind).toBe('resource-not-found')
    expect(a.checkFirst.join(' ')).toContain('kubectl get')
  })

  it('未知类型 → 通用建议（含 fallback）', () => {
    const a = coach('k8s-intro', 'kubectl frobnicate', 'error: unknown command "frobnicate" for "kubectl"')!
    expect(a.kind).toBe('unknown')
    expect(a.nextStep.length).toBeGreaterThan(0)
  })
})

describe('错误辅导结合当前环境状态', () => {
  it('No such file 时给出更贴近环境的建议（结合存在的目录）', () => {
    const state = createInitialState()
    const lab = makeLab('linux-text-view')
    putFile(state, 'data.txt')
    const a = coachError(lab, state, { line: 'cat app.log', stdout: '', stderr: 'cat: app.log: No such file or directory', exitCode: 1 })!
    expect(a.kind).toBe('no-such-file')
    expect(a.checkFirst.join(' ')).toContain('ls')
  })
})

describe('错误辅导中的状态接口', () => {
  it('接受 docker 运行状态上下文', () => {
    const state = createInitialState()
    addRunningContainer(state, 'web', 'nginx', 8080, 80)
    const a = coachError(makeLab('docker-ports'), state, {
      line: 'docker run -d --name web2 -p 8080:80 nginx',
      stdout: '',
      stderr: 'docker: Error response from daemon: port is already allocated',
      exitCode: 1,
    })!
    expect(a.kind).toBe('port-conflict')
  })
})
