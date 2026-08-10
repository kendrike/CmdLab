import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import { APP_LOG } from '../src/sim/vfs/build'
import { walk } from '../src/sim/vfs/paths'
initCommands()

function session() {
  return new ShellSession(createInitialState())
}

const expectedErrors = APP_LOG.split('\n').filter((l) => l.includes('ERROR')).length

describe('管道与重定向', () => {
  it('echo 管道到 grep', () => {
    const s = session()
    const r = s.execute("echo 'hello world' | grep hello")
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('hello world')
  })

  it('cat | grep | wc -l 统计 ERROR 行数', () => {
    const s = session()
    const r = s.execute('cat /var/log/app.log | grep ERROR | wc -l')
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe(String(expectedErrors))
  })

  it('ls | wc -l', () => {
    const s = session()
    const r = s.execute('ls /tmp | wc -l')
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toBe('0')
  })

  it('> 重定向创建文件', () => {
    const s = session()
    const r = s.execute('echo hello > greeting.txt')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('')
    const cat = s.execute('cat greeting.txt')
    expect(cat.stdout).toBe('hello\n')
  })

  it('>> 追加内容', () => {
    const s = session()
    s.execute('echo one > log.txt')
    s.execute('echo two >> log.txt')
    const cat = s.execute('cat log.txt')
    expect(cat.stdout).toBe('one\ntwo\n')
  })

  it('heredoc 写入多行文件', () => {
    const s = session()
    s.execute("cat > deploy.yaml <<'EOF'")
    s.execute('apiVersion: apps/v1')
    s.execute('kind: Deployment')
    const r = s.execute('EOF')
    expect(r.exitCode).toBe(0)
    const cat = s.execute('cat deploy.yaml')
    expect(cat.stdout).toContain('kind: Deployment')
    expect(cat.stdout).toContain('apiVersion: apps/v1')
  })

  it('< 从文件读入', () => {
    const s = session()
    s.execute('echo a > f.txt')
    const r = s.execute('grep a < f.txt')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('a\n')
  })

  it('; 分隔多条命令', () => {
    const s = session()
    const r = s.execute('touch a.txt; touch b.txt; ls')
    expect(r.exitCode).toBe(0)
    expect(walkExists(s)).toBe(true)
    function walkExists(ss: ShellSession): boolean {
      const fs = ss.state.fsRoot
      const children = fs.children!
      return 'a.txt' in children['home']!.children!['student']!.children!
    }
  })

  it('退出码与错误输出', () => {
    const s = session()
    const notFound = s.execute('nosuchcmd')
    expect(notFound.exitCode).toBe(127)
    expect(notFound.stderr).toContain('command not found')
    const grepFail = s.execute('grep NOMATCH /var/log/app.log')
    expect(grepFail.exitCode).toBe(1)
  })

  it('错误命令不会破坏状态', () => {
    const s = session()
    const core = () => {
      const { history, exitCodes, clock, ...rest } = JSON.parse(JSON.stringify(s.state))
      void history
      void clock
      return JSON.stringify(rest)
    }
    const before = core()
    s.execute('rm -rf /')
    s.execute('docker run --bogus-flag nginx')
    s.execute('kubectl bogus-command')
    s.execute('cd /no/such/dir')
    expect(core()).toBe(before)
  })

  it('变量展开与引号', () => {
    const s = session()
    const r = s.execute('echo $HOME')
    expect(r.stdout.trim()).toBe('/home/student')
    const r2 = s.execute("echo '$HOME'")
    expect(r2.stdout.trim()).toBe('$HOME')
  })

  it('多命令管道任一失败时停止', () => {
    const s = session()
    const r = s.execute('cat /var/log/app.log | grep ERROR | nosuchcmd')
    expect(r.exitCode).toBe(127)
    expect(r.stderr).toContain('nosuchcmd')
  })

  it('别名 ll / la / l 默认可用', () => {
    const s = session()
    const ll = s.execute('ll')
    expect(ll.exitCode).toBe(0)
    expect(ll.stdout).toContain('notes.txt')
    expect(ll.stdout).toContain('secrets.txt')
    const la = s.execute('la')
    expect(la.stdout).toContain('.bashrc')
    const l = s.execute('l')
    expect(l.exitCode).toBe(0)
  })

  it('alias 命令列出定义并支持自定义别名', () => {
    const s = session()
    const list = s.execute('alias')
    expect(list.stdout).toContain("ll='ls -l'")
    expect(list.stdout).toContain("la='ls -A'")
    const set = s.execute("alias hi='echo hello'")
    expect(set.exitCode).toBe(0)
    const use = s.execute('hi')
    expect(use.stdout).toBe('hello\n')
    const cat = s.execute('cat ~/.bashrc')
    expect(cat.stdout).toContain("alias hi='echo hello'")
  })

  it('别名带参数追加到命令后', () => {
    const s = session()
    s.execute("alias t='touch'")
    s.execute('t aliased.txt')
    expect(walk(s.state.fsRoot, '/home/student/aliased.txt')).toBeDefined()
  })
})

describe('Tab 补全', () => {
  it('命令补全返回追加部分（exp -> export 追加 ort）', () => {
    const s = session()
    const res = s.complete('exp')
    expect(res.completion).toBe('ort ')
    expect('exp' + res.completion).toBe('export ')
  })

  it('完整命令名补全返回空格', () => {
    const s = session()
    const res = s.complete('export')
    expect(res.completion).toBe(' ')
  })

  it('路径补全返回追加部分', () => {
    const s = session()
    const res = s.complete('cat not')
    expect(res.completion).toBe('es.txt')
    expect('not' + res.completion).toBe('notes.txt')
  })

  it('多个候选不自动补全', () => {
    const s = session()
    const res = s.complete('c')
    expect(res.completion).toBeNull()
    expect(res.candidates.length).toBeGreaterThan(1)
  })

  it('子命令补全（systemctl stat -> status）', () => {
    const s = session()
    const res = s.complete('systemctl stat')
    expect(res.completion).toBe('us ')
    expect('systemctl stat' + res.completion).toBe('systemctl status ')
    const rest = s.complete('systemctl restart')
    expect(rest.completion).toBe(' ')
  })

  it('子命令多候选展示（st -> status/start/stop）', () => {
    const s = session()
    const res = s.complete('systemctl st')
    expect(res.completion).toBeNull()
    expect(res.candidates).toEqual(['status', 'start', 'stop'])
  })

  it('子命令无匹配时回退文件补全', () => {
    const s = session()
    const res = s.complete('systemctl not')
    expect(res.completion).toBe('es.txt')
    expect('not' + res.completion).toBe('notes.txt')
  })
})
