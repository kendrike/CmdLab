import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { addService } from '../src/sim/linux/services'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import { walk } from '../src/sim/vfs/paths'

initCommands()

function session() {
  return new ShellSession(createInitialState())
}

describe('错误输出重定向 2> / 2>>', () => {
  it('2> 把 stderr 写入文件', () => {
    const s = session()
    const r = s.execute('ls /nonexistent 2> err.txt')
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toBe('')
    const f = walk(s.state.fsRoot, '/home/student/err.txt')
    expect(f && f.kind === 'file' ? f.content : '').toContain('No such file')
  })

  it('2>> 追加 stderr', () => {
    const s = session()
    s.execute('ls /nonexistent 2> err.txt')
    s.execute('cat /nonexistent 2>> err.txt')
    const f = walk(s.state.fsRoot, '/home/student/err.txt')!
    expect(f.content.trim().split('\n').length).toBe(2)
  })

  it('2> 不影响 stdout 重定向', () => {
    const s = session()
    s.execute('echo hi 2> err.txt')
    const err = walk(s.state.fsRoot, '/home/student/err.txt')
    expect(err && err.kind === 'file' ? err.content : '').toBe('')
  })
})

describe('chown 权限规则', () => {
  it('把文件组改为自己所在的组成功', () => {
    const s = session()
    s.execute('touch f.txt')
    const r = s.execute('chown :student f.txt')
    expect(r.exitCode).toBe(0)
    const node = walk(s.state.fsRoot, '/home/student/f.txt')!
    expect(node.gid).toBe(1000)
  })

  it('普通用户修改所有者报 Operation not permitted', () => {
    const s = session()
    s.execute('touch f.txt')
    const r = s.execute('chown root f.txt')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('Operation not permitted')
    expect(walk(s.state.fsRoot, '/home/student/f.txt')!.uid).toBe(1000)
  })

  it('不能把别人文件的组改掉', () => {
    const s = session()
    const r = s.execute('chown :student /var/log/app.log')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('Operation not permitted')
  })

  it('无效用户报错', () => {
    const s = session()
    const r = s.execute('chown nosuchuser f.txt')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('invalid user')
  })
})

describe('env 与 export', () => {
  it('env 输出所有环境变量', () => {
    const s = session()
    const r = s.execute('env')
    expect(r.stdout).toContain('HOME=/home/student')
    expect(r.stdout).toContain('PATH=')
  })

  it('export 定义变量后 echo $VAR 可读', () => {
    const s = session()
    s.execute('export MY_VAR="hello world"')
    const r = s.execute('echo $MY_VAR')
    expect(r.stdout.trim()).toBe('hello world')
    expect(s.state.env['MY_VAR']).toBe('hello world')
  })

  it('export 无参数输出 declare -x 列表', () => {
    const s = session()
    const r = s.execute('export')
    expect(r.stdout).toContain('declare -x HOME=')
  })
})

describe('cut', () => {
  it('按分隔符取字段', () => {
    const s = session()
    const r = s.execute('cut -d "," -f 2 data/scores.txt')
    expect(r.stdout.trim().split('\n')).toEqual(['92', '78', '85', '99', '67'])
  })

  it('多个字段', () => {
    const s = session()
    const r = s.execute('echo "a,b,c" | cut -d , -f 1,3')
    expect(r.stdout.trim()).toBe('a,c')
  })

  it('字符位置', () => {
    const s = session()
    const r = s.execute('echo hello | cut -c 1-2')
    expect(r.stdout.trim()).toBe('he')
  })

  it('缺少字段参数报错', () => {
    const s = session()
    const r = s.execute('echo hi | cut')
    expect(r.exitCode).toBe(1)
  })
})

