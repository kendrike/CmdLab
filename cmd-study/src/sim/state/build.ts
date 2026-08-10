import type { ProcEntry, SimState } from '../types'
import { UID_STUDENT } from '../vfs/access'
import { buildBaseFs } from '../vfs/build'
import { IMAGE_CATALOG, buildDockerState, buildImageFs, cloneNode, normalizeDockerState } from '../docker/state'
import { addDeployment, buildK8sBase, normalizeK8sState } from '../kubernetes/state'

const BASE_PROCESSES: ProcEntry[] = [
  { pid: 1, cmd: 'systemd', tty: '?', time: '00:00:03' },
  { pid: 789, cmd: 'sshd', tty: '?', time: '00:00:01' },
  { pid: 1234, cmd: 'bash', tty: 'pts/0', time: '00:00:00' },
  { pid: 2345, cmd: 'sleep 3600', tty: 'pts/0', time: '00:00:00' },
]

export function createInitialState(): SimState {
  const state: SimState = {
    version: 1,
    cwd: '/home/student',
    uid: UID_STUDENT,
    gids: [UID_STUDENT, 27],
    env: {
      HOME: '/home/student',
      USER: 'student',
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: '/home/student',
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
    },
    fsRoot: buildBaseFs(),
    procs: BASE_PROCESSES.map((p) => ({ ...p })),
    services: [],
    docker: buildDockerState(),
    k8s: buildK8sBase(),
    history: [],
    exitCodes: [],
    clock: 600,
  }
  return state
}

export function cloneState(state: SimState): SimState {
  return JSON.parse(JSON.stringify(state)) as SimState
}

export function addRunningContainer(
  state: SimState,
  name: string,
  image: string,
  hostPort: number,
  containerPort: number,
): void {
  const repo = image.split(':')[0]
  const spec = IMAGE_CATALOG[repo]
  const ctr = {
    id: (0x9f1e2d3c + state.docker.seq * 0x17b).toString(16).padStart(12, '0'),
    name,
    image,
    imageId: 'f7a6a03d20e1',
    command: 'nginx -g "daemon off;"',
    created: state.clock - 15,
    status: 'running' as const,
    exitCode: null,
    ports: [{ host: hostPort, container: containerPort, proto: 'tcp' }],
    mounts: [],
    network: 'bridge',
    rmOnExit: false,
    restartPolicy: 'no',
    logLines: [
      '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
      '/docker-entrypoint.sh: Configuration complete; ready for start up',
      '2026/08/01 08:00:00 [notice] 1#1: start worker process 12',
      '2026/08/01 08:02:11 [notice] 1#1: start worker process 13',
      '2026/08/01 08:02:11 [notice] 1#1: start worker process 14',
    ],
    startTick: state.clock - 15,
    stopTick: null,
    fsRoot: spec ? cloneNode(buildImageFs(spec)) : buildImageFs({ id: '', size: '', command: '', bootLogs: [], files: [] }),
    env: { ...(spec?.env ?? {}) },
    workdir: spec?.workdir ?? null,
    exposedPorts: spec?.exposedPorts ?? [containerPort],
    health: 'none' as const,
    healthcheck: null,
    limits: {},
    ip: '172.17.0.2',
  }
  state.docker.containers.push(ctr)
  state.docker.seq += 1
}

export function addDeploymentPreset(
  state: SimState,
  name: string,
  image: string,
  replicas: number,
): void {
  addDeployment(state, name, 'default', image, replicas, name)
  const dep = state.k8s.deployments.find((d) => d.name === name)!
  dep.created = state.clock - 12
  for (const p of state.k8s.pods.filter((p) => p.owner === name)) {
    p.created = state.clock - 12
  }
}

export function restoreState(saved: SimState): SimState {
  const state = cloneState(saved)
  state.exitCodes = state.exitCodes ?? []
  normalizeDockerState(state)
  normalizeK8sState(state)
  state.env['PWD'] = state.cwd
  return state
}
