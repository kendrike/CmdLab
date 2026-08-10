import { describe, expect, it } from 'vitest'
import { formatTable } from '../src/sim/table'
import { ShellSession } from '../src/sim/shell/session'
import { findLab } from '../src/courses/labs'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import type { ProcEntry } from '../src/sim/types'

initCommands()

describe('formatTable 动态列宽', () => {
  it('按内容自动扩展列宽，表头与数据同宽', () => {
    const out = formatTable(
      [
        { name: 'PID', align: 'right' },
        { name: 'USER', align: 'left' },
        { name: 'TIME', align: 'right' },
        { name: 'CMD', flex: true },
      ],
      [
        ['1', 'a', '00:00:00', 'x'],
        ['999999999', 'longuser', '1:23:45', 'very-long-cmd'],
      ],
    )
    const lines = out.split('\n')
    const header = lines[0]
    const rows = lines.slice(1)
    expect(header.indexOf('USER')).toBe(rows[0].indexOf('a'))
    expect(header.indexOf('USER')).toBe(rows[1].indexOf('longuser'))
    expect(header.indexOf('TIME') + 'TIME'.length).toBe(rows[0].indexOf('00:00:00') + '00:00:00'.length)
    expect(header.indexOf('TIME') + 'TIME'.length).toBe(rows[1].indexOf('1:23:45') + '1:23:45'.length)
  })

  it('空行也不会破坏对齐', () => {
    const out = formatTable([{ name: 'A' }, { name: 'B', align: 'left' }], [])
    expect(out).toBe('A B')
  })
})

function sessionWithProcs(extra: ProcEntry[]): ShellSession {
  const s = new ShellSession(createInitialState())
  for (const p of extra) s.state.procs.push(p)
  return s
}

function tableRows(stdout: string): string[] {
  return stdout.split('\n').filter((l) => /^\s*\d+\s/.test(l))
}

describe('top 在异常值下的对齐', () => {
  it('超长 PID / 超长用户名 / 超长时间 / 超长命令不破坏对齐', () => {
    const s = sessionWithProcs([
      { pid: 999999999, cmd: 'a-very-long-process-command', tty: 'pts/9', time: '1:23:45' },
    ])
    const r = s.execute('top')
    const lines = r.stdout.split('\n')
    const header = lines.find((l) => l.includes('%CPU'))!
    const rows = tableRows(r.stdout)
    expect(rows.length).toBeGreaterThan(0)
    const userStart = rows.map((l) => l.indexOf('student'))
    expect(new Set(userStart).size).toBe(1)
    expect(header.indexOf('USER')).toBe(userStart[0])
    const timeRight = rows.map((l) => l.indexOf('0:00') + '0:00'.length)
    expect(new Set(timeRight).size).toBe(1)
    expect(header.indexOf('TIME') + 'TIME'.length).toBe(timeRight[0])
  })

  it('每行 PID 列右边界一致', () => {
    const s = sessionWithProcs([{ pid: 999999999, cmd: 'huge', tty: 'pts/9', time: '00:00:00' }])
    const r = s.execute('top')
    const rows = tableRows(r.stdout)
    const pidRight = rows.map((l) => {
      const m = l.match(/^(\s*\d+)/)!
      return m[1].length
    })
    expect(new Set(pidRight).size).toBe(1)
  })
})

describe('ps 在异常值下的对齐', () => {
  it('超长 PID / 超长 TTY / 超长时间不破坏对齐', () => {
    const s = sessionWithProcs([
      { pid: 999999999, cmd: 'zombie', tty: 'pts/999', time: '1:23:45' },
    ])
    const r = s.execute('ps')
    const lines = r.stdout.split('\n')
    const header = lines[0]
    const rows = tableRows(r.stdout)
    expect(rows.length).toBeGreaterThan(0)
    const ttyStart = rows.map((l) => l.indexOf('pts/')).filter((v) => v >= 0)
    expect(ttyStart.length).toBeGreaterThan(0)
    expect(new Set(ttyStart).size).toBe(1)
    expect(header.indexOf('TTY')).toBe(ttyStart[0])
    const timeBounds = rows.map((l) => {
      const m = l.match(/(\d+:\d+:\d+)/)
      return m ? m.index! + m[1].length : -1
    })
    expect(new Set(timeBounds.filter((v) => v > 0)).size).toBe(1)
    expect(header.indexOf('TIME') + 'TIME'.length).toBe(timeBounds[0])
  })

  it('与默认进程混合时依然对齐', () => {
    const s = sessionWithProcs([{ pid: 12345, cmd: 'worker-extra', tty: 'pts/2', time: '00:00:05' }])
    const r = s.execute('ps')
    const rows = tableRows(r.stdout)
    const header = r.stdout.split('\n')[0]
    const starts = rows.map((l) => l.indexOf('pts/0')).filter((v) => v >= 0)
    const starts2 = rows.map((l) => l.indexOf('pts/2')).filter((v) => v >= 0)
    expect(new Set(starts).size).toBe(1)
    expect(new Set(starts2).size).toBe(1)
    expect(header.indexOf('TTY')).toBe(starts[0])
    expect(header.indexOf('TTY')).toBe(starts2[0])
  })
})

describe('top/ps 与课程联动', () => {
  it('linux-procs 课程解决方案仍可执行', () => {
    const s = new ShellSession(findLab('linux-procs').build())
    expect(s.execute('ps').exitCode).toBe(0)
    expect(s.execute('top').exitCode).toBe(0)
    expect(s.execute('kill 2345').exitCode).toBe(0)
    const psAfter = s.execute('ps').stdout
    expect(psAfter).not.toContain('sleep 3600')
  })
})