describe('gzip / gunzip', () => {
  it('压缩后原文件消失且 .gz 存在', () => {
    const s = session()
    s.execute('echo data > a.txt')
    const r = s.execute('gzip a.txt')
    expect(r.exitCode).toBe(0)
    expect(walk(s.state.fsRoot, '/home/student/a.txt')).toBeUndefined()
    expect(walk(s.state.fsRoot, '/home/student/a.txt.gz')).toBeDefined()
  })

  it('gunzip 还原内容', () => {
    const s = session()
    s.execute('echo data > a.txt')
    s.execute('gzip a.txt')
    s.execute('gunzip a.txt.gz')
    const f = walk(s.state.fsRoot, '/home/student/a.txt')!
    expect(f.content).toBe('data\n')
    expect(walk(s.state.fsRoot, '/home/student/a.txt.gz')).toBeUndefined()
  })

  it('gzip -k 保留原文件', () => {
    const s = session()
    s.execute('echo data > a.txt')
    s.execute('gzip -k a.txt')
    expect(walk(s.state.fsRoot, '/home/student/a.txt')).toBeDefined()
    expect(walk(s.state.fsRoot, '/home/student/a.txt.gz')).toBeDefined()
  })

  it('gunzip 非 gzip 文件报错', () => {
    const s = session()
    s.execute('echo hi > b.txt')
    const r = s.execute('gunzip b.txt')
    expect(r.exitCode).toBe(1)
  })
})

describe('tar', () => {
  it('打包、列出、解包往返', () => {
    const s = session()
    const c = s.execute('tar -czf backup.tar.gz backup')
    expect(c.exitCode).toBe(0)
    expect(walk(s.state.fsRoot, '/home/student/backup.tar.gz')).toBeDefined()
    const list = s.execute('tar -tf backup.tar.gz')
    expect(list.stdout).toContain('backup/file1.txt')
    expect(list.stdout).toContain('backup/notes.md')
    s.execute('mkdir restore')
    const x = s.execute('tar -xf backup.tar.gz -C restore')
    expect(x.exitCode).toBe(0)
    expect(walk(s.state.fsRoot, '/home/student/restore/backup/file2.txt')?.kind).toBe('file')
  })

  it('不带压缩标志也可以解 gzip 归档', () => {
    const s = session()
    s.execute('tar -cf plain.tar backup')
    s.execute('mkdir r2')
    s.execute('tar -xf plain.tar -C r2')
    expect(walk(s.state.fsRoot, '/home/student/r2/backup/file1.txt')).toBeDefined()
  })

  it('解包到不存在目录报错', () => {
    const s = session()
    s.execute('tar -czf b.tar.gz backup')
    const r = s.execute('tar -xf b.tar.gz -C nope')
    expect(r.exitCode).toBe(2)
  })
})

