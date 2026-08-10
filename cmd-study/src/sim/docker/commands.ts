import type { CommandResult, DockerContainer, DockerImage, DockerPort, SimState } from '../types'
import { err, ok, register } from '../shell/registry'
import { normalizePath, walk } from '../vfs/paths'
import { createContainer, execInContainer, syncContainerVolumes } from './container'
import { buildImageFromDockerfile, dockerfileBuildResult } from './dockerfile'
import {
  composeDown,
  composeExec,
  composeLogs,
  composePs,
  composeStop,
  composeUp,
  parseCompose,
} from './compose'
import {
  IMAGE_CATALOG,
  buildImageFs,
  cloneNode,
  containerIP,
  dockerAge,
  dockerUp,
  findContainer,
  findImage,
  imageId,
  networkId,
} from './state'

const RUN_FLAGS = ['d', 'i', 't', 'e', 'p', 'v', 'n', 'r']
const RUN_LONG_FLAGS = ['detach', 'name', 'publish', 'interactive', 'tty', 'env', 'volume', 'network', 'restart', 'rm', 'health-cmd', 'memory', 'cpus', 'help']

function dockerHelp(cmd: string): string {
  const lines: Record<string, string[]> = {
    '': [
      '',
      'Usage:  docker [OPTIONS] COMMAND',
      '',
      'Management Commands:',
      '  version     Show the Docker version information',
      '  info        Display system-wide information',
      '  build       Build an image from a Dockerfile',
      '  compose     Define and run multi-container applications',
      '',
      'Commands:',
      '  images      List images',
      '  pull        Pull an image from a registry',
      '  ps          List containers',
      '  run         Create and run a new container',
      '  start       Start one or more stopped containers',
      '  stop        Stop one or more running containers',
      '  restart     Restart one or more containers',
      '  rm          Remove one or more containers',
      '  rmi         Remove one or more images',
      '  tag         Create a tag for an image',
      '  history     Show the history of an image',
      '  logs        Fetch the logs of a container',
      '  exec        Run a command in a running container',
      '  inspect     Return low-level information on Docker objects',
      '  network     Manage networks (create/ls/inspect/connect)',
      '  volume      Manage volumes (create/ls/inspect/rm)',
      '',
      "Run 'docker COMMAND --help' for more information on a command.",
      '',
    ],
    run: [
      '',
      'Usage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]',
      '',
      'Options (simulated subset):',
      '  -d, --detach            Run container in background',
      '  -i, --interactive       Keep STDIN open',
      '  -t, --tty               Allocate a pseudo-TTY',
      '      --name string       Assign a name to the container',
      '  -p, --publish list      Publish a container port (e.g. 8080:80)',
      '  -v, --volume list       Mount a volume (e.g. data:/data)',
      '  -e, --env list          Set environment variables (e.g. NAME=value)',
      '      --network string    Connect to a network (bridge/custom)',
      '      --restart string    Restart policy (no/always/unless-stopped)',
      '      --rm                Automatically remove the container when it stops',
      '      --health-cmd string Health check command (e.g. "curl -f http://localhost:3000/health")',
      '      --memory string     Memory limit (e.g. 128m, 1g)',
      '      --cpus string       CPU limit (e.g. 0.5, 1.5)',
      '',
    ],
    images: ['', 'Usage:  docker images [REPOSITORY[:TAG]]', '', 'List images.', ''],
    pull: ['', 'Usage:  docker pull NAME[:TAG]', '', 'Pull an image from a registry.', ''],
    ps: [
      '',
      'Usage:  docker ps [OPTIONS]',
      '',
      'Options (simulated subset):',
      '  -a, --all    Show all containers (default shows just running)',
      '  -q, --quiet  Only display container IDs',
      '',
    ],
    start: ['', 'Usage:  docker start CONTAINER', '', 'Start one or more stopped containers.', ''],
    stop: ['', 'Usage:  docker stop CONTAINER', '', 'Stop one or more running containers.', ''],
    restart: ['', 'Usage:  docker restart CONTAINER', '', 'Restart one or more containers.', ''],
    rm: ['', 'Usage:  docker rm [OPTIONS] CONTAINER', '', 'Remove one or more containers.', ''],
    rmi: ['', 'Usage:  docker rmi [OPTIONS] IMAGE [IMAGE...]', '', 'Remove one or more images.', ''],
    tag: ['', 'Usage:  docker tag SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]', '', 'Create a tag for an image.', ''],
    history: ['', 'Usage:  docker history IMAGE', '', 'Show the history of an image.', ''],
    logs: [
      '',
      'Usage:  docker logs [OPTIONS] CONTAINER',
      '',
      'Options (simulated subset):',
      '  -f, --follow    Follow log output',
      '      --tail int  Number of lines to show from the end',
      '',
    ],
    exec: [
      '',
      'Usage:  docker exec [OPTIONS] CONTAINER COMMAND [ARG...]',
      '',
      'Options (simulated subset):',
      '  -i, --interactive  Keep STDIN open',
      '  -t, --tty          Allocate a pseudo-TTY',
      '  -u, --user         Username or UID',
      '',
    ],
    inspect: ['', 'Usage:  docker inspect [OPTIONS] NAME|ID', '', 'Return low-level information on Docker objects.', ''],
    build: [
      '',
      'Usage:  docker build [OPTIONS] PATH',
      '',
      'Options (simulated subset):',
      '  -t, --tag string  Name and optionally a tag (e.g. myapp:v1)',
      '',
    ],
    network: [
      '',
      'Usage:  docker network COMMAND',
      '',
      'Commands:',
      '  create     Create a network',
      '  ls         List networks',
      '  inspect    Inspect a network',
      '  connect    Connect a container to a network',
      '  disconnect Disconnect a container from a network',
      '',
    ],
    volume: [
      '',
      'Usage:  docker volume COMMAND',
      '',
      'Commands:',
      '  create   Create a volume',
      '  ls       List volumes',
      '  inspect  Inspect a volume',
      '  rm       Remove a volume',
      '',
    ],
    compose: [
      '',
      'Usage:  docker compose [-f FILE] COMMAND',
      '',
      'Commands:',
      '  up         Create and start services',
      '  ps         List services',
      '  logs       View output from services',
      '  exec       Execute a command in a running service container',
      '  stop       Stop services',
      '  down       Stop and remove services',
      '',
    ],
  }
  return lines[cmd].join('\n')
}

