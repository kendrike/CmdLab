import { describe, expect, it } from 'vitest'
import { explainCommand, explainOutput } from '../src/courses/commandExplain'

describe('命令解析', () => {
  it('ls 逐段解释参数（含合并短选项）', () => {
    const e = explainCommand('ls -la /var/log')!
    expect(e.command).toBe('ls')
    expect(e.mnemonic).toContain('list')
    expect(e.args.some((a) => a.token === '/var/log' && a.meaning.includes('目录'))).toBe(true)
    const combined = e.args.find((a) => a.token === '-la')
    expect(combined).toBeDefined()
    expect(combined!.meaning).toContain('长格式')
    expect(combined!.meaning).toContain('隐藏文件')
  })

  it('docker run 参数逐段解释', () => {
    const e = explainCommand('docker run -d --name web -p 8080:80 nginx')!
    expect(e.args.length).toBeGreaterThanOrEqual(5)
    const flagD = e.args.find((a) => a.token === '-d')!.meaning
    expect(flagD).toContain('后台')
    const nameFlag = e.args.find((a) => a.token === '--name')!.meaning
    expect(nameFlag).toContain('名字')
    const pFlag = e.args.find((a) => a.token === '-p')!.meaning
    expect(pFlag).toContain('8080:80')
    const last = e.args[e.args.length - 1]
    expect(last.token).toBe('nginx')
    expect(last.meaning).toContain('镜像')
  })

  it('kubectl get 解释 -n 与 -o', () => {
    const e = explainCommand('kubectl get pods -n kube-system -o wide')!
    const n = e.args.find((a) => a.token === '-n')!.meaning
    expect(n).toContain('命名空间')
    const o = e.args.find((a) => a.token === '-o')!.meaning
    expect(o).toContain('wide')
  })

  it('cd 占位符与位置参数解释', () => {
    const e = explainCommand('cd <目录名>')!
    expect(e.args[0].isPlaceholder).toBe(true)
    expect(e.args[0].meaning).toContain('替换')
    const e2 = explainCommand('cd projects')!
    expect(e2.args[0].token).toBe('projects')
  })

  it('未知命令返回 null（无解释）', () => {
    expect(explainCommand('totally-unknown-cmd xyz')).toBeNull()
  })

  it('风险提示：rm / mv', () => {
    expect(explainCommand('rm -r trash')!.risk).toContain('不可恢复')
    expect(explainCommand('mv a.txt b.txt')!.risk).toContain('覆盖')
  })

  it('空行返回 null', () => {
    expect(explainCommand('')).toBeNull()
  })
})

describe('输出字段解释', () => {
  it('docker ps 表头字段', () => {
    const f = explainOutput('docker ps', 'CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES\nabc')!
    expect(f.length).toBeGreaterThan(3)
    expect(f.find((x) => x.field === 'STATUS')!.meaning).toContain('Up')
    expect(f.find((x) => x.field === 'PORTS')!.meaning).toContain('8080')
  })

  it('kubectl get pods 字段', () => {
    const f = explainOutput('kubectl get pods', 'NAME   READY   STATUS   RESTARTS   AGE\nweb-1   1/1     Running  0          5m')!
    const ready = f.find((x) => x.field === 'READY')!.meaning
    expect(ready).toContain('1/1')
    expect(f.find((x) => x.field === 'STATUS')!.meaning).toContain('CrashLoopBackOff')
  })

  it('kubectl get services 字段', () => {
    const f = explainOutput('kubectl get services', 'NAME TYPE CLUSTER-IP EXTERNAL-IP PORT(S) AGE')!
    expect(f.find((x) => x.field === 'PORT(S)')!.meaning).toContain('3xxxx')
  })

  it('get endpoints 空 endpoints 提示 selector 问题', () => {
    const f = explainOutput('kubectl get endpoints', 'NAME   ENDPOINTS   AGE')!
    expect(f.find((x) => x.field === 'ENDPOINTS')!.meaning).toContain('selector')
  })

  it('kubectl get pvc 字段', () => {
    const f = explainOutput('kubectl get pvc', 'NAME STATUS CAPACITY ACCESS MODES STORAGECLASS VOLUME')!
    expect(f.find((x) => x.field === 'STATUS')!.meaning).toContain('Bound')
  })

  it('无法识别的输出返回 null', () => {
    expect(explainOutput('echo hello', 'hello')).toBeNull()
  })
})
