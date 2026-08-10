import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import { walk } from '../src/sim/vfs/paths'
import { LABS } from '../src/courses/labs'
import { evaluateLab } from '../src/courses/validate'

initCommands()

function session() {
  return new ShellSession(createInitialState())
}

function ctr(s: ShellSession, name: string) {
  return s.state.docker.containers.find((c) => c.name === name)
}

describe('docker --help 帮助', () => {
  const cmds = ['docker', 'run', 'images', 'pull', 'ps', 'start', 'stop', 'restart', 'rm', 'rmi', 'tag', 'history', 'logs', 'exec', 'inspect', 'build', 'network', 'volume', 'compose']
  it.each(cmds)('docker %s --help 显示帮助而非报错', (cmd) => {
    const s = session()
    const r = s.execute(`docker ${cmd === 'docker' ? '' : cmd} --help`)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Usage')
  })

  it('docker logs --tail 与 --help 组合显示帮助', () => {
    const s = session()
    const r = s.execute('docker logs -f --tail 10 --help')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Usage:  docker logs')
  })

  it('docker compose exec --help 显示帮助', () => {
    const s = session()
    const r = s.execute('docker compose exec --help')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Usage:  docker compose')
  })
})

describe('run 高级参数', () => {
  it('-e 环境变量写入容器', () => {
    const s = session()
    s.execute('docker run -d --name app -e MY_VAR=hello -e DB_HOST=db nginx')
    expect(ctr(s, 'app')!.env['MY_VAR']).toBe('hello')
    expect(ctr(s, 'app')!.env['DB_HOST']).toBe('db')
    const r = s.execute('docker exec app env')
    expect(r.stdout).toContain('MY_VAR=hello')
  })

  it('--rm 容器停止后自动删除', () => {
    const s = session()
    s.execute('docker run -d --name temp --rm nginx')
    expect(ctr(s, 'temp')).toBeDefined()
    s.execute('docker stop temp')
    expect(ctr(s, 'temp')).toBeUndefined()
  })

  it('--network 连接自定义网络', () => {
    const s = session()
    s.execute('docker network create webnet')
    s.execute('docker run -d --name app --network webnet nginx')
    expect(ctr(s, 'app')!.network).toBe('webnet')
    expect(ctr(s, 'app')!.ip).toMatch(/^172\./)
  })

  it('--network 指向不存在的网络报错', () => {
    const s = session()
    const r = s.execute('docker run -d --name app --network nope nginx')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('network nope not found')
  })

  it('--health-cmd 标记健康状态', () => {
    const s = session()
    s.execute('docker run -d --name api --health-cmd "curl -f http://localhost:3000/health" nginx')
    expect(ctr(s, 'api')!.health).toBe('healthy')
    expect(s.execute('docker ps').stdout).toContain('healthy')
  })

  it('--memory / --cpus / --restart 记录限制', () => {
    const s = session()
    s.execute('docker run -d --name api --memory 128m --cpus 0.5 --restart always nginx')
    expect(ctr(s, 'api')!.limits).toEqual({ memory: '128m', cpus: '0.5' })
    expect(ctr(s, 'api')!.restartPolicy).toBe('always')
    const insp = s.execute('docker inspect api')
    const obj = JSON.parse(insp.stdout)[0]
    expect(obj.HostConfig.RestartPolicy.Name).toBe('always')
    expect(obj.HostConfig.Memory).toBe(128 * 1024 * 1024)
    expect(obj.HostConfig.NanoCpus).toBe(5e8)
  })
})

describe('exec 在容器文件系统中执行', () => {
  it('exec 创建的文件保存在容器内且不影响宿主机', () => {
    const s = session()
    s.execute('docker run -d --name web nginx')
    s.execute('docker exec web touch /usr/share/nginx/html/hello.txt')
    expect(walk(ctr(s, 'web')!.fsRoot, '/usr/share/nginx/html/hello.txt')).toBeDefined()
    expect(walk(s.state.fsRoot, '/usr/share/nginx/html/hello.txt')).toBeUndefined()
  })

  it('exec sh -c 支持多命令', () => {
    const s = session()
    s.execute('docker run -d --name web nginx')
    const r = s.execute('docker exec web sh -c "echo one; echo two"')
    expect(r.stdout).toContain('one')
    expect(r.stdout).toContain('two')
  })
})