function unsupportedFlag(cmd: string, flag: string): CommandResult {
  return err(
    `docker: unknown flag: ${flag}\n` +
      `Run 'docker ${cmd} --help' for usage.\n` +
      `提示：模拟器仅支持以下参数：${RUN_LONG_FLAGS.filter((f) => f !== 'help').join(', ')}`,
    125,
  )
}

function parseRunFlags(
  args: string[],
  cmd: string,
): { flags: Map<string, string[]>; positionals: string[]; error?: CommandResult } {
  const flags = new Map<string, string[]>()
  const positionals: string[] = []
  const add = (k: string, v: string) => {
    const arr = flags.get(k) ?? []
    arr.push(v)
    flags.set(k, arr)
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq)
      if (name === 'help') return { flags, positionals, error: ok(dockerHelp(cmd)) }
      if (!RUN_LONG_FLAGS.includes(name)) return { flags, positionals, error: unsupportedFlag(cmd, a.slice(0, eq === -1 ? a.length : eq)) }
      const hasValue = ['name', 'publish', 'env', 'volume', 'network', 'restart', 'health-cmd', 'memory', 'cpus'].includes(name)
      if (hasValue) {
        if (eq !== -1) add(name, a.slice(eq + 1))
        else {
          const v = args[i + 1]
          if (v === undefined) return { flags, positionals, error: err(`flag needs an argument: --${name}`, 125) }
          add(name, v)
          i++
        }
      } else {
        add(name, '')
      }
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      if (a === '-d' || a === '-i' || a === '-t') {
        add(a.slice(1), '')
        continue
      }
      const short = a.slice(1)
      if (RUN_FLAGS.includes(short) && (short === 'e' || short === 'p' || short === 'v' || short === 'n')) {
        const v = args[i + 1]
        if (v === undefined) return { flags, positionals, error: err(`flag needs an argument: -${short}`, 125) }
        add(short, v)
        i++
        continue
      }
      const combined = short.split('')
      if (combined.every((c) => ['d', 'i', 't'].includes(c))) {
        for (const c of combined) add(c, '')
        continue
      }
      return { flags, positionals, error: unsupportedFlag(cmd, a) }
    }
    positionals.push(a)
  }
  return { flags, positionals }
}

function parsePortSpec(spec: string): { host: number; container: number } | null {
  const parts = spec.split(':')
  if (parts.length === 1) {
    const c = Number(parts[0])
    return Number.isInteger(c) && c > 0 && c < 65536 ? { host: c, container: c } : null
  }
  if (parts.length === 2) {
    const h = Number(parts[0])
    const c = Number(parts[1])
    return Number.isInteger(h) && Number.isInteger(c) && h > 0 && c > 0 && h < 65536 && c < 65536
      ? { host: h, container: c }
      : null
  }
  return null
}

function imageTag(imageRef: string): { repo: string; tag: string } {
  const colonIdx = imageRef.lastIndexOf(':')
  if (colonIdx > 0 && !imageRef.includes('/:')) {
    return { repo: imageRef.slice(0, colonIdx), tag: imageRef.slice(colonIdx + 1) }
  }
  return { repo: imageRef, tag: 'latest' }
}

