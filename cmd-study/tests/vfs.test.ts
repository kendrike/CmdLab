import { describe, expect, it } from 'vitest'
import { normalizePath, walk, globRegex } from '../src/sim/vfs/paths'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'

initCommands()

function session() {
  return new ShellSession(createInitialState())
}

describe('路径解析', () => {
  const home = '/home/student'

  it('解析相对路径', () => {
    expect(normalizePath('/home/student', 'projects', home)).toBe('/home/student/projects')
    expect(normalizePath('/home/student', './notes.txt', home)).toBe('/home/student/notes.txt')
    expect(normalizePath('/home/student', '..', home)).toBe('/home')
  })

  it('解析 .. 到根目录后不再上升', () => {
    expect(normalizePath('/', '..', home)).toBe('/')
    expect(normalizePath('/home', '../..', home)).toBe('/')
  })

  it('解析绝对路径与 ~', () => {
    expect(normalizePath('/var', '/etc/hosts', home)).toBe('/etc/hosts')
    expect(normalizePath('/var', '~', home)).toBe('/home/student')
    expect(normalizePath('/var', '~/projects', home)).toBe('/home/student/projects')
  })

  it('折叠重复斜杠与 .', () => {
    expect(normalizePath('/home', 'student//projects/./lab', home)).toBe('/home/student/projects/lab')
  })

  it('walk 能定位节点', () => {
    const s = createInitialState()
    expect(walk(s.fsRoot, '/etc/hosts')?.kind).toBe('file')
    expect(walk(s.fsRoot, '/etc')).toBeDefined()
    expect(walk(s.fsRoot, '/no/such')).toBeUndefined()
  })

  it('glob 正则正确', () => {
    expect(globRegex('*.log').test('app.log')).toBe(true)
    expect(globRegex('*.log').test('app.txt')).toBe(false)
    expect(globRegex('a?c').test('abc')).toBe(true)
  })
})

describe('文件创建、移动和删除', () => {
  it('mkdir/touch/mv/rm 全流程', () => {
    const s = session()
    s.execute('mkdir lab')
    expect(walk(s.state.fsRoot, '/home/student/lab')).toBeDefined()
    s.execute('touch lab/hello.txt')
    expect(walk(s.state.fsRoot, '/home/student/lab/hello.txt')?.kind).toBe('file')
    s.execute('mv lab/hello.txt lab/notes.txt')
    expect(walk(s.state.fsRoot, '/home/student/lab/hello.txt')).toBeUndefined()
    expect(walk(s.state.fsRoot, '/home/student/lab/notes.txt')).toBeDefined()
    s.execute('rm lab/notes.txt')
    expect(walk(s.state.fsRoot, '/home/student/lab/notes.txt')).toBeUndefined()
  })

  it('mkdir -p 创建多层目录', () => {
    const s = session()
    const r = s.execute('mkdir -p a/b/c')
    expect(r.exitCode).toBe(0)
    expect(walk(s.state.fsRoot, '/home/student/a/b/c')?.kind).toBe('dir')
  })

  it('rm -rf 目录', () => {
    const s = session()
    s.execute('mkdir -p lab/sub')
    s.execute('touch lab/sub/x.txt')
    const r = s.execute('rm -rf lab')
    expect(r.exitCode).toBe(0)
    expect(walk(s.state.fsRoot, '/home/student/lab')).toBeUndefined()
  })

  it('rm -rf / 被拒绝且状态不变', () => {
    const s = session()
    const core = () => {
      const { history, exitCodes, clock, ...rest } = JSON.parse(JSON.stringify(s.state))
      void history
      void clock
      return JSON.stringify(rest)
    }
    const before = core()
    const r = s.execute('rm -rf /')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('dangerous')
    expect(core()).toBe(before)
  })

  it('mv 文件到目录中', () => {
    const s = session()
    s.execute('mkdir -p backup')
    s.execute('mv notes.txt backup/')
    expect(walk(s.state.fsRoot, '/home/student/backup/notes.txt')).toBeDefined()
    expect(walk(s.state.fsRoot, '/home/student/notes.txt')).toBeUndefined()
  })

  it('cp 复制文件并保留内容', () => {
    const s = session()
    s.execute('cp notes.txt notes-copy.txt')
    expect(walk(s.state.fsRoot, '/home/student/notes-copy.txt')?.content).toBe(
      walk(s.state.fsRoot, '/home/student/notes.txt')?.content,
    )
  })

  it('chmod 修改权限', () => {
    const s = session()
    const r = s.execute('chmod 600 secrets.txt')
    expect(r.exitCode).toBe(0)
    expect(walk(s.state.fsRoot, '/home/student/secrets.txt')?.mode).toBe(0o600)
  })

  it('通配符展开', () => {
    const s = session()
    s.execute('mkdir -p logs')
    s.execute('touch logs/a.log logs/b.log logs/c.txt')
    const r = s.execute('ls logs/*.log')
    expect(r.stdout).toContain('a.log')
    expect(r.stdout).toContain('b.log')
    expect(r.stdout).not.toContain('c.txt')
  })
})