describe('数据卷持久化', () => {
  it('volume create / ls / inspect / rm', () => {
    const s = session()
    expect(s.execute('docker volume create mydata').stdout.trim()).toBe('mydata')
    expect(s.execute('docker volume ls').stdout).toContain('mydata')
    const insp = JSON.parse(s.execute('docker volume inspect mydata').stdout)[0]
    expect(insp.Name).toBe('mydata')
    expect(insp.Mountpoint).toContain('/var/lib/docker/volumes/mydata')
    expect(s.execute('docker volume create mydata').exitCode).toBe(125)
  })

  it('容器删除后数据卷保留，新容器可恢复', () => {
    const s = session()
    s.execute('docker volume create appdata')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    s.execute('docker exec app touch /data/saved.txt')
    s.execute('docker stop app')
    s.execute('docker rm app')
    expect(s.state.docker.volumes.find((v) => v.name === 'appdata')!.tree).not.toBeNull()
    s.execute('docker run -d --name app2 -v appdata:/data nginx')
    const r = s.execute('docker exec app2 ls /data')
    expect(r.stdout).toContain('saved.txt')
  })

  it('卷被使用中不能删除', () => {
    const s = session()
    s.execute('docker volume create appdata')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    const r = s.execute('docker volume rm appdata')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('volume is in use')
  })
})

describe('网络管理', () => {
  it('network create / ls / inspect / connect', () => {
    const s = session()
    s.execute('docker network create webnet')
    expect(s.execute('docker network ls').stdout).toContain('webnet')
    const insp = JSON.parse(s.execute('docker network inspect webnet').stdout)[0]
    expect(insp.Name).toBe('webnet')
    expect(insp.Driver).toBe('bridge')
    s.execute('docker run -d --name app nginx')
    s.execute('docker network connect webnet app')
    expect(ctr(s, 'app')!.network).toBe('webnet')
    const insp2 = JSON.parse(s.execute('docker network inspect webnet').stdout)[0]
    expect(insp2.Containers).toHaveProperty(ctr(s, 'app')!.id)
  })

  it('网络内容器可通过名字访问（curl 容器名）', () => {
    const s = session()
    s.execute('docker network create webnet')
    s.execute('docker run -d --name web --network webnet -p 8080:80 web')
    s.execute('docker run -d --name api --network webnet -p 3000:3000 api')
    const r = s.execute('curl http://api:3000/')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('"service": "api"')
    const web = s.execute('curl http://localhost:8080/')
    expect(web.stdout).toContain('CmdLab 三层应用')
  })
})

describe('Dockerfile 构建', () => {
  const DOCKERFILE = [
    'FROM nginx',
    'WORKDIR /usr/share/nginx/html',
    'COPY index.html /usr/share/nginx/html/',
    'RUN mkdir -p /usr/share/nginx/html/assets',
    'EXPOSE 80',
    'CMD ["nginx", "-g", "daemon off;"]',
  ].join('\n')

  it('build -t 创建新镜像并可用', () => {
    const s = session()
    s.execute('echo "<h1>my page</h1>" > index.html')
    s.execute('cat > Dockerfile <<EOF')
    for (const l of DOCKERFILE.split('\n')) s.execute(l)
    s.execute('EOF')
    const r = s.execute('docker build -t myapp:v1 .')
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('Successfully built')
    expect(r.stdout).toContain('Successfully tagged myapp:v1')
    const img = s.state.docker.images.find((i) => i.repository === 'myapp' && i.tag === 'v1')
    expect(img).toBeDefined()
    expect(img!.history.length).toBe(6)
    expect(walk(img!.fsRoot, '/usr/share/nginx/html/assets')).toBeDefined()
    s.execute('docker run -d --name app -p 8080:80 myapp:v1')
    expect(ctr(s, 'app')!.image).toBe('myapp:v1')
    const curl = s.execute('curl http://localhost:8080/')
    expect(curl.stdout).toContain('my page')
  })

  it('不支持的指令明确报错', () => {
    const s = session()
    s.execute('cat > Dockerfile <<EOF')
    s.execute('FROM nginx')
    s.execute('ADD file /tmp/')
    s.execute('EOF')
    const r = s.execute('docker build -t bad .')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain("unsupported instruction 'ADD'")
    expect(s.state.docker.images.some((i) => i.repository === 'bad')).toBe(false)
  })

  it('FROM 不存在的镜像报错', () => {
    const s = session()
    s.execute('cat > Dockerfile <<EOF')
    s.execute('FROM nosuchimage')
    s.execute('EOF')
    const r = s.execute('docker build -t bad .')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain("Unable to find image 'nosuchimage:latest'")
  })

  it('docker tag 创建新标签，history 显示构建步骤', () => {
    const s = session()
    s.execute('echo x > index.html')
    s.execute('cat > Dockerfile <<EOF')
    s.execute('FROM nginx')
    s.execute('COPY index.html /usr/share/nginx/html/')
    s.execute('EOF')
    s.execute('docker build -t myapp:v1 .')
    expect(s.execute('docker tag myapp:v1 myapp:latest').exitCode).toBe(0)
    expect(s.state.docker.images.some((i) => i.repository === 'myapp' && i.tag === 'latest')).toBe(true)
    const h = s.execute('docker history myapp:v1')
    expect(h.stdout).toContain('FROM nginx')
    expect(h.stdout).toContain('COPY index.html')
  })
})

