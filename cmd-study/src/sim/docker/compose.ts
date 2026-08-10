import yaml from 'js-yaml'
import type { CommandResult, DockerPort, SimState } from '../types'
import { err, ok } from '../shell/registry'
import { normalizePath, walk } from '../vfs/paths'
import { createContainer, execInContainer, syncContainerVolumes } from './container'
import { buildImageFromDockerfile, dockerfileBuildResult } from './dockerfile'
import { findContainer, findImage, networkId } from './state'

export interface ParsedComposeService {
  name: string
  image?: string
  build?: string
  command?: string
  ports: DockerPort[]
  env: Record<string, string>
  volumes: string[]
  networks: string[]
  dependsOn: string[]
  restart?: string
  healthcheck: string | null
}

const SERVICE_KEYS = [
  'image',
  'build',
  'command',
  'ports',
  'environment',
  'volumes',
  'networks',
  'depends_on',
  'restart',
  'healthcheck',
  'container_name',
]
const TOP_KEYS = ['version', 'services', 'volumes', 'networks']

export function parseCompose(content: string): { services: ParsedComposeService[]; error?: string } {
  let doc: unknown
  try {
    doc = yaml.load(content)
  } catch (e) {
    return { services: [], error: `compose.yaml 解析失败: ${String(e)}` }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { services: [], error: 'compose.yaml 顶层必须是映射（version/services）' }
  }
  const top = doc as Record<string, unknown>
  for (const k of Object.keys(top)) {
    if (!TOP_KEYS.includes(k)) {
      return { services: [], error: `compose.yaml 顶层键 '${k}' 不被支持（仅支持 version/services/volumes/networks）` }
    }
  }
  const servicesRaw = top.services
  if (!servicesRaw || typeof servicesRaw !== 'object' || Array.isArray(servicesRaw)) {
    return { services: [], error: 'compose.yaml 缺少 services 定义' }
  }
  const services: ParsedComposeService[] = []
  for (const [name, raw] of Object.entries(servicesRaw as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { services: [], error: `service '${name}' 必须是映射` }
    }
    const svc = raw as Record<string, unknown>
    for (const k of Object.keys(svc)) {
      if (!SERVICE_KEYS.includes(k)) {
        return { services: [], error: `service '${name}' 的键 '${k}' 不被支持（模拟器仅支持：${SERVICE_KEYS.join(', ')}）` }
      }
    }
    const ports: DockerPort[] = []
    if (svc.ports !== undefined) {
      if (!Array.isArray(svc.ports)) return { services: [], error: `service '${name}' 的 ports 必须是列表` }
      for (const p of svc.ports) {
        const spec = String(p)
        const parts = spec.split(':')
        let host: number
        let container: number
        if (parts.length === 2) {
          host = Number(parts[0])
          container = Number(parts[1])
        } else if (parts.length === 1) {
          container = Number(parts[0])
          host = container
        } else {
          return { services: [], error: `service '${name}' 的端口映射 '${spec}' 格式无效` }
        }
        if (!Number.isInteger(host) || !Number.isInteger(container)) {
          return { services: [], error: `service '${name}' 的端口映射 '${spec}' 格式无效` }
        }
        ports.push({ host, container, proto: 'tcp' })
      }
    }
    const env: Record<string, string> = {}
    if (svc.environment !== undefined) {
      if (Array.isArray(svc.environment)) {
        for (const e of svc.environment) {
          const s = String(e)
          const eq = s.indexOf('=')
          if (eq <= 0) return { services: [], error: `service '${name}' 的环境变量 '${s}' 格式无效（应为 KEY=value）` }
          env[s.slice(0, eq)] = s.slice(eq + 1)
        }
      } else if (typeof svc.environment === 'object' && svc.environment !== null) {
        for (const [k, v] of Object.entries(svc.environment as Record<string, unknown>)) {
          env[k] = String(v)
        }
      } else {
        return { services: [], error: `service '${name}' 的 environment 格式无效` }
      }
    }
    const volumes = (svc.volumes as unknown[] | undefined)?.map((v) => String(v)) ?? []
    for (const v of volumes) {
      const parts = v.split(':')
      if (parts.length !== 2 && parts.length !== 1) {
        return { services: [], error: `service '${name}' 的卷 '${v}' 格式无效（应为 VOLUME:PATH）` }
      }
      if (parts.length === 2 && !parts[0].startsWith('/') && !parts[1].startsWith('/')) {
        // 命名卷:PATH 合法；绑定挂载（/host:/ctr）不支持
      }
      if (parts.length === 2 && parts[0].startsWith('/')) {
        return { services: [], error: `service '${name}' 的绑定挂载 '${v}' 不被支持（模拟器仅支持命名卷）` }
      }
    }
    const networks = (svc.networks as unknown[] | undefined)?.map((n) => String(n)) ?? []
    const dependsOn = (svc.depends_on as unknown[] | undefined)?.map((d) => String(d)) ?? []
    const restart = svc.restart !== undefined ? String(svc.restart) : undefined
    let healthcheck: string | null = null
    if (svc.healthcheck !== undefined) {
      if (typeof svc.healthcheck !== 'object' || svc.healthcheck === null || Array.isArray(svc.healthcheck)) {
        return { services: [], error: `service '${name}' 的 healthcheck 必须是映射` }
      }
      const hc = svc.healthcheck as Record<string, unknown>
      if (hc.test === undefined) return { services: [], error: `service '${name}' 的 healthcheck 缺少 test` }
      if (Array.isArray(hc.test)) {
        const t = hc.test as unknown[]
        healthcheck = String(t[t.length - 1])
      } else {
        healthcheck = String(hc.test).replace(/^CMD\s+/, '')
      }
    }
    services.push({
      name,
      image: svc.image !== undefined ? String(svc.image) : undefined,
      build: svc.build !== undefined ? String(svc.build) : undefined,
      command: svc.command !== undefined ? String(svc.command) : undefined,
      ports,
      env,
      volumes,
      networks,
      dependsOn,
      restart,
      healthcheck,
    })
  }
  return { services }
}