function ensureImage(state: SimState, repo: string, tag: string): CommandResult & { image?: (typeof state.docker.images)[number] } {
  const existing = findImage(state.docker, repo, tag)
  if (existing) return { stdout: '', stderr: '', exitCode: 0, image: existing }
  if (!IMAGE_CATALOG[repo]) {
    return {
      stdout: '',
      stderr:
        `Unable to find image '${repo}:${tag}' locally\n` +
        `docker: Error response from daemon: pull access denied for ${repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`,
      exitCode: 125,
    }
  }
  const spec = IMAGE_CATALOG[repo]
  const img = {
    id: spec.id,
    repository: repo,
    tag,
    size: spec.size,
    created: state.clock,
    fsRoot: buildImageFs(spec),
    env: { ...(spec.env ?? {}) },
    cmd: spec.cmd ?? null,
    workdir: spec.workdir ?? null,
    exposedPorts: spec.exposedPorts ?? [],
    history: [],
    healthcheck: spec.healthcheck ?? null,
  }
  state.docker.images.push(img)
  return {
    stdout:
      `Unable to find image '${repo}:${tag}' locally\n${tag}: Pulling from library/${repo}\n` +
      'a8ca24154ec1: Pull complete\n1f2a3b4c5d6e: Pull complete\n' +
      `Digest: sha256:3a5e8f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f\n` +
      `Status: Downloaded newer image for ${repo}:${tag}\n`,
    stderr: '',
    exitCode: 0,
    image: img,
  }
}

function runContainer(state: SimState, args: string[]): CommandResult {
  const parsed = parseRunFlags(args, 'run')
  if (parsed.error) return parsed.error
  const flags = parsed.flags
  const positionals = parsed.positionals
  if (positionals.length === 0) return err(dockerHelp('run'), 125)
  const imageRef = positionals[0]
  const cmdArgs = positionals.slice(1)
  const { repo, tag } = imageTag(imageRef)
  const detached = flags.has('d') || flags.has('detach')

  const ensured = ensureImage(state, repo, tag)
  if (ensured.exitCode !== 0) return { stdout: '', stderr: ensured.stderr, exitCode: ensured.exitCode }

  const ports: DockerPort[] = []
  for (const spec of flags.get('p') ?? flags.get('publish') ?? []) {
    const parsedPort = parsePortSpec(spec)
    if (!parsedPort) {
      return err(`docker: Error response from daemon: invalid port specification: "${spec}"`, 125)
    }
    ports.push({ ...parsedPort, proto: 'tcp' })
  }

  const env: Record<string, string> = {}
  for (const e of flags.get('e') ?? flags.get('env') ?? []) {
    const eq = e.indexOf('=')
    if (eq <= 0) return err(`docker: invalid environment variable: "${e}"`, 125)
    env[e.slice(0, eq)] = e.slice(eq + 1)
  }

  const healthCmd = flags.get('health-cmd')?.[0] ?? null
  const memory = flags.get('memory')?.[0]
  const cpus = flags.get('cpus')?.[0]

  const res = createContainer(state, {
    name: flags.get('name')?.[0],
    image: `${repo}:${tag}`,
    cmdArgs,
    ports,
    env,
    volumes: flags.get('v') ?? flags.get('volume') ?? [],
    network: flags.get('network')?.[0] ?? 'bridge',
    restart: flags.get('restart')?.[0] ?? 'no',
    rmOnExit: flags.has('rm'),
    healthcheck: healthCmd,
    memory,
    cpus,
  })
  if (res.exitCode !== 0) return res
  const ctr = findContainer(state.docker, res.stdout.trim())!
  const head = detached ? ctr.id : ctr.logLines.join('\n')
  const body = ensured.stdout ? ensured.stdout + '\n' + head : head
  return ok(body + '\n')
}

function execContainerCmd(state: SimState, args: string[]): CommandResult {
  const KNOWN_EXEC_FLAGS = ['-i', '-t', '-it', '-u']
  const firstNonFlag = args.findIndex((a) => !a.startsWith('-'))
  const preFlags = args.slice(0, firstNonFlag === -1 ? args.length : firstNonFlag).filter((a) => a.startsWith('-'))
  const unknown = preFlags.filter((f) => !KNOWN_EXEC_FLAGS.includes(f))
  if (unknown.length > 0) {
    return err(`docker: unknown flag: ${unknown[0]}\nRun 'docker exec --help' for usage.`, 125)
  }
  const rest = args.filter((a) => !KNOWN_EXEC_FLAGS.includes(a))
  const name = rest[0]
  const cmdArgs = rest.slice(1)
  if (!name || cmdArgs.length === 0) {
    return err(`"docker exec" requires at least 2 arguments.\nSee 'docker exec --help'.`, 125)
  }
  const ctr = findContainer(state.docker, name)
  if (!ctr) return err(`Error response from daemon: No such container: ${name}`, 125)
  if (ctr.status !== 'running') {
    return err(`Error response from daemon: Container ${ctr.id} is not running`, 125)
  }
  const cmdLine = cmdArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
  return execInContainer(state, ctr, cmdLine)
}