describe('docker compose', () => {
  const COMPOSE = [
    'version: "3"',
    'services:',
    '  web:',
    '    image: web',
    '    ports:',
    '      - "8080:80"',
    '  api:',
    '    image: api',
    '    ports:',
    '      - "3000:3000"',
    '    environment:',
    '      - DB_HOST=db',
  ].join('\n')

  function writeCompose(s: ShellSession) {
    s.execute('cat > compose.yaml <<EOF')
    for (const l of COMPOSE.split('\n')) s.execute(l)
    s.execute('EOF')
  }

  it('compose up / ps / logs / stop / down 全流程', () => {
    const s = session()
    writeCompose(s)
    const up = s.execute('docker compose up')
    expect(up.exitCode).toBe(0)
    expect(up.stdout).toContain('compose_default')
    expect(ctr(s, 'compose-web-1')).toBeDefined()
    expect(ctr(s, 'compose-api-1')).toBeDefined()
    expect(ctr(s, 'compose-web-1')!.ports[0]).toEqual({ host: 8080, container: 80, proto: 'tcp' })
    expect(ctr(s, 'compose-api-1')!.env['DB_HOST']).toBe('db')
    expect(s.execute('docker compose ps').stdout).toContain('compose-web-1')
    expect(s.execute('docker compose logs').stdout).toContain('compose-web-1')
    s.execute('docker compose stop')
    expect(ctr(s, 'compose-web-1')!.status).toBe('exited')
    s.execute('docker compose down')
    expect(ctr(s, 'compose-web-1')).toBeUndefined()
    expect(ctr(s, 'compose-api-1')).toBeUndefined()
  })

  it('compose 服务未知键报错', () => {
    const s = session()
    s.execute('cat > compose.yaml <<EOF')
    s.execute('version: "3"')
    s.execute('services:')
    s.execute('  web:')
    s.execute('    image: nginx')
    s.execute('    deploy:')
    s.execute('      replicas: 2')
    s.execute('EOF')
    const r = s.execute('docker compose up')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain("键 'deploy' 不被支持")
  })

  it('compose 服务镜像不存在时明确报错', () => {
    const s = session()
    s.execute('cat > compose.yaml <<EOF')
    s.execute('version: "3"')
    s.execute('services:')
    s.execute('  web:')
    s.execute('    image: nosuchimage')
    s.execute('EOF')
    const r = s.execute('docker compose up')
    expect(r.exitCode).toBe(125)
    expect(r.stderr).toContain('nosuchimage')
  })
})

describe('容器健康与检查', () => {
  it('inspect 显示健康、限制与网络信息', () => {
    const s = session()
    s.execute('docker run -d --name api --health-cmd "curl -f http://localhost:3000/health" --memory 256m nginx')
    const obj = JSON.parse(s.execute('docker inspect api').stdout)[0]
    expect(obj.State.Health.Status).toBe('healthy')
    expect(obj.Config.Healthcheck.Test[1]).toContain('localhost:3000')
    expect(obj.HostConfig.Memory).toBe(256 * 1024 * 1024)
    expect(obj.NetworkSettings.Networks.bridge.IPAddress).toMatch(/^172\.17\./)
  })
})