function orderServices(services: ParsedComposeService[]): ParsedComposeService[] {
  const out: ParsedComposeService[] = []
  const placed = new Set<string>()
  const names = new Set(services.map((s) => s.name))
  let guard = 0
  while (out.length < services.length && guard++ < services.length * 2) {
    for (const s of services) {
      if (placed.has(s.name)) continue
      if (s.dependsOn.every((d) => !names.has(d) || placed.has(d))) {
        out.push(s)
        placed.add(s.name)
      }
    }
  }
  for (const s of services) if (!placed.has(s.name)) out.push(s)
  return out
}

export function composeProjectName(): string {
  return 'compose'
}

export function composeUp(state: SimState, content: string, composeDir: string): CommandResult {
  const parsed = parseCompose(content)
  if (parsed.error) return err(parsed.error, 125)
  const services = orderServices(parsed.services)
  const out: string[] = []
  const projectNet = composeProjectName() + '_default'
  if (!state.docker.networks.some((n) => n.name === projectNet)) {
    state.docker.networks.push({ id: networkId(projectNet), name: projectNet, driver: 'bridge', scope: 'local', subnet: '172.20.0.0/16' })
    out.push(`Creating network "${projectNet}" with driver "bridge"`)
  }
  const usedNames = new Set(state.docker.containers.map((c) => c.name))
  for (const s of services) {
    let imageRef = s.image
    if (!imageRef && s.build) {
      const dfPath = normalizePath(composeDir, s.build === '.' ? 'Dockerfile' : s.build + '/Dockerfile', '/')
      const dfNode = walk(state.fsRoot, dfPath)
      if (!dfNode || dfNode.kind !== 'file') {
        return err(`ERROR: Service '${s.name}' failed to build: Cannot locate specified Dockerfile: ${dfPath}`, 125)
      }
      const tag = `${composeProjectName()}_${s.name}`
      const build = buildImageFromDockerfile({ state, baseDir: composeDir, tag }, dfNode.content)
      if (build.error) return err(build.error, 125)
      imageRef = tag
      out.push(`Building ${s.name}`)
    }
    if (!imageRef) return err(`ERROR: Service '${s.name}' needs an image or build`, 125)
    if (!findImage(state.docker, imageRef.split(':')[0], imageRef.includes(':') ? imageRef.split(':')[1] : 'latest')) {
      return err(`ERROR: image ${imageRef} not found for service '${s.name}'（请先 docker pull 或配置 build）`, 125)
    }
    const containerName = `${composeProjectName()}-${s.name}-1`
    if (usedNames.has(containerName)) continue
    const cmdArgs = s.command ? s.command.split(/\s+/) : undefined
    const networks = s.networks.length > 0 ? s.networks : [projectNet]
    for (const n of networks) {
      if (!state.docker.networks.some((x) => x.name === n)) {
        state.docker.networks.push({ id: networkId(n), name: n, driver: 'bridge', scope: 'local', subnet: '172.21.0.0/16' })
        out.push(`Creating network "${n}" with driver "bridge"`)
      }
    }
    const res = createContainer(state, {
      name: containerName,
      image: imageRef,
      cmdArgs,
      ports: s.ports,
      env: s.env,
      volumes: s.volumes,
      network: networks[0],
      restart: s.restart,
      healthcheck: s.healthcheck,
    })
    if (res.exitCode !== 0) return err(res.stderr || res.stdout, 125)
    out.push(`Creating ${containerName} ... done`)
  }
  out.push(`Container ${services.map((s) => `${composeProjectName()}-${s.name}-1`).join(' ')} 已启动`)
  return ok(out.join('\n') + '\n')
}