describe('ping / curl / ss / systemctl', () => {
  it('ping -c 3 输出统计', () => {
    const s = session()
    const r = s.execute('ping -c 3 example.com')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('93.184.216.34')
    expect(r.stdout).toContain('3 packets transmitted, 3 packets received, 0% packet loss')
  })

  it('ping 未知主机退出码 2', () => {
    const s = session()
    const r = s.execute('ping nosuchhost.example')
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toContain('Name or service not known')
  })

  it('curl example.com 返回 HTML', () => {
    const s = session()
    const r = s.execute('curl http://example.com')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('<h1>Example Domain</h1>')
  })

  it('curl 未知域名退出码 6', () => {
    const s = session()
    const r = s.execute('curl http://nosuchsite.example/')
    expect(r.exitCode).toBe(6)
  })

  it('curl 未监听端口退出码 7', () => {
    const s = session()
    const r = s.execute('curl http://localhost:9999/')
    expect(r.exitCode).toBe(7)
    expect(r.stderr).toContain('Connection refused')
  })

  it('curl -s 静默模式不输出错误', () => {
    const s = session()
    const r = s.execute('curl -s http://localhost:9999/')
    expect(r.exitCode).toBe(7)
    expect(r.stderr).toBe('')
  })

  it('curl -o 写入文件', () => {
    const s = session()
    s.execute('curl -s -o page.html http://example.com')
    const f = walk(s.state.fsRoot, '/home/student/page.html')!
    expect(f.content).toContain('Example Domain')
  })

  it('ss -tlnp 显示监听端口', () => {
    const s = session()
    const r = s.execute('ss -tlnp')
    expect(r.stdout).toContain('0.0.0.0:22')
    expect(r.stdout).toContain('sshd')
  })

  it('systemctl start 启动服务后 ss 与 curl 生效', () => {
    const s = session()
    s.execute('chmod 644 /var/log/webapp/app.log')
    addService(s.state, 'webapp', 'inactive', ['unit starting up'])
    const r = s.execute('systemctl start webapp')
    expect(r.exitCode).toBe(0)
    expect(s.state.services[0].status).toBe('active')
    const ss = s.execute('ss -tlnp')
    expect(ss.stdout).toContain('0.0.0.0:8080')
    const curl = s.execute('curl http://localhost:8080/')
    expect(curl.exitCode).toBe(0)
    expect(curl.stdout).toContain('CmdLab Web App')
    expect(s.state.procs.some((p) => p.pid === s.state.services[0].pid)).toBe(true)
  })

  it('systemctl stop 停止服务并移除端口', () => {
    const s = session()
    addService(s.state, 'webapp', 'active', [])
    s.state.services[0].pid = 3105
    s.execute('systemctl stop webapp')
    expect(s.state.services[0].status).toBe('inactive')
    const ss = s.execute('ss -tlnp')
    expect(ss.stdout).not.toContain('0.0.0.0:8080')
  })

  it('systemctl status 显示 failed 与日志', () => {
    const s = session()
    addService(s.state, 'webapp', 'failed', ['08:20:01 webapp.service: Failed to open log file'])
    const r = s.execute('systemctl status webapp')
    expect(r.stdout).toContain('failed')
    expect(r.stdout).toContain('Failed to open log file')
  })

  it('权限不足时 start 失败，修复后成功', () => {
    const s = session()
    addService(s.state, 'webapp', 'failed', ['permission denied'])
    const fail = s.execute('systemctl start webapp')
    expect(fail.exitCode).toBe(1)
    expect(fail.stderr).toContain('Job for webapp.service failed')
    expect(s.state.services[0].status).toBe('failed')
    s.execute('chmod 644 /var/log/webapp/app.log')
    const ok = s.execute('systemctl start webapp')
    expect(ok.exitCode).toBe(0)
    expect(s.state.services[0].status).toBe('active')
  })

  it('systemctl restart 在修复后可用', () => {
    const s = session()
    addService(s.state, 'webapp', 'failed', [])
    s.execute('chmod 644 /var/log/webapp/app.log')
    const r = s.execute('systemctl restart webapp')
    expect(r.exitCode).toBe(0)
    expect(s.state.services[0].status).toBe('active')
  })

  it('systemctl enable 输出符号链接信息', () => {
    const s = session()
    addService(s.state, 'webapp', 'inactive', [])
    const r = s.execute('systemctl enable webapp')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('multi-user.target.wants')
  })
})