describe('综合实验前置验证', () => {
  it('三层架构：db/api/web 网络通信与健康状态', () => {
    const s = session()
    s.execute('docker network create webnet')
    s.execute('docker volume create pgdata')
    s.execute('docker run -d --name db --network webnet -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:15')
    s.execute('docker run -d --name api --network webnet -e DB_HOST=db -p 3000:3000 --health-cmd "curl -f http://localhost:3000/health" api')
    s.execute('docker run -d --name web --network webnet -p 8080:80 web')
    expect(ctr(s, 'db')!.status).toBe('running')
    expect(ctr(s, 'api')!.health).toBe('healthy')
    expect(ctr(s, 'web')!.status).toBe('running')
    expect(ctr(s, 'api')!.env['DB_HOST']).toBe('db')
    const api = s.execute('curl http://localhost:3000/health')
    expect(api.exitCode).toBe(0)
    const web = s.execute('curl http://localhost:8080/')
    expect(web.stdout).toContain('CmdLab 三层应用')
  })
})

describe('docker-build 步骤时序', () => {
  it('用非 myapp 的容器名也能完成 s4', () => {
    const lab = LABS.find((l) => l.id === 'docker-build')!
    const s = session()
    s.execute('echo "<h1>hi</h1>" > index.html')
    s.execute('cat > Dockerfile <<EOF')
    s.execute('FROM nginx')
    s.execute('COPY index.html /usr/share/nginx/html/')
    s.execute('EOF')
    s.execute('docker build -t myapp:v1 .')
    s.execute('docker tag myapp:v1 myapp:latest')
    s.execute('docker history myapp:v1')
    s.execute('docker run -d --name app myapp:v1')
    const r = evaluateLab(lab, s.state)
    expect(r.steps.find((x) => x.id === 's4')!.done).toBe(true)
    expect(r.done).toBe(true)
  })
})

describe('docker-volumes 步骤时序', () => {
  it('进入实验时 s3 不应完成', () => {
    const lab = LABS.find((l) => l.id === 'docker-volumes')!
    const s = session()
    const r = evaluateLab(lab, s.state)
    expect(r.steps.find((x) => x.id === 's3')!.done).toBe(false)
  })

  it('创建卷+挂载+写入后才完成 s3', () => {
    const lab = LABS.find((l) => l.id === 'docker-volumes')!
    const s = session()
    s.execute('docker volume create appdata')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    expect(evaluateLab(lab, s.state).steps.find((x) => x.id === 's3')!.done).toBe(false)
    s.execute('docker exec app touch /data/saved.txt')
    const r = evaluateLab(lab, s.state)
    expect(r.steps.find((x) => x.id === 's3')!.done).toBe(true)
  })

  it('删除后重建（任意容器名）仍能完成 s4/s5', () => {
    const lab = LABS.find((l) => l.id === 'docker-volumes')!
    const s = session()
    s.execute('docker volume create appdata')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    s.execute('docker exec app touch /data/saved.txt')
    s.execute('docker stop app')
    s.execute('docker rm app')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    const r = evaluateLab(lab, s.state)
    expect(r.steps.find((x) => x.id === 's2')!.done).toBe(true)
    expect(r.steps.find((x) => x.id === 's4')!.done).toBe(true)
    expect(r.steps.find((x) => x.id === 's5')!.done).toBe(true)
    expect(r.done).toBe(true)
  })

  it('写入任意文件名（非 saved.txt）也能完成 s3/s5', () => {
    const lab = LABS.find((l) => l.id === 'docker-volumes')!
    const s = session()
    s.execute('docker volume create appdata')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    s.execute('docker exec app sh -c "echo hello > /data/my-note.txt"')
    s.execute('docker stop app')
    s.execute('docker rm app')
    s.execute('docker run -d --name app -v appdata:/data nginx')
    const r = evaluateLab(lab, s.state)
    expect(r.steps.find((x) => x.id === 's3')!.done).toBe(true)
    expect(r.steps.find((x) => x.id === 's5')!.done).toBe(true)
    expect(r.done).toBe(true)
  })
})
