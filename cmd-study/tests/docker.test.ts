import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'

initCommands()

function session() {
  return new ShellSession(createInitialState())
}

function findContainer(s: ShellSession, name: string) {
  return s.state.docker.containers.find((c) => c.name === name)
}

describe('Docker 容器生命周期', () => {
  it('docker version 与 info 输出正常', () => {
    const s = session()
    expect(s.execute('docker version').stdout).toContain('24.0.7')
    expect(s.execute('docker info').stdout).toContain('Images: 7')
  })

  it('docker images 预置 nginx 与 alpine', () => {
    const s = session()
    const r = s.execute('docker images')
    expect(r.stdout).toContain('nginx')
    expect(r.stdout).toContain('alpine')
  })

  it('run -d --name web -p 8080:80 nginx 创建运行中的容器', () => {
    const s = session()
    const r = s.execute('docker run -d --name web -p 8080:80 nginx')
    expect(r.exitCode).toBe(0)
    const ctr = findContainer(s, 'web')
    expect(ctr).toBeDefined()
    expect(ctr!.status).toBe('running')
    expect(ctr!.ports[0]).toEqual({ host: 8080, container: 80, proto: 'tcp' })
    expect(s.execute('docker ps').stdout).toContain('web')
  })

  it('生命周期：stop -> start -> restart -> rm', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    expect(findContainer(s, 'web')!.status).toBe('running')
    s.execute('docker stop web')
    expect(findContainer(s, 'web')!.status).toBe('exited')
    expect(findContainer(s, 'web')!.exitCode).toBe(0)
    s.execute('docker start web')
    expect(findContainer(s, 'web')!.status).toBe('running')
    s.execute('docker restart web')
    expect(findContainer(s, 'web')!.status).toBe('running')
    s.execute('docker stop web')
    s.execute('docker rm web')
    expect(findContainer(s, 'web')).toBeUndefined()
  })

  it('docker logs 输出启动日志', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    const r = s.execute('docker logs web')
    expect(r.stdout).toContain('Configuration complete')
    expect(r.stdout).toContain('start worker process')
  })

  it('docker ps 只显示运行中，ps -a 显示全部', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    s.execute('docker stop web')
    expect(s.execute('docker ps').stdout).not.toContain('web')
    expect(s.execute('docker ps -a').stdout).toContain('Exited')
  })

  it('删除镜像需先删容器', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    const r = s.execute('docker rmi nginx')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('is using its referenced image')
    s.execute('docker stop web')
    s.execute('docker rm web')
    expect(s.execute('docker rmi nginx').exitCode).toBe(0)
    expect(s.execute('docker images').stdout).not.toContain('nginx')
  })

  it('运行中的容器不能 rm（教学错误）', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    const r = s.execute('docker rm web')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('You cannot remove a running container')
    expect(findContainer(s, 'web')).toBeDefined()
  })

  it('端口冲突报错', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    const r = s.execute('docker run -d --name web2 -p 8080:80 nginx')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('port is already allocated')
  })

  it('容器名冲突报错', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    const r = s.execute('docker run -d --name web -p 8081:80 nginx')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('already in use')
  })

  it('未知镜像报错且不创建容器', () => {
    const s = session()
    const r = s.execute('docker run -d --name web impossible-image')
    expect(r.exitCode).toBe(125)
    expect(findContainer(s, 'web')).toBeUndefined()
  })

  it('不支持的参数给出教学错误', () => {
    const s = session()
    const core = () => {
      const { history, exitCodes, clock, ...rest } = JSON.parse(JSON.stringify(s.state))
      void history
      void clock
      return JSON.stringify(rest)
    }
    const before = core()
    const r = s.execute('docker run --bogus nginx')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('unknown flag')
    expect(core()).toBe(before)
  })

  it('docker pull 新镜像', () => {
    const s = session()
    const r = s.execute('docker pull redis')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Status: Downloaded newer image for redis:latest')
    expect(s.execute('docker images').stdout).toContain('redis')
  })

  it('docker exec 模拟容器内命令', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    expect(s.execute('docker exec web whoami').stdout.trim()).toBe('root')
    expect(s.execute('docker exec web ls /etc/nginx/conf.d').stdout.trim()).toBe('default.conf')
    const r = s.execute('docker exec web vim')
    expect(r.exitCode).toBe(127)
  })

  it('docker inspect 返回 JSON', () => {
    const s = session()
    s.execute('docker run -d --name web -p 8080:80 nginx')
    const r = s.execute('docker inspect web')
    expect(r.exitCode).toBe(0)
    const parsed = JSON.parse(r.stdout)
    expect(parsed[0].Name).toBe('/web')
    expect(parsed[0].State.Running).toBe(true)
  })
})