function inspectObject(state: SimState, name: string): CommandResult {
  const ctr = findContainer(state.docker, name)
  if (ctr) {
    const obj = {
      Id: ctr.id,
      Created: new Date((1783000000 + ctr.created) * 60 * 1000).toISOString(),
      Path: ctr.command.split(' ')[0],
      Args: ctr.command.split(' ').slice(1),
      State: {
        Status: ctr.status,
        Running: ctr.status === 'running',
        Paused: false,
        Restarting: false,
        OOMKilled: false,
        Dead: false,
        Pid: ctr.status === 'running' ? 1234 + state.docker.containers.indexOf(ctr) : 0,
        ExitCode: ctr.exitCode ?? 0,
        StartedAt: ctr.startTick !== null ? new Date((1783000000 + ctr.startTick) * 60 * 1000).toISOString() : null,
        FinishedAt: ctr.stopTick !== null ? new Date((1783000000 + ctr.stopTick) * 60 * 1000).toISOString() : null,
        Health: ctr.health === 'none' ? undefined : { Status: ctr.health, FailingStreak: ctr.health === 'unhealthy' ? 3 : 0 },
      },
      Image: ctr.imageId,
      Name: '/' + ctr.name,
      Config: {
        Image: ctr.image,
        Cmd: ctr.command.split(' '),
        Env: Object.entries(ctr.env).map(([k, v]) => `${k}=${v}`),
        WorkingDir: ctr.workdir ?? '',
        ExposedPorts: Object.fromEntries(ctr.exposedPorts.map((p) => [`${p}/tcp`, {}])),
        Healthcheck: ctr.healthcheck ? { Test: ['CMD-SHELL', ctr.healthcheck] } : undefined,
        NetworkMode: ctr.network,
        Mounts: ctr.mounts,
      },
      HostConfig: {
        PortBindings: Object.fromEntries(ctr.ports.map((p) => [`${p.container}/tcp`, [{ HostPort: String(p.host) }]])),
        RestartPolicy: { Name: ctr.restartPolicy, MaximumRetryCount: 0 },
        Memory: ctr.limits.memory ? parseMemoryBytes(ctr.limits.memory) : 0,
        NanoCpus: ctr.limits.cpus ? Math.round(Number(ctr.limits.cpus) * 1e9) : 0,
      },
      NetworkSettings: {
        Networks: {
          [ctr.network]: {
            NetworkID: ctr.id.slice(0, 8) + '0'.repeat(56),
            IPAddress: ctr.ip ?? containerIP(state.docker, ctr),
            Ports: Object.fromEntries(ctr.ports.map((p) => [`${p.container}/tcp`, [{ HostIp: '0.0.0.0', HostPort: String(p.host) }]])),
          },
        },
      },
    }
    return ok(JSON.stringify([obj], null, 4) + '\n')
  }
  const img = state.docker.images.find((i) => i.repository === name || `${i.repository}:${i.tag}` === name)
  if (img) {
    const obj = {
      Id: 'sha256:' + img.id + '0000000000000000000000000000000000000000000000000000',
      RepoTags: [`${img.repository}:${img.tag}`],
      Created: new Date((1783000000 + img.created) * 60 * 1000).toISOString(),
      Size: img.size,
      Config: {
        Cmd: img.cmd ? [...img.cmd] : null,
        Env: Object.entries(img.env).map(([k, v]) => `${k}=${v}`),
        WorkingDir: img.workdir ?? '',
        ExposedPorts: Object.fromEntries(img.exposedPorts.map((p) => [`${p}/tcp`, {}])),
        Healthcheck: img.healthcheck ? { Test: ['CMD-SHELL', img.healthcheck] } : undefined,
      },
      History: img.history.length > 0 ? img.history.map((h) => ({ CreatedBy: h })) : undefined,
    }
    return ok(JSON.stringify([obj], null, 4) + '\n')
  }
  const net = state.docker.networks.find((n) => n.name === name)
  if (net) {
    const members = state.docker.containers.filter((c) => c.network === net.name)
    const obj = {
      Name: net.name,
      Id: net.id,
      Created: new Date().toISOString(),
      Scope: net.scope,
      Driver: net.driver,
      IPAM: { Config: [{ Subnet: net.subnet ?? '172.17.0.0/16' }] },
      Containers: Object.fromEntries(
        members.map((c) => [c.id, { Name: c.name, IPv4Address: (c.ip ?? containerIP(state.docker, c)) + '/16' }]),
      ),
    }
    return ok(JSON.stringify([obj], null, 4) + '\n')
  }
  const vol = state.docker.volumes.find((v) => v.name === name)
  if (vol) {
    const users = state.docker.containers.filter((c) => c.mounts.some((m) => m.startsWith(vol.name + ':')))
    const obj = { Name: vol.name, Driver: vol.driver, Mountpoint: vol.mountpoint, CreatedAt: new Date().toISOString(), UsedBy: users.map((c) => c.id) }
    return ok(JSON.stringify([obj], null, 4) + '\n')
  }
  return err(`Error: No such object: ${name}`, 125)
}

function parseMemoryBytes(spec: string): number {
  const m = /^(\d+)([kmg]?)$/i.exec(spec)
  if (!m) return 0
  const n = Number(m[1])
  const unit = (m[2] || 'b').toLowerCase()
  return n * (unit === 'k' ? 1024 : unit === 'm' ? 1024 * 1024 : unit === 'g' ? 1024 * 1024 * 1024 : 1)
}