function composeContainers(state: SimState, services: ParsedComposeService[]): { name: string; ctr: (typeof state.docker.containers)[number] }[] {
  const names = new Set(services.map((s) => `${composeProjectName()}-${s.name}-1`))
  return state.docker.containers.filter((c) => names.has(c.name)).map((ctr) => ({ name: ctr.name, ctr }))
}

export function composePs(state: SimState, content: string): CommandResult {
  const parsed = parseCompose(content)
  if (parsed.error) return err(parsed.error, 125)
  const items = composeContainers(state, parsed.services)
  const lines = ['NAME                IMAGE     STATUS           PORTS']
  for (const { ctr } of items) {
    const status = ctr.status === 'running' ? 'Up' : ctr.status === 'exited' ? `Exited (${ctr.exitCode ?? 0})` : 'Created'
    const health = ctr.health === 'none' ? '' : ` (${ctr.health})`
    const ports = ctr.ports.map((p) => `${p.host}:${p.container}`).join(', ')
    lines.push(`${ctr.name.padEnd(20)}${(ctr.image).slice(0, 10).padEnd(12)}${(status + health).padEnd(16)}${ports}`)
  }
  return ok(lines.join('\n') + '\n')
}

export function composeLogs(state: SimState, content: string, tail: number | null): CommandResult {
  const parsed = parseCompose(content)
  if (parsed.error) return err(parsed.error, 125)
  const items = composeContainers(state, parsed.services)
  const out: string[] = []
  for (const { name, ctr } of items) {
    let lines = ctr.logLines
    if (tail !== null) lines = lines.slice(-Math.max(0, tail))
    for (const l of lines) out.push(`${name}  | ${l}`)
  }
  return ok(out.join('\n') + (out.length ? '\n' : ''))
}

export function composeStop(state: SimState, content: string): CommandResult {
  const parsed = parseCompose(content)
  if (parsed.error) return err(parsed.error, 125)
  for (const { ctr } of composeContainers(state, parsed.services)) {
    if (ctr.status === 'running') {
      ctr.status = 'exited'
      ctr.exitCode = 0
      ctr.stopTick = state.clock
      syncContainerVolumes(state, ctr)
    }
  }
  return ok('Stopping containers... done\n')
}

export function composeDown(state: SimState, content: string): CommandResult {
  const parsed = parseCompose(content)
  if (parsed.error) return err(parsed.error, 125)
  const out: string[] = []
  for (const { name, ctr } of composeContainers(state, parsed.services)) {
    syncContainerVolumes(state, ctr)
    out.push(`Removing ${name} ... done`)
  }
  state.docker.containers = state.docker.containers.filter((c) => !composeContainers(state, parsed.services).some((i) => i.ctr.id === c.id))
  const projectNet = composeProjectName() + '_default'
  if (state.docker.networks.some((n) => n.name === projectNet)) {
    state.docker.networks = state.docker.networks.filter((n) => n.name !== projectNet)
    out.push(`Removing network ${projectNet}`)
  }
  return ok(out.join('\n') + (out.length ? '\n' : ''))
}

export function composeExec(state: SimState, content: string, service: string, cmdLine: string): CommandResult {
  const parsed = parseCompose(content)
  if (parsed.error) return err(parsed.error, 125)
  const target = parsed.services.find((s) => s.name === service)
  if (!target) return err(`ERROR: no such service: ${service}`, 125)
  const ctr = findContainer(state.docker, `${composeProjectName()}-${service}-1`)
  if (!ctr) return err(`ERROR: container ${composeProjectName()}-${service}-1 not running`, 125)
  if (ctr.status !== 'running') return err(`ERROR: container ${composeProjectName()}-${service}-1 is not running`, 125)
  return execInContainer(state, ctr, cmdLine)
}
