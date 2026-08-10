import type { CommandResult, DockerContainer, DockerPort, FsNode, SimState } from '../types'
import { err, ok } from '../shell/registry'
import { parseInput } from '../shell/lexer'
import { runPipeline } from '../shell/executor'
import { getParent, walk } from '../vfs/paths'
import {
  AUTO_NAMES,
  IMAGE_CATALOG,
  cloneNode,
  containerId,
  containerIP,
  findContainer,
  findImage,
} from './state'

export interface ContainerSpec {
  name?: string
  image: string
  cmdArgs?: string[]
  ports?: DockerPort[]
  env?: Record<string, string>
  volumes?: string[]
  network?: string
  restart?: string
  rmOnExit?: boolean
  healthcheck?: string | null
  memory?: string
  cpus?: string
}

function bootLogsFor(imageRepo: string): string[] {
  return IMAGE_CATALOG[imageRepo]?.bootLogs ?? ['/bin/sh: can\'t open /dev/tty: No such device or address']
}

export function restoreContainerVolumes(state: SimState, ctr: DockerContainer): void {
  for (const m of ctr.mounts) {
    const idx = m.indexOf(':')
    if (idx === -1) continue
    const volName = m.slice(0, idx)
    const path = m.slice(idx + 1)
    const vol = state.docker.volumes.find((v) => v.name === volName)
    const par = getParent(ctr.fsRoot, path)
    if (!vol || !par || !par.parent.children) continue
    par.parent.children[par.name] = vol.tree
      ? cloneNode(vol.tree, par.name)
      : { kind: 'dir', name: par.name, content: '', mode: 0o755, uid: 0, gid: 0, mtime: ctr.created, children: {} }
  }
}

export function syncContainerVolumes(state: SimState, ctr: DockerContainer): void {
  for (const m of ctr.mounts) {
    const idx = m.indexOf(':')
    if (idx === -1) continue
    const volName = m.slice(0, idx)
    const path = m.slice(idx + 1)
    const vol = state.docker.volumes.find((v) => v.name === volName)
    if (!vol) continue
    const node = walk(ctr.fsRoot, path)
    if (node) vol.tree = cloneNode(node)
  }
}

export function createContainer(state: SimState, spec: ContainerSpec): CommandResult {
  const imageRef = spec.image
  const repo = imageRef.includes(':') ? imageRef.slice(0, imageRef.lastIndexOf(':')) : imageRef
  const tag = imageRef.includes(':') ? imageRef.slice(imageRef.lastIndexOf(':') + 1) : 'latest'
  const image = findImage(state.docker, repo, tag)
  if (!image) {
    return err(
      `Unable to find image '${repo}:${tag}' locally\n` +
        `docker: Error response from daemon: pull access denied for ${repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`,
      125,
    )
  }

  const name = spec.name
  if (name) {
    const existing = findContainer(state.docker, name)
    if (existing) {
      return err(
        `docker: Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${existing.id}". You have to remove (or rename) that container to be able to reuse that name.`,
        125,
      )
    }
  }
  const autoName =
    name ??
    AUTO_NAMES[(state.docker.seq - 1) % AUTO_NAMES.length] +
      (state.docker.seq > AUTO_NAMES.length ? state.docker.seq : '')

  const ports = spec.ports ?? []
  for (const other of state.docker.containers) {
    if (other.status !== 'running') continue
    for (const op of other.ports) {
      for (const np of ports) {
        if (np.host === op.host) {
          return err(
            `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${autoName}: Bind for 0.0.0.0:${np.host} failed: port is already allocated`,
            125,
          )
        }
      }
    }
  }

  const network = spec.network ?? 'bridge'
  if (!state.docker.networks.some((n) => n.name === network)) {
    return err(`docker: Error response from daemon: network ${network} not found`, 125)
  }

  const mounts: string[] = []
  for (const v of spec.volumes ?? []) {
    const idx = v.indexOf(':')
    const volName = idx === -1 ? v : v.slice(0, idx)
    const path = idx === -1 ? '/' + volName : v.slice(idx + 1)
    if (!state.docker.volumes.some((vol) => vol.name === volName)) {
      state.docker.volumes.push({ name: volName, driver: 'local', mountpoint: `/var/lib/docker/volumes/${volName}/_data`, tree: null })
    }
    mounts.push(`${volName}:${path}`)
  }

  const catalog = IMAGE_CATALOG[repo]
  const cmdArgs = spec.cmdArgs ?? image.cmd ?? (catalog ? catalog.command.split(' ') : [repo])
  const command = cmdArgs.join(' ')
  const ctr: DockerContainer = {
    id: containerId(state.docker.seq),
    name: autoName,
    image: `${repo}:${tag}`,
    imageId: image.id,
    command,
    created: state.clock,
    status: 'running',
    exitCode: null,
    ports,
    mounts,
    network,
    rmOnExit: spec.rmOnExit ?? false,
    restartPolicy: spec.restart ?? 'no',
    logLines: bootLogsFor(repo),
    startTick: state.clock,
    stopTick: null,
    fsRoot: cloneNode(image.fsRoot),
    env: { ...(image.env ?? {}), ...(spec.env ?? {}) },
    workdir: image.workdir,
    exposedPorts: [...(image.exposedPorts ?? [])],
    health: spec.healthcheck ? 'healthy' : 'none',
    healthcheck: spec.healthcheck ?? null,
    limits: { memory: spec.memory, cpus: spec.cpus },
    ip: null,
  }
  restoreContainerVolumes(state, ctr)
  ctr.ip = containerIP(state.docker, ctr)
  state.docker.containers.push(ctr)
  state.docker.seq += 1
  return ok(ctr.id)
}

export function execInContainer(state: SimState, ctr: DockerContainer, cmdLine: string): CommandResult {
  const env = {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: '/root',
    HOSTNAME: ctr.id.slice(0, 12),
    PWD: ctr.workdir ?? '/',
    ...ctr.env,
  }
  let cmd = cmdLine.trim()
  let parsed = parseInput(cmd, env)
  if (parsed.pipelines.length > 0) {
    const args0 = parsed.pipelines[0].commands[0].args
    if (args0[0] === 'sh' && (args0[1] === '-c' || args0[1] === '-lc') && args0[2]) {
      cmd = args0[2]
      parsed = parseInput(cmd, env)
    }
  }
  if (parsed.pipelines.length === 0 || parsed.incomplete) {
    return err(`exec: invalid command: '${cmdLine}'`, 127)
  }
  const tmp: SimState = {
    ...state,
    fsRoot: ctr.fsRoot,
    env,
    cwd: ctr.workdir ?? '/',
    uid: 0,
    gids: [0],
    history: [],
    exitCodes: [],
    clock: state.clock,
  }
  let stdout = ''
  let stderr = ''
  let exitCode = 0
  for (const pipeline of parsed.pipelines) {
    const r = runPipeline(tmp, pipeline)
    stdout += r.stdout
    stderr += r.stderr
    exitCode = r.exitCode
  }
  ctr.fsRoot = tmp.fsRoot
  syncContainerVolumes(state, ctr)
  return { stdout, stderr, exitCode }
}

export function ensureFsDir(root: FsNode, abs: string): FsNode | null {
  const parts = abs.split('/').filter(Boolean)
  let node: FsNode = root
  for (const seg of parts) {
    if (!node.children) return null
    let child = node.children[seg]
    if (!child) {
      child = { kind: 'dir', name: seg, content: '', mode: 0o755, uid: 0, gid: 0, mtime: 0, children: {} }
      node.children[seg] = child
    }
    if (child.kind !== 'dir') return null
    node = child
  }
  return node
}