function registerDockerCommands(): void {
  register('docker', (ctx) => {
    const state = ctx.state
    const sub = ctx.args[1]
    if (!sub) return err(dockerHelp(''), 125)
    if (sub === '--help' || sub === 'help') return ok(dockerHelp(''))
    if (sub === '--version') {
      return ok('Docker version 24.0.7, build afdd53b\n')
    }
    if (sub === 'run') return runContainer(ctx.state, ctx.args.slice(2))
    if (sub === 'exec') {
      const execArgs = ctx.args.slice(2)
      if (execArgs.includes('--help')) return ok(dockerHelp('exec'))
      return execContainerCmd(ctx.state, execArgs)
    }

    const flagArgs = ctx.args.slice(2)
    if (flagArgs.includes('--help')) return ok(dockerHelp(sub))
    const rest = flagArgs.filter((a) => !a.startsWith('-'))
    const flags = flagArgs.filter((a) => a.startsWith('-'))

    const hasFlag = (name: string) => flags.some((f) => f.replace(/^-+/, '') === name)
    const flagValue = (name: string): string | undefined => {
      const f = flags.find((x) => x.startsWith('--' + name + '='))
      if (f) return f.slice(f.indexOf('=') + 1)
      const idx = flags.indexOf('--' + name)
      if (idx !== -1) return flags[idx + 1]
      return undefined
    }

    switch (sub) {
      case 'version':
        return ok(
          'Client:\n' +
            ' Version:           24.0.7\n' +
            ' API version:       1.43\n' +
            ' Go version:        go1.21.5\n' +
            ' Git commit:        afdd53b\n' +
            ' Built:             Thu Oct 26 09:08:41 2023\n' +
            ' OS/Arch:           linux/amd64\n' +
            ' Context:           default\n\n' +
            'Server:\n' +
            ' Engine:\n' +
            '  Version:          24.0.7\n' +
            '  API version:      1.43 (minimum version 1.12)\n' +
            '  Go version:       go1.21.5\n' +
            '  Git commit:       3119f40\n' +
            '  Built:            Thu Oct 26 09:08:41 2023\n' +
            '  OS/Arch:          linux/amd64\n' +
            '  Experimental:     false\n',
        )
      case 'info':
        return ok(
          `Client:\n Context:    default\n Debug Mode: false\n\n` +
            `Server:\n Containers: ${state.docker.containers.length}\n  Running: ${state.docker.containers.filter((c) => c.status === 'running').length}\n  Paused: 0\n  Stopped: ${state.docker.containers.filter((c) => c.status === 'exited').length}\n` +
            ` Images: ${state.docker.images.length}\n Server Version: 24.0.7\n Storage Driver: overlay2\n Logging Driver: json-file\n Cgroup Driver: cgroupfs\n` +
            ` Plugins:\n  Volume: local\n  Network: bridge host ipvlan macvlan null overlay\n Swarm: inactive\n` +
            ` Operating System: CmdLab Linux 1.0\n OSType: linux\n Architecture: x86_64\n CPUs: 2\n Total Memory: 3.841GiB\n` +
            ` Docker Root Dir: /var/lib/docker\n` +
            ` Networks: ${state.docker.networks.length}\n Volumes: ${state.docker.volumes.length}\n`,
        )
      case 'images': {
        const filter = rest[0]
        const rows = state.docker.images
          .filter((i) => !filter || i.repository === filter || `${i.repository}:${i.tag}` === filter)
          .sort((a, b) => a.repository.localeCompare(b.repository))
        const lines = ['REPOSITORY   TAG       IMAGE ID       CREATED       SIZE']
        for (const i of rows) {
          lines.push(
            `${i.repository.padEnd(12)}${i.tag.padEnd(10)}${i.id.padEnd(15)}${dockerAge(state.clock, state.clock - i.created).padEnd(14)}${i.size}`,
          )
        }
        if (rows.length === 0) lines.push('')
        return ok(lines.join('\n') + '\n')
      }
      case 'pull': {
        const ref = rest[0]
        if (!ref) return err(`"docker pull" requires exactly 1 argument.\nSee 'docker pull --help'.`, 125)
        const { repo, tag } = imageTag(ref)
        const existing = findImage(state.docker, repo, tag)
        if (existing) {
          return ok(`Using default tag: ${tag}\n${tag}: Pulling from library/${repo}\nDigest: sha256:3a5e8f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f\nStatus: Image is up to date for ${repo}:${tag}\n`)
        }
        const ensured = ensureImage(state, repo, tag)
        if (ensured.exitCode !== 0) return { stdout: '', stderr: ensured.stderr, exitCode: ensured.exitCode }
        return ok(ensured.stdout)
      }
      case 'ps': {
        const showAll = hasFlag('a') || hasFlag('all')
        const quiet = hasFlag('q')
        const rows = state.docker.containers.filter((c) => showAll || c.status === 'running')
        if (quiet) return ok(rows.map((c) => c.id).join('\n') + (rows.length ? '\n' : ''))
        const healthCol = rows.some((c) => c.health !== 'none')
        const lines = [
          `CONTAINER ID   IMAGE     COMMAND                 CREATED        STATUS         PORTS                 NAMES${healthCol ? '            HEALTH' : ''}`,
        ]
        for (const c of rows) {
          const status =
            c.status === 'running'
              ? `Up ${dockerUp(state.clock, c.startTick ?? c.created)}`
              : c.status === 'exited'
                ? `Exited (${c.exitCode ?? 0}) ${dockerAge(state.clock, c.stopTick ?? c.created)}`
                : `Created ${dockerAge(state.clock, c.created)}`
          const ports = c.ports.map((p) => `0.0.0.0:${p.host}->${p.container}/tcp`).join(', ')
          const health = c.health === 'none' ? '' : ` ${c.health}`
          lines.push(
            `${c.id.padEnd(15)}${(c.image).slice(0, 10).padEnd(10)}${c.command.slice(0, 22).padEnd(24)}${dockerAge(state.clock, c.created).padEnd(15)}${status.padEnd(15)}${ports.padEnd(22)}${c.name}${healthCol ? health.padEnd(12) : ''}`,
          )
        }
        if (rows.length === 0) lines.push('')
        return ok(lines.join('\n') + '\n')
      }
      case 'start': {
        const name = rest[0]
        if (!name) return err(`"docker start" requires at least 1 argument.\nSee 'docker start --help'.`, 125)
        const ctr = findContainer(state.docker, name)
        if (!ctr) return err(`Error response from daemon: No such container: ${name}`, 125)
        if (ctr.status === 'running') return ok(ctr.name + '\n')
        ctr.status = 'running'
        ctr.exitCode = null
        ctr.startTick = state.clock
        ctr.stopTick = null
        ctr.health = ctr.healthcheck ? 'healthy' : ctr.health
        ctr.logLines.push(...(IMAGE_CATALOG[ctr.image.split(':')[0]]?.bootLogs ?? []))
        return ok(ctr.name + '\n')
      }
      case 'stop': {
        const name = rest[0]
        if (!name) return err(`"docker stop" requires at least 1 argument.\nSee 'docker stop --help'.`, 125)
        const ctr = findContainer(state.docker, name)
        if (!ctr) return err(`Error response from daemon: No such container: ${name}`, 125)
        if (ctr.status === 'running') {
          ctr.status = 'exited'
          ctr.exitCode = 0
          ctr.stopTick = state.clock
          ctr.health = ctr.health === 'none' ? 'none' : 'unhealthy'
          syncContainerVolumes(state, ctr)
        }
        if (ctr.rmOnExit) {
          state.docker.containers = state.docker.containers.filter((c) => c.id !== ctr.id)
        }
        return ok(ctr.name + '\n')
      }
      case 'restart': {
        const name = rest[0]
        if (!name) return err(`"docker restart" requires at least 1 argument.\nSee 'docker restart --help'.`, 125)
        const ctr = findContainer(state.docker, name)
        if (!ctr) return err(`Error response from daemon: No such container: ${name}`, 125)
        ctr.status = 'running'
        ctr.exitCode = null
        ctr.startTick = state.clock
        ctr.stopTick = null
        ctr.health = ctr.healthcheck ? 'healthy' : ctr.health
        syncContainerVolumes(state, ctr)
        ctr.logLines.push(...(IMAGE_CATALOG[ctr.image.split(':')[0]]?.bootLogs ?? []))
        return ok(ctr.name + '\n')
      }
      case 'rm': {
        const force = hasFlag('f')
        const name = rest[0]
        if (!name) return err(`"docker rm" requires at least 1 argument.\nSee 'docker rm --help'.`, 125)
        const ctr = findContainer(state.docker, name)
        if (!ctr) return err(`Error response from daemon: No such container: ${name}`, 125)
        if (ctr.status === 'running' && !force) {
          return err(
            `Error response from daemon: You cannot remove a running container ${ctr.id}. Stop the container before attempting removal or force remove`,
            125,
          )
        }
        syncContainerVolumes(state, ctr)
        state.docker.containers = state.docker.containers.filter((c) => c.id !== ctr.id)
        return ok(ctr.name + '\n')
      }
      case 'rmi': {
        const force = hasFlag('f')
        const ref = rest[0]
        if (!ref) return err(`"docker rmi" requires at least 1 argument.\nSee 'docker rmi --help'.`, 125)
        const { repo, tag } = imageTag(ref)
        const img = findImage(state.docker, repo, tag)
        if (!img) return err(`Error response from daemon: No such image: ${ref}`, 125)
        const used = state.docker.containers.some((c) => c.image === `${repo}:${tag}`)
        if (used && !force) {
          return err(
            `Error response from daemon: conflict: unable to remove repository reference "${repo}:${tag}" (must force) - container ${state.docker.containers.find((c) => c.image === `${repo}:${tag}`)!.id} is using its referenced image`,
            125,
          )
        }
        state.docker.images = state.docker.images.filter((i) => !(i.repository === repo && i.tag === tag))
        return ok(`Untagged: ${repo}:${tag}\nDeleted: sha256:${img.id}0000000000000000000000000000000000000000000000000000\n`)
      }
      case 'tag': {
        const src = rest[0]
        const dst = rest[1]
        if (!src || !dst) return err(`"docker tag" requires exactly 2 arguments.\nSee 'docker tag --help'.`, 125)
        const { repo: sRepo, tag: sTag } = imageTag(src)
        const { repo: dRepo, tag: dTag } = imageTag(dst)
        const img = findImage(state.docker, sRepo, sTag)
        if (!img) return err(`Error response from daemon: No such image: ${src}`, 125)
        if (findImage(state.docker, dRepo, dTag)) return err(`Error response from daemon: tag ${dRepo}:${dTag} already exists`, 125)
        state.docker.images.push({
          ...cloneImage(img),
          id: imageId(dRepo, dTag),
          repository: dRepo,
          tag: dTag,
        })
        return ok('')
      }
      case 'history': {
        const ref = rest[0]
        if (!ref) return err(`"docker history" requires exactly 1 argument.\nSee 'docker history --help'.`, 125)
        const { repo, tag } = imageTag(ref)
        const img = findImage(state.docker, repo, tag)
        if (!img) return err(`Error response from daemon: No such image: ${ref}`, 125)
        const lines = ['IMAGE          CREATED       CREATED BY                  SIZE']
        const history = img.history.length > 0 ? img.history : ['FROM scratch']
        for (const h of history.slice().reverse()) {
          lines.push(`${img.id.padEnd(15)}${dockerAge(state.clock, state.clock - img.created).padEnd(14)}${h.slice(0, 40).padEnd(42)}0B`)
        }
        return ok(lines.join('\n') + '\n')
      }
      case 'build': {
        let tag: string | undefined
        let context = '.'
        const args = flagArgs
        for (let i = 0; i < args.length; i++) {
          const a = args[i]
          if (a === '-t' || a === '--tag') {
            tag = args[i + 1]
            i++
            continue
          }
          if (a.startsWith('--tag=')) {
            tag = a.slice(6)
            continue
          }
          if (a.startsWith('-')) {
            return err(`docker: unknown flag: ${a}\nRun 'docker build --help' for usage.`, 125)
          }
          context = a
        }
        if (context !== '.') return err(`docker: build context '${context}' 不被支持（请使用 .）`, 125)
        const baseDir = state.cwd
        const dfNode = walk(state.fsRoot, normalizePath(baseDir, 'Dockerfile', state.env['HOME'] ?? '/home/student'))
        if (!dfNode || dfNode.kind !== 'file') {
          return err('Cannot locate specified Dockerfile: Dockerfile\n请先在代码编辑器中编写 Dockerfile 并保存。', 125)
        }
        const finalTag = tag ?? 'latest'
        const build = buildImageFromDockerfile({ state, baseDir, tag: finalTag }, dfNode.content)
        return dockerfileBuildResult(build)
      }
      case 'compose': {
        let file = 'compose.yaml'
        let cmdArgs = [...flagArgs]
        if (cmdArgs[0] === '-f' || cmdArgs[0] === '--file') {
          file = cmdArgs[1] ?? 'compose.yaml'
          cmdArgs = cmdArgs.slice(2)
        }
        if (cmdArgs[0] === undefined || cmdArgs[0] === '--help' || cmdArgs[0] === 'help') return ok(dockerHelp('compose'))
        if (cmdArgs.includes('--help')) return ok(dockerHelp('compose'))
        const composeAbs = normalizePath(state.cwd, file, state.env['HOME'] ?? '/home/student')
        const node = walk(state.fsRoot, composeAbs)
        if (!node || node.kind !== 'file') {
          return err(`ERROR: can't find a configuration file: ${file}\n请先在代码编辑器中编写 ${file} 并保存。`, 125)
        }
        const content = node.content
        const composeDir = composeAbs.slice(0, composeAbs.lastIndexOf('/'))
        const composeCmd = cmdArgs[0]
        switch (composeCmd) {
          case 'up': {
            const parsed = parseCompose(content)
            if (parsed.error) return err(parsed.error, 125)
            return composeUp(state, content, composeDir)
          }
          case 'ps':
            return composePs(state, content)
          case 'logs': {
            const tailIdx = cmdArgs.indexOf('--tail')
            const tail = tailIdx !== -1 ? Number(cmdArgs[tailIdx + 1]) : null
            return composeLogs(state, content, Number.isInteger(tail) ? tail : null)
          }
          case 'stop':
            return composeStop(state, content)
          case 'down':
            return composeDown(state, content)
          case 'exec': {
            const service = cmdArgs[1]
            const execCmd = cmdArgs.slice(2)
            if (!service || execCmd.length === 0) return err(`"docker compose exec" requires at least 2 arguments.`, 125)
            return composeExec(state, content, service, execCmd.join(' '))
          }
          default:
            return err(`docker: 'compose ${composeCmd}' is not a docker compose command.\nSee 'docker compose --help'`, 125)
        }
      }
      case 'logs': {
        const tailArg = flagValue('tail')
        const follow = hasFlag('f') || hasFlag('follow')
        const name = rest[0]
        if (!name) return err(`"docker logs" requires exactly 1 argument.\nSee 'docker logs --help'.`, 125)
        const ctr = findContainer(state.docker, name)
        if (!ctr) return err(`Error response from daemon: No such container: ${name}`, 125)
        let lines = ctr.logLines
        if (tailArg !== undefined) {
          const n = Number(tailArg)
          if (!Number.isInteger(n)) return err(`invalid value "${tailArg}" for "--tail" flag: invalid syntax`, 125)
          lines = lines.slice(-Math.max(0, n))
        }
        let out = lines.join('\n') + (lines.length ? '\n' : '')
        if (follow) {
          out += `\x1b[90m（docker logs -f 模拟模式：以上是当前末尾内容。真实系统会持续输出新日志直到 Ctrl+C。）\x1b[0m\n`
        }
        return ok(out)
      }
      case 'inspect': {
        const name = rest[0]
        if (!name) return err(`"docker inspect" requires exactly 1 argument.\nSee 'docker inspect --help'.`, 125)
        return inspectObject(state, name)
      }
      case 'volume': {
        const action = rest[0]
        if (action === 'ls' || action === 'list') {
          const lines = ['DRIVER    VOLUME NAME']
          for (const v of state.docker.volumes) {
            lines.push(`${v.driver.padEnd(10)}${v.name}`)
          }
          return ok(lines.join('\n') + '\n')
        }
        if (action === 'create') {
          const name = rest[1]
          if (!name) return err(`"docker volume create" requires exactly 1 argument.\nSee 'docker volume create --help'.`, 125)
          if (state.docker.volumes.some((v) => v.name === name)) return err(`Error response from daemon: create ${name}: volume already exists`, 125)
          state.docker.volumes.push({ name, driver: 'local', mountpoint: `/var/lib/docker/volumes/${name}/_data`, tree: null })
          return ok(name + '\n')
        }
        if (action === 'inspect') {
          const name = rest[1]
          if (!name) return err(`"docker volume inspect" requires exactly 1 argument.`, 125)
          return inspectObject(state, name)
        }
        if (action === 'rm') {
          const name = rest[1]
          if (!name) return err(`"docker volume rm" requires exactly 1 argument.`, 125)
          const vol = state.docker.volumes.find((v) => v.name === name)
          if (!vol) return err(`Error response from daemon: get ${name}: no such volume`, 125)
          const used = state.docker.containers.some((c) => c.mounts.some((m) => m.startsWith(name + ':')))
          if (used) return err(`Error response from daemon: remove ${name}: volume is in use (remove container first)`, 125)
          state.docker.volumes = state.docker.volumes.filter((v) => v.name !== name)
          return ok(name + '\n')
        }
        return err(`docker: 'volume ${action ?? ''}' is not a docker command.\nSee 'docker --help'`, 125)
      }
      case 'network': {
        const action = rest[0]
        if (action === 'ls' || action === 'list') {
          const lines = ['NETWORK ID     NAME      DRIVER    SCOPE']
          for (const n of state.docker.networks) {
            lines.push(`${n.id.padEnd(15)}${n.name.padEnd(10)}${n.driver.padEnd(10)}${n.scope}`)
          }
          return ok(lines.join('\n') + '\n')
        }
        if (action === 'create') {
          const name = rest[rest.length - 1]
          if (!name || rest.length < 2) return err(`"docker network create" requires exactly 1 argument.`, 125)
          if (state.docker.networks.some((n) => n.name === name)) return err(`Error response from daemon: network with name ${name} already exists`, 125)
          const idx = state.docker.networks.length
          state.docker.networks.push({ id: networkId(name), name, driver: 'bridge', scope: 'local', subnet: `172.2${idx}.0.0/16` })
          return ok(networkId(name) + '\n')
        }
        if (action === 'inspect') {
          const name = rest[1]
          if (!name) return err(`"docker network inspect" requires exactly 1 argument.`, 125)
          return inspectObject(state, name)
        }
        if (action === 'connect') {
          const netName = rest[1]
          const ctrName = rest[2]
          if (!netName || !ctrName) return err(`"docker network connect" requires exactly 2 arguments.`, 125)
          const net = state.docker.networks.find((n) => n.name === netName)
          if (!net) return err(`Error response from daemon: network ${netName} not found`, 125)
          const ctr = findContainer(state.docker, ctrName)
          if (!ctr) return err(`Error response from daemon: No such container: ${ctrName}`, 125)
          ctr.network = netName
          ctr.ip = containerIP(state.docker, ctr)
          return ok('')
        }
        if (action === 'disconnect') {
          const netName = rest[1]
          const ctrName = rest[2]
          if (!netName || !ctrName) return err(`"docker network disconnect" requires exactly 2 arguments.`, 125)
          const ctr = findContainer(state.docker, ctrName)
          if (!ctr) return err(`Error response from daemon: No such container: ${ctrName}`, 125)
          if (ctr.network === netName) {
            ctr.network = 'bridge'
            ctr.ip = containerIP(state.docker, ctr)
          }
          return ok('')
        }
        return err(`docker: 'network ${action ?? ''}' is not a docker command.\nSee 'docker --help'`, 125)
      }
      default: {
        return err(
          `docker: '${sub}' is not a docker command.\nSee 'docker --help'\n提示：支持的命令：version info images pull ps run start stop restart rm rmi tag history logs exec inspect build compose network volume`,
          125,
        )
      }
    }
  })
}

function cloneImage(img: DockerImage): DockerImage {
  return {
    ...img,
    fsRoot: cloneNode(img.fsRoot),
    env: { ...img.env },
    cmd: img.cmd ? [...img.cmd] : null,
    exposedPorts: [...img.exposedPorts],
    history: [...img.history],
  }
}

export function installDockerCommands(): void {
  registerDockerCommands()
}

export { execInContainer }