describe('tail -f 与 top', () => {
  it('tail -f 输出末尾并带模拟说明', () => {
    const s = session()
    const r = s.execute('tail -f /var/log/app.log')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('daily report generated')
    expect(r.stdout).toContain('模拟模式')
  })

  it('top 输出进程表格', () => {
    const s = session()
    const r = s.execute('top')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('PID')
    expect(r.stdout).toContain('%MEM')
    expect(r.stdout).toContain('systemd')
  })

  it('top 表格各列对齐（表头与数据同源宽度且对齐方向一致）', () => {
    const r = session().execute('top')
    const lines = r.stdout.split('\n')
    const header = lines.find((l) => l.includes('%CPU'))!
    const rows = lines.filter((l) => /^\s*\d+\s+student/.test(l))
    expect(rows.length).toBeGreaterThan(0)
    const userCol = rows.map((l) => l.indexOf('student'))
    expect(new Set(userCol).size).toBe(1)
    expect(header.indexOf('USER')).toBe(userCol[0])
    const prCol = rows.map((l) => l.indexOf('20'))
    expect(new Set(prCol).size).toBe(1)
    const timeRight = rows.map((l) => l.indexOf('0:00') + '0:00'.length)
    expect(new Set(timeRight).size).toBe(1)
    expect(header.indexOf('TIME') + 'TIME'.length).toBe(timeRight[0])
  })

  it('ps 表格各列对齐（表头与数据同源宽度且对齐方向一致）', () => {
    const r = session().execute('ps')
    const lines = r.stdout.split('\n')
    const header = lines.find((l) => l.includes('TIME'))!
    const rows = lines.filter((l) => /^\s*\d+\s+pts/.test(l))
    expect(rows.length).toBeGreaterThan(0)
    const ttyCol = rows.map((l) => l.indexOf('pts/0'))
    expect(new Set(ttyCol).size).toBe(1)
    expect(header.indexOf('TTY')).toBe(ttyCol[0])
    const timeRight = rows.map((l) => l.indexOf('00:00:00') + '00:00:00'.length)
    expect(new Set(timeRight).size).toBe(1)
    expect(header.indexOf('TIME') + 'TIME'.length).toBe(timeRight[0])
  })
})

describe('退出码', () => {
  it('成功命令退出码 0', () => {
    const s = session()
    expect(s.execute('ls').exitCode).toBe(0)
    expect(s.execute('echo ok').exitCode).toBe(0)
  })

  it('文件不存在退出码 1', () => {
    const s = session()
    expect(s.execute('cat /nonexistent').exitCode).toBe(1)
    expect(s.execute('cd /nonexistent').exitCode).toBe(1)
  })

  it('非法选项退出码 2', () => {
    const s = session()
    expect(s.execute('ls --bogus').exitCode).toBe(2)
  })

  it('未知命令退出码 127', () => {
    const s = session()
    expect(s.execute('nosuchcmd').exitCode).toBe(127)
  })

  it('管道退出码取最后一个命令', () => {
    const s = session()
    expect(s.execute('cat /var/log/app.log | grep NO_MATCH').exitCode).toBe(1)
    expect(s.execute('cat /nonexistent | grep x').exitCode).toBe(1)
  })

  it('false 退出码 1，true 退出码 0', () => {
    const s = session()
    expect(s.execute('false').exitCode).toBe(1)
    expect(s.execute('true').exitCode).toBe(0)
  })
})

describe('通配符', () => {
  it('* 展开匹配文件', () => {
    const s = session()
    s.execute('touch a.txt b.txt c.log')
    const r = s.execute('ls *.txt')
    expect(r.stdout).toContain('a.txt')
    expect(r.stdout).toContain('b.txt')
    expect(r.stdout).not.toContain('c.log')
  })

  it('? 匹配单个字符', () => {
    const s = session()
    s.execute('touch file1.txt file2.log')
    const r = s.execute('ls file?.txt')
    expect(r.stdout.trim()).toContain('file1.txt')
    expect(r.stdout).not.toContain('file2.log')
  })

  it('无匹配时按字面传递并报错（真实 bash 行为）', () => {
    const s = session()
    const r = s.execute('ls *.nonexistent')
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toContain("cannot access '*")
  })

  it('引号内的通配符不展开（find -name 按模式匹配）', () => {
    const s = session()
    s.execute('touch a.txt b.txt c.log')
    const r = s.execute('find . -name "*.txt"')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('./a.txt')
    expect(r.stdout).toContain('./b.txt')
    expect(r.stdout).not.toContain('c.log')
  })

  it('find 输出路径不重复且引号模式生效', () => {
    const s = session()
    const r = s.execute('find ~ -name "*.txt"')
    expect(r.exitCode).toBe(0)
    const lines = r.stdout.trim().split('\n')
    expect(lines).toContain('/home/student/notes.txt')
    expect(lines).toContain('/home/student/data/names.txt')
    expect(lines.some((l) => /\.txt\/[^/]+\.txt/.test(l))).toBe(false)
    expect(new Set(lines).size).toBe(lines.length)
  })
})
