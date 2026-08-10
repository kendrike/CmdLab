import type {
  K8sConfigMap,
  K8sCronJob,
  K8sDeployment,
  K8sJob,
  K8sNode,
  K8sPod,
  K8sProbe,
  K8sPV,
  K8sPVC,
  K8sRevision,
  K8sSecret,
  K8sService,
  K8sState,
  PodStatus,
  SimState,
} from '../types'

export const CRASH_LOG_LINES = [
  'Error: failed to start application',
  'Cannot open configuration file /app/config.json: No such file or directory',
  'Application exited with code 1',
]

export const NGINX_LOG_LINES = [
  '/docker-entrypoint.sh: Configuration complete; ready for start up',
  '2026/08/01 08:00:00 [notice] 1#1: start worker processes',
  '2026/08/01 08:00:00 [notice] 1#1: start worker process 12',
]

export interface K8sImageSpec {
  command: string
  memUsageMi: number
  readinessOk: boolean
  crash: boolean
  files: Record<string, string>
  logs: string[]
  env?: Record<string, string>
}

const APP_HTML = '<!DOCTYPE html>\n<html><head><title>my app</title></head>\n<body><h1>CmdLab 三层应用</h1></body></html>\n'

export const K8S_IMAGES: Record<string, K8sImageSpec> = {
  nginx: {
    command: 'nginx -g "daemon off;"',
    memUsageMi: 128,
    readinessOk: true,
    crash: false,
    files: { '/usr/share/nginx/html/index.html': 'Welcome to nginx!\n' },
    logs: NGINX_LOG_LINES,
  },
  web: {
    command: 'nginx -g "daemon off;"',
    memUsageMi: 128,
    readinessOk: true,
    crash: false,
    files: { '/usr/share/nginx/html/index.html': APP_HTML },
    logs: [...NGINX_LOG_LINES, '2026/08/01 08:02:11 [notice] 1#1: start worker process 14'],
  },
  api: {
    command: 'node server.js',
    memUsageMi: 256,
    readinessOk: true,
    crash: false,
    files: {
      '/app/config.json': '{\n  "service": "api",\n  "version": "1.0.0"\n}\n',
      '/app/server.js': 'console.log("api listening on :3000")\n',
    },
    logs: [
      'api v1.0.0 listening on :3000',
      'Connected to database',
      'GET /health 200',
    ],
    env: { DB_HOST: 'db' },
  },
  'api-broken': {
    command: 'node server.js',
    memUsageMi: 256,
    readinessOk: false,
    crash: false,
    files: {
      '/app/config.json': '{\n  "service": "api",\n  "version": "1.0.0"\n}\n',
      '/app/server.js': 'console.log("api listening on :3000")\n',
    },
    logs: [
      'api v1.0.0 listening on :3000',
      'Failed to connect to database: connect ECONNREFUSED db:5432',
      'GET /health 500',
    ],
    env: { DB_HOST: 'db' },
  },
  busybox: { command: 'sleep 3600', memUsageMi: 32, readinessOk: true, crash: false, files: {}, logs: ['BusyBox v1.36.1 (multi-call binary)'] },
  alpine: { command: 'sleep 3600', memUsageMi: 32, readinessOk: true, crash: false, files: {}, logs: ['Welcome to Alpine'] },
  redis: { command: 'redis-server', memUsageMi: 256, readinessOk: true, crash: false, files: {}, logs: ['Redis server started'] },
  postgres: { command: 'postgres', memUsageMi: 512, readinessOk: true, crash: false, files: {}, logs: ['PostgreSQL init process complete'] },
}

export function isCrashImage(image: string): boolean {
  const base = image.split(':')[0].toLowerCase()
  return /crash|broken|corrupt|faulty|explode|badapp/.test(base)
}

export function knownImage(image: string): K8sImageSpec | null {
  const base = image.split(':')[0].toLowerCase()
  return K8S_IMAGES[base] ?? null
}

export function podHash(deploymentName: string, image: string, gen: number): string {
  let h = 0
  const s = `${deploymentName}|${image}|${gen}`
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(36).padStart(8, '0').slice(0, 8)
}

export function fmtAge(now: number, tick: number): string {
  const m = now - tick
  if (m <= 0) return '5s'
  return `${m}m`
}

export function parseMemToMi(value: string | undefined): number {
  if (!value) return 0
  const m = /^(\d+(?:\.\d+)?)\s*([kKmMgG]?i?)$/.exec(value.trim())
  if (!m) return 0
  const n = Number(m[1])
  const unit = (m[2] || '').toLowerCase().replace('i', '')
  if (unit === 'g') return Math.round(n * 1024)
  if (unit === 'm') return Math.round(n)
  if (unit === 'k') return Math.max(1, Math.round(n / 1024))
  return Math.max(1, Math.round(n / (1024 * 1024)))
}

export function parseCpuToCores(value: string | undefined): number {
  if (!value) return 0
  const m = /^(\d+(?:\.\d+)?)\s*([m]?)$/.exec(value.trim())
  if (!m) return 0
  const n = Number(m[1])
  return m[2] === 'm' ? n / 1000 : n
}

export function parseMemToKb(value: string | undefined): number {
  if (!value) return 0
  const m = /^(\d+(?:\.\d+)?)\s*([kKmMgG]?i?)$/.exec(value.trim())
  if (!m) return 0
  const n = Number(m[1])
  const unit = (m[2] || '').toLowerCase().replace('i', '')
  if (unit === 'g') return n * 1024 * 1024
  if (unit === 'm') return n * 1024
  if (unit === 'k') return n
  return Math.max(1, n / 1024)
}

function nextPodIP(state: SimState): string {
  return `10.244.0.${state.k8s.pods.length + 2}`
}

export { nextPodIP, schedulePod }

export function buildK8sBase(): K8sState {
  const clock = 600
  const k8s: K8sState = {
    namespaces: ['default', 'kube-node-lease', 'kube-public', 'kube-system'],
    nodes: [
      { name: 'node-1', status: 'Ready', roles: ['control-plane', 'master'], version: 'v1.29.3', labels: { disktype: 'ssd', region: 'cn' }, memCapacityMi: 4096, memUsedMi: 512, cpuCapacity: 4, cpuUsed: 0.6, taints: [], created: clock - 300 },
      { name: 'node-2', status: 'Ready', roles: ['worker'], version: 'v1.29.3', labels: { disktype: 'hdd', region: 'us' }, memCapacityMi: 4096, memUsedMi: 256, cpuCapacity: 4, cpuUsed: 0.3, taints: [], created: clock - 300 },
    ],
    pods: [],
    deployments: [],
    services: [],
    configmaps: [],
    secrets: [],
    jobs: [],
    cronjobs: [],
    pvs: [],
    pvcs: [],
    events: [],
  }
  k8s.services.push({
    name: 'kubernetes',
    namespace: 'default',
    type: 'ClusterIP',
    clusterIP: '10.96.0.1',
    ports: [{ port: 443, targetPort: 443, nodePort: null }],
    selector: {},
    created: clock - 300,
  })
  const sysPod = (
    name: string,
    image: string,
    ns: string,
    node: string,
    created: number,
    labels: Record<string, string>,
  ): K8sPod => ({
    name,
    namespace: ns,
    status: 'Running' as const,
    ready: '1/1',
    restarts: 0,
    node,
    image,
    ip: `10.244.0.${k8s.pods.length + 2}`,
    labels,
    annotations: {},
    created,
    logs: ['Started ' + name, 'Wrote configuration to disk', 'Startup probes passed'],
    owner: null,
    env: {},
    fs: {},
    resources: { requests: { cpu: '100m', memory: '64Mi' } },
    probes: {},
    nodeSelector: {},
    tolerations: [],
    pvcRefs: [],
    exitCode: null,
    message: '',
  })
  k8s.pods.push(
    sysPod('coredns-5d4cbb7d7d-9c7xk', 'registry.k8s.io/coredns/coredns:v1.11.1', 'kube-system', 'node-1', clock - 280, { 'k8s-app': 'kube-dns' }),
    sysPod('coredns-5d4cbb7d7d-7tk2m', 'registry.k8s.io/coredns/coredns:v1.11.1', 'kube-system', 'node-2', clock - 280, { 'k8s-app': 'kube-dns' }),
    sysPod('kube-proxy-7f8z9', 'registry.k8s.io/kube-proxy:v1.29.3', 'kube-system', 'node-1', clock - 275, { 'k8s-app': 'kube-proxy' }),
    sysPod('etcd-master', 'registry.k8s.io/etcd:3.5.10-0', 'kube-system', 'node-1', clock - 300, { component: 'etcd' }),
    sysPod('kube-apiserver-master', 'registry.k8s.io/kube-apiserver:v1.29.3', 'kube-system', 'node-1', clock - 300, { component: 'kube-apiserver' }),
    sysPod('kube-controller-manager-master', 'registry.k8s.io/kube-controller-manager:v1.29.3', 'kube-system', 'node-1', clock - 299, { component: 'kube-controller-manager' }),
    sysPod('kube-scheduler-master', 'registry.k8s.io/kube-scheduler:v1.29.3', 'kube-system', 'node-1', clock - 299, { component: 'kube-scheduler' }),
  )
  k8s.pods[0].node = 'node-1'
  k8s.pods[1].node = 'node-2'
  return k8s
}

export function pushEvent(state: SimState, type: 'Normal' | 'Warning', reason: string, object: string, message: string): void {
  const existing = state.k8s.events.find((e) => e.type === type && e.reason === reason && e.object === object)
  if (existing) {
    existing.count += 1
    existing.tick = state.clock
  } else {
    state.k8s.events.push({ tick: state.clock, type, reason, object, message, count: 1 })
  }
  if (state.k8s.events.length > 50) state.k8s.events = state.k8s.events.slice(-50)
}

export function deploymentPods(state: SimState, name: string, ns: string): K8sPod[] {
  return state.k8s.pods.filter((p) => p.owner === name && p.namespace === ns && p.ownerKind === 'deployment')
}

export function jobPods(state: SimState, name: string, ns: string): K8sPod[] {
  return state.k8s.pods.filter((p) => p.owner === name && p.namespace === ns && p.ownerKind === 'job')
}

export function nodeMemAvailableMi(state: SimState, node: K8sNode): number {
  const usedByPods = state.k8s.pods
    .filter((p) => p.node === node.name && p.status !== 'Succeeded' && p.status !== 'Completed')
    .reduce((sum, p) => sum + nodeMemRequest(p), 0)
  return node.memCapacityMi - node.memUsedMi - usedByPods
}

export function nodeCpuAvailable(state: SimState, node: K8sNode): number {
  const usedByPods = state.k8s.pods
    .filter((p) => p.node === node.name && p.status !== 'Succeeded' && p.status !== 'Completed')
    .reduce((sum, p) => sum + nodeCpuRequest(p), 0)
  return node.cpuCapacity - node.cpuUsed - usedByPods
}

export function nodeMemRequest(pod: K8sPod): number {
  return parseMemToMi(pod.resources?.requests?.memory)
}

export function nodeCpuRequest(pod: K8sPod): number {
  return parseCpuToCores(pod.resources?.requests?.cpu)
}

export function podMemRequestMi(pod: K8sPod): number {
  return nodeMemRequest(pod)
}

export function podCpuRequest(pod: K8sPod): number {
  return nodeCpuRequest(pod)
}

export function pickNode(state: SimState, pod: K8sPod): { node: string; error?: string } {
  const candidates = state.k8s.nodes.filter((n) => {
    if (n.status !== 'Ready') return false
    for (const [k, v] of Object.entries(pod.nodeSelector ?? {})) {
      if (n.labels[k] !== v) return false
    }
    for (const t of n.taints) {
      const tolerated = (pod.tolerations ?? []).some(
        (x) => x.key === t.key && (x.effect === undefined || x.effect === t.effect) && (x.value === '' || x.value === t.value),
      )
      if (!tolerated) return false
    }
    return true
  })
  if (candidates.length === 0) {
    return { node: 'node-1', error: '0/2 nodes are available: 2 node(s) didn\'t match Pod\'s node affinity/selector' }
  }
  for (const n of candidates) {
    if (nodeMemAvailableMi(state, n) >= nodeMemRequest(pod) && nodeCpuAvailable(state, n) >= nodeCpuRequest(pod)) {
      return { node: n.name }
    }
  }
  return { node: candidates[0].name, error: 'Insufficient memory' }
}

export function podStartup(pod: K8sPod): { status: PodStatus; ready: string; message: string; restarts: number } {
  const image = knownImage(pod.image)
  const crash = image ? image.crash : isCrashImage(pod.image)
  const unknownImage = image === null && !crash && !pod.image.startsWith('registry.k8s.io/')
  if (unknownImage) {
    return { status: 'ImagePullBackOff', ready: '0/1', message: 'Back-off pulling image', restarts: 1 }
  }
  if (pod.probes?.startup && crash) {
    return { status: 'CrashLoopBackOff', ready: '0/1', message: 'Startup probe failed: command not found', restarts: 2 }
  }
  if (crash) {
    return { status: 'CrashLoopBackOff', ready: '0/1', message: 'Back-off restarting failed container', restarts: 3 }
  }
  const memLimit = parseMemToMi(pod.resources?.limits?.memory)
  const memUsage = image ? image.memUsageMi : 128
  if (memLimit > 0 && memLimit < memUsage) {
    return { status: 'OOMKilled', ready: '0/1', message: `OOMKilled: memory limit ${pod.resources.limits?.memory} < required ${memUsage}Mi`, restarts: 1 }
  }
  const readinessOk = image ? image.readinessOk : true
  if (pod.probes?.readiness && !readinessOk) {
    return { status: 'Running', ready: '0/1', message: 'Readiness probe failed: HTTP probe failed with statuscode: 500', restarts: 0 }
  }
  return { status: 'Running', ready: '1/1', message: '', restarts: 0 }
}

function basePod(dep: K8sDeployment, name: string, ns: string, state: SimState, spec: K8sImageSpec | null): K8sPod {
  const fs: Record<string, string> = {}
  if (spec) for (const [k, v] of Object.entries(spec.files)) fs[k] = v
  const env: Record<string, string> = {}
  if (spec?.env) Object.assign(env, spec.env)
  const pvcRefs: string[] = []
  for (const m of dep.volumeMounts) {
    const vol = dep.volumes.find((v) => v.name === m.name)
    if (vol?.pvc) pvcRefs.push(vol.pvc)
  }
  for (const e of dep.env) {
    if (e.configMapKeyRef) {
      const cm = state.k8s.configmaps.find((c) => c.name === e.configMapKeyRef!.name && c.namespace === ns)
      if (cm && e.configMapKeyRef.key in cm.data) env[e.name] = cm.data[e.configMapKeyRef.key]
    } else if (e.secretKeyRef) {
      const sec = state.k8s.secrets.find((c) => c.name === e.secretKeyRef!.name && c.namespace === ns)
      if (sec && e.secretKeyRef.key in sec.data) env[e.name] = decodeB64(sec.data[e.secretKeyRef.key])
    } else if (e.value !== undefined) {
      env[e.name] = e.value
    }
  }
  for (const from of dep.envFrom) {
    if (from.configMapRef) {
      const cm = state.k8s.configmaps.find((c) => c.name === from.configMapRef && c.namespace === ns)
      if (cm) Object.assign(env, cm.data)
    }
    if (from.secretRef) {
      const sec = state.k8s.secrets.find((c) => c.name === from.secretRef && c.namespace === ns)
      if (sec) for (const [k, v] of Object.entries(sec.data)) env[k] = decodeB64(v)
    }
  }
  for (const m of dep.volumeMounts) {
    const vol = dep.volumes.find((v) => v.name === m.name)
    if (!vol) continue
    if (vol.configMap) {
      const cm = state.k8s.configmaps.find((c) => c.name === vol.configMap && c.namespace === ns)
      if (cm) for (const [k, v] of Object.entries(cm.data)) fs[m.mountPath + '/' + k] = v
    }
    if (vol.secret) {
      const sec = state.k8s.secrets.find((c) => c.name === vol.secret && c.namespace === ns)
      if (sec) for (const [k, v] of Object.entries(sec.data)) fs[m.mountPath + '/' + k] = decodeB64(v)
    }
    if (vol.pvc) {
      const pvc = state.k8s.pvcs.find((c) => c.name === vol.pvc && c.namespace === ns)
      if (pvc && pvc.status === 'Bound') fs[m.mountPath] = ''
    }
  }
  return {
    name,
    namespace: ns,
    status: 'Pending',
    ready: '0/1',
    restarts: 0,
    node: 'node-1',
    image: dep.image,
    ip: '',
    labels: { ...dep.selector, 'pod-template-hash': dep.podHash },
    annotations: {},
    created: state.clock,
    logs: [],
    owner: dep.name,
    ownerKind: 'deployment',
    env,
    fs,
    resources: dep.resources,
    probes: dep.probes,
    nodeSelector: dep.nodeSelector,
    tolerations: dep.tolerations,
    pvcRefs,
    exitCode: null,
    message: '',
  }
}

function schedulePod(state: SimState, pod: K8sPod): void {
  const spec = knownImage(pod.image)
  const placed = pickNode(state, pod)
  pod.node = placed.node
  if (placed.error) {
    pod.status = 'Pending'
    pod.ready = '0/1'
    pod.message = placed.error
    pushEvent(state, 'Warning', 'FailedScheduling', `pod/${pod.name}`, '0/2 nodes are available: 2 node(s) didn\'t match Pod\'s node affinity/selector')
    return
  }
  const unboundPvc = pod.pvcRefs.find((ref) => {
    const pvc = state.k8s.pvcs.find((c) => c.name === ref && c.namespace === pod.namespace)
    return !pvc || pvc.status !== 'Bound'
  })
  if (unboundPvc) {
    pod.status = 'Pending'
    pod.ready = '0/1'
    pod.message = `PersistentVolumeClaim "${unboundPvc}" is not bound`
    pushEvent(state, 'Warning', 'FailedScheduling', `pod/${pod.name}`, `PersistentVolumeClaim is not bound: "${unboundPvc}"`)
    return
  }
  pushEvent(state, 'Normal', 'Scheduled', `pod/${pod.name}`, `Successfully assigned default/${pod.name} to ${pod.node}`)
  pushEvent(state, 'Normal', 'Pulled', `pod/${pod.name}`, `Container image "${pod.image}" already present on machine`)
  const start = podStartup(pod)
  pod.status = start.status
  pod.ready = start.ready
  pod.message = start.message
  pod.restarts = start.restarts
  pod.ip = nextPodIP(state)
  if (spec) pod.logs = [...spec.logs]
  else pod.logs = [`Container image "${pod.image}" not found`, 'Back-off pulling image', 'Error: ImagePullBackOff']
  if (start.status === 'ImagePullBackOff') {
    pushEvent(state, 'Warning', 'Failed', `pod/${pod.name}`, `Failed to pull image "${pod.image}": rpc error: code = NotFound`)
    pushEvent(state, 'Warning', 'BackOff', `pod/${pod.name}`, 'Back-off pulling image')
  } else if (start.status === 'CrashLoopBackOff') {
    pushEvent(state, 'Warning', 'BackOff', `pod/${pod.name}`, 'Back-off restarting failed container: CrashLoopBackOff')
    pushEvent(state, 'Normal', 'Started', `pod/${pod.name}`, 'Started container')
  } else if (start.status === 'OOMKilled') {
    pushEvent(state, 'Warning', 'OOMKilled', `pod/${pod.name}`, 'Container killed due to memory usage exceeding its limit')
    pushEvent(state, 'Warning', 'BackOff', `pod/${pod.name}`, 'Back-off restarting failed container')
  } else {
    pushEvent(state, 'Normal', 'Started', `pod/${pod.name}`, 'Started container')
  }
}

export function reconcileDeployment(state: SimState, dep: K8sDeployment): void {
  const owned = deploymentPods(state, dep.name, dep.namespace)
  const podBase = `${dep.name}-${dep.podHash}`
  const existingSeqs = owned.map((p) => {
    const suffix = p.name.slice(podBase.length + 1)
    return Number(suffix) || 0
  })
  let nextSeq = existingSeqs.length ? Math.max(...existingSeqs) + 1 : 1
  const spec = knownImage(dep.image)
  while (owned.length < dep.replicas) {
    const name = `${podBase}-${nextSeq}`
    const newPod = basePod(dep, name, dep.namespace, state, spec)
    state.k8s.pods.push(newPod)
    owned.push(newPod)
    nextSeq++
    schedulePod(state, newPod)
  }
  while (owned.length > dep.replicas) {
    const doomed = owned[owned.length - 1]
    state.k8s.pods = state.k8s.pods.filter((p) => p !== doomed)
    owned.splice(owned.length - 1, 1)
    pushEvent(state, 'Normal', 'Killing', `pod/${doomed.name}`, 'Stopping container')
  }
  dep.available = owned.filter((p) => p.status === 'Running' && p.ready === '1/1').length
  const currentRev = dep.revisions[dep.revisions.length - 1]
  if (currentRev) {
    currentRev.image = dep.image
    currentRev.containerName = dep.containerName
  }
}

export function addDeploymentWithSpec(
  state: SimState,
  dep: K8sDeployment,
): string | null {
  const existing = state.k8s.deployments.find((d) => d.name === dep.name && d.namespace === dep.namespace)
  if (existing) {
    return `Error from server (AlreadyExists): deployments.apps "${dep.name}" already exists`
  }
  state.k8s.deployments.push(dep)
  pushEvent(state, 'Normal', 'SuccessfulCreate', `replicaset/${dep.name}-${dep.podHash}`, `Created pod: ${dep.name}-${dep.podHash}-1`)
  reconcileDeployment(state, dep)
  return null
}

export function addDeployment(
  state: SimState,
  name: string,
  ns: string,
  image: string,
  replicas: number,
  containerName: string,
): string | null {
  const dep: K8sDeployment = {
    name,
    namespace: ns,
    replicas,
    available: 0,
    image,
    containerName,
    podHash: podHash(name, image, 0),
    created: state.clock,
    labels: { app: name },
    selector: { app: name },
    revision: 1,
    revisions: [],
    resources: {},
    probes: {},
    envFrom: [],
    env: [],
    volumes: [],
    volumeMounts: [],
    nodeSelector: {},
    tolerations: [],
    ports: [],
  }
  dep.revisions.push({ revision: 1, image, containerName, rsName: `${name}-${dep.podHash}`, created: state.clock })
  return addDeploymentWithSpec(state, dep)
}

export function ensureNamespace(state: SimState, ns: string): boolean {
  return state.k8s.namespaces.includes(ns)
}

export function normalizeK8sState(state: SimState): void {
  const k8s = state.k8s
  if (!k8s.nodes || k8s.nodes.length === 0) k8s.nodes = buildK8sBase().nodes
  k8s.secrets = k8s.secrets ?? []
  k8s.jobs = k8s.jobs ?? []
  k8s.cronjobs = k8s.cronjobs ?? []
  k8s.pvs = k8s.pvs ?? []
  k8s.pvcs = k8s.pvcs ?? []
  for (const p of k8s.pods) {
    p.annotations = p.annotations ?? {}
    p.env = p.env ?? {}
    p.fs = p.fs ?? {}
    p.resources = p.resources ?? {}
    p.probes = p.probes ?? {}
    p.nodeSelector = p.nodeSelector ?? {}
    p.tolerations = p.tolerations ?? []
    p.pvcRefs = p.pvcRefs ?? []
    p.exitCode = p.exitCode ?? null
    p.message = p.message ?? ''
    if (p.owner && p.ownerKind === undefined) p.ownerKind = 'deployment'
  }
  for (const d of k8s.deployments) {
    d.revision = d.revision ?? 1
    d.revisions =
      d.revisions ?? [{ revision: 1, image: d.image, containerName: d.containerName, rsName: `${d.name}-${d.podHash}`, created: d.created }]
    d.resources = d.resources ?? {}
    d.probes = d.probes ?? {}
    d.envFrom = d.envFrom ?? []
    d.env = d.env ?? []
    d.volumes = d.volumes ?? []
    d.volumeMounts = d.volumeMounts ?? []
    d.nodeSelector = d.nodeSelector ?? {}
    d.tolerations = d.tolerations ?? []
    d.ports = d.ports ?? []
  }
  for (const e of k8s.events) e.count = e.count ?? 1
}

export function nextClusterIP(state: SimState): string {
  return `10.96.0.${state.k8s.services.length + 1}`
}

export function nextNodePort(state: SimState): number {
  return 30000 + ((state.k8s.services.length * 37) % 2000) + (state.k8s.services.length * 7) % 97 + 17
}

export function svcEndpoints(state: SimState, svc: { selector: Record<string, string>; namespace: string }): string[] {
  return state.k8s.pods
    .filter((p) => p.namespace === svc.namespace && p.status === 'Running' && p.ready === '1/1')
    .filter((p) => Object.entries(svc.selector).every(([k, v]) => p.labels[k] === v))
    .map((p) => p.ip)
}

export function encodeB64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

export function decodeB64(s: string): string {
  try {
    return decodeURIComponent(escape(atob(s)))
  } catch {
    return s
  }
}

export function podYaml(pod: K8sPod): string {
  const lines = [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    `  name: ${pod.name}`,
    `  namespace: ${pod.namespace}`,
    `  labels:`,
    ...Object.entries(pod.labels).map(([k, v]) => `    ${k}: ${v}`),
    `  annotations:`,
    ...Object.entries(pod.annotations).map(([k, v]) => `    ${k}: ${v}`),
    `  creationTimestamp: ${new Date((1783000000 + pod.created) * 60 * 1000).toISOString()}`,
    'spec:',
    `  nodeName: ${pod.node}`,
    `  containers:`,
    `  - name: ${pod.name.split('-')[0]}`,
    `    image: ${pod.image}`,
    `    imagePullPolicy: IfNotPresent`,
    `    ports:`,
    `    - containerPort: ${pod.probes?.readiness?.httpGet?.port ?? 80}`,
    `      protocol: TCP`,
    '    env:',
    ...Object.entries(pod.env).map(([k, v]) => `    - name: ${k}\n      value: ${v}`),
    '  status:',
    `  phase: ${pod.status}`,
  ]
  return lines.join('\n')
}

export function describePodText(state: SimState, pod: K8sPod): string {
  const memReq = podMemRequestMi(pod)
  const lines: string[] = [
    `Name:             ${pod.name}`,
    `Namespace:        ${pod.namespace}`,
    `Priority:         0`,
    `Node:             ${pod.node}/192.168.10.${pod.node === 'node-1' ? 10 : 11}`,
    `Start Time:       ${new Date((1783000000 + pod.created) * 60 * 1000).toISOString()}`,
    `Labels:           ${Object.entries(pod.labels).map(([k, v]) => `${k}=${v}`).join(',')}`,
    `Annotations:      ${Object.keys(pod.annotations).map((k) => `${k}: ${pod.annotations[k]}`).join(',') || '<none>'}`,
    `Status:           ${pod.status}${pod.message ? ` (${pod.message})` : ''}`,
    `IP:               ${pod.ip || '<none>'}`,
    ...(pod.nodeSelector && Object.keys(pod.nodeSelector).length
      ? [`Node-Selectors:   ${Object.entries(pod.nodeSelector).map(([k, v]) => `${k}=${v}`).join(',')}`]
      : []),
    ...(pod.tolerations && pod.tolerations.length
      ? [`Tolerations:      ${pod.tolerations.map((t) => `node.kubernetes.io/not-ready:NoExecute`).join(' ')}`]
      : []),
    '',
    'Containers:',
    `  ${pod.name.split('-')[0]}:`,
    `    Container ID:  containerd://${pod.ip ? pod.ip.replace(/\./g, '') : '0000000000'}1a2b3c4d`,
    `    Image:         ${pod.image}`,
    `    State:         ${pod.status === 'CrashLoopBackOff' || pod.status === 'ImagePullBackOff' ? 'Waiting' : 'Running'}`,
    `      Reason:      ${pod.status === 'CrashLoopBackOff' || pod.status === 'ImagePullBackOff' ? pod.status : ''}`,
    `      Exit Code:   ${pod.exitCode ?? (pod.status === 'OOMKilled' ? '137' : pod.status === 'CrashLoopBackOff' ? '1' : '0')}`,
    `    Ready:         ${pod.ready}`,
    `    Restart Count: ${pod.restarts}`,
    `    Requests:      cpu=${pod.resources.requests?.cpu ?? '<none>'}, memory=${pod.resources.requests?.memory ?? '<none>'}`,
    `    Limits:        cpu=${pod.resources.limits?.cpu ?? '<none>'}, memory=${pod.resources.limits?.memory ?? '<none>'}`,
    `    Environment:   ${Object.entries(pod.env).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}`,
    ...(pod.resources.requests?.memory
      ? [`    Mounts:`]
      : []),
    '',
    'Conditions:',
    `  Type              Status`,
    `  Initialized       True`,
    `  Ready             ${pod.ready === '1/1' ? 'True' : 'False'}`,
    `  ContainersReady   ${pod.ready === '1/1' ? 'True' : 'False'}`,
    `  PodScheduled      ${pod.status === 'Pending' ? 'False' : 'True'}`,
    '',
    'Events:',
  ]
  void memReq
  const events = state.k8s.events.filter((e) => e.object.includes(pod.name)).slice(-5)
  lines.push('  Type     Reason    Age   From             Message')
  for (const e of events) {
    lines.push(
      `  ${e.type.padEnd(8)}${e.reason.padEnd(10)}${fmtAge(state.clock, e.tick).padEnd(6)}kubelet           ${e.message}`,
    )
  }
  if (events.length === 0) lines.push('  <none>')
  return lines.join('\n')
}

export function bumpDeploymentRevision(
  state: SimState,
  dep: K8sDeployment,
  opts: { image?: string; containerName?: string; restart?: boolean },
): void {
  const oldPods = deploymentPods(state, dep.name, dep.namespace)
  state.k8s.pods = state.k8s.pods.filter((p) => !oldPods.includes(p))
  const prev = dep.revisions[dep.revisions.length - 1]
  if (opts.image !== undefined && prev) {
    dep.image = opts.image
    if (opts.containerName !== undefined) dep.containerName = opts.containerName
  } else if (opts.restart && prev) {
    dep.podHash = podHash(dep.name, dep.image, dep.revision + 1)
  }
  if (!opts.restart && !opts.image) return
  if (opts.restart) {
    dep.revision += 1
    dep.revisions.push({
      revision: dep.revision,
      image: dep.image,
      containerName: dep.containerName,
      rsName: `${dep.name}-${dep.podHash}`,
      created: state.clock,
    })
    pushEvent(state, 'Normal', 'SuccessfulUpdate', `deployment/${dep.name}`, `Restarted deployment`)
  } else {
    dep.revision += 1
    dep.podHash = podHash(dep.name, dep.image, dep.revision)
    dep.revisions.push({
      revision: dep.revision,
      image: dep.image,
      containerName: dep.containerName,
      rsName: `${dep.name}-${dep.podHash}`,
      created: state.clock,
    })
    pushEvent(state, 'Normal', 'SuccessfulUpdate', `deployment/${dep.name}`, `Updated image to ${dep.image}`)
  }
  reconcileDeployment(state, dep)
}

export function deploymentYaml(state: SimState, dep: K8sDeployment): string {
  const lines = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${dep.name}`,
    `  namespace: ${dep.namespace}`,
    `  labels:`,
    ...Object.entries(dep.labels).map(([k, v]) => `    ${k}: ${v}`),
    `  creationTimestamp: ${new Date((1783000000 + dep.created) * 60 * 1000).toISOString()}`,
    `  generation: ${dep.revision}`,
    'spec:',
    `  replicas: ${dep.replicas}`,
    '  selector:',
    `    matchLabels:`,
    ...Object.entries(dep.selector).map(([k, v]) => `      ${k}: ${v}`),
    '  strategy:',
    '    type: RollingUpdate',
    '    rollingUpdate:',
    '      maxUnavailable: 25%',
    '      maxSurge: 25%',
    '  template:',
    '    metadata:',
    `      labels:`,
    ...Object.entries(dep.selector).map(([k, v]) => `        ${k}: ${v}`),
    '    spec:',
    '      containers:',
    `      - name: ${dep.containerName}`,
    `        image: ${dep.image}`,
    ...(dep.ports.length ? [`        ports:`, ...dep.ports.map((p) => `        - containerPort: ${p}`)] : []),
  ]
  return lines.join('\n') + '\n'
}

export function serviceYaml(svc: K8sService): string {
  const lines = [
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    `  name: ${svc.name}`,
    `  namespace: ${svc.namespace}`,
    `  creationTimestamp: ${new Date((1783000000 + svc.created) * 60 * 1000).toISOString()}`,
    'spec:',
    `  type: ${svc.type}`,
    `  clusterIP: ${svc.clusterIP}`,
    '  ports:',
    ...svc.ports.map((p) => `  - port: ${p.port}\n    protocol: TCP\n    targetPort: ${p.targetPort}${p.nodePort ? `\n    nodePort: ${p.nodePort}` : ''}`),
    ...(Object.keys(svc.selector).length ? ['  selector:', ...Object.entries(svc.selector).map(([k, v]) => `    ${k}: ${v}`)] : []),
  ]
  return lines.join('\n') + '\n'
}

export function configMapYaml(cm: K8sConfigMap): string {
  const lines = [
    'apiVersion: v1',
    'kind: ConfigMap',
    'metadata:',
    `  name: ${cm.name}`,
    `  namespace: ${cm.namespace}`,
    `  creationTimestamp: ${new Date((1783000000 + cm.created) * 60 * 1000).toISOString()}`,
    'data:',
    ...Object.entries(cm.data).map(([k, v]) => `  ${k}: |\n${indentBlock(v)}`),
  ]
  return lines.join('\n') + '\n'
}

export function secretYaml(sec: K8sSecret): string {
  const lines = [
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `  name: ${sec.name}`,
    `  namespace: ${sec.namespace}`,
    `  creationTimestamp: ${new Date((1783000000 + sec.created) * 60 * 1000).toISOString()}`,
    `type: ${sec.type}`,
    'data:',
    ...Object.entries(sec.data).map(([k, v]) => `  ${k}: ${v}`),
  ]
  return lines.join('\n') + '\n'
}

export function nodeYaml(node: K8sNode): string {
  const lines = [
    'apiVersion: v1',
    'kind: Node',
    'metadata:',
    `  name: ${node.name}`,
    `  labels:`,
    ...Object.entries(node.labels).map(([k, v]) => `    ${k}: ${v}`),
    '  creationTimestamp: null',
    'spec:',
    '  taints:',
    ...(node.taints.length ? node.taints.map((t) => `  - key: ${t.key}\n    value: "${t.value}"\n    effect: ${t.effect ?? 'NoSchedule'}`) : ['  - effect: NoExecute\n    key: node.kubernetes.io/not-ready']),
    'status:',
    '  conditions:',
    '  - type: Ready',
    `    status: ${node.status === 'Ready' ? 'True' : 'False'}`,
  ]
  return lines.join('\n') + '\n'
}

export function pvYaml(pv: K8sPV): string {
  const lines = [
    'apiVersion: v1',
    'kind: PersistentVolume',
    'metadata:',
    `  name: ${pv.name}`,
    '  labels:',
    '    type: local',
    'spec:',
    `  capacity:`,
    `    storage: ${pv.capacity}`,
    `  accessModes:`,
    `    - ${pv.accessModes}`,
    `  persistentVolumeReclaimPolicy: ${pv.reclaimPolicy}`,
    ...(pv.storageClass ? [`  storageClassName: ${pv.storageClass}`] : []),
    `  status:`,
    `    phase: ${pv.status}`,
  ]
  return lines.join('\n') + '\n'
}

export function pvcYaml(pvc: K8sPVC): string {
  const lines = [
    'apiVersion: v1',
    'kind: PersistentVolumeClaim',
    'metadata:',
    `  name: ${pvc.name}`,
    `  namespace: ${pvc.namespace}`,
    'spec:',
    `  accessModes:`,
    `    - ${pvc.accessModes}`,
    '  resources:',
    '    requests:',
    `      storage: ${pvc.requested}`,
    '  status:',
    `    phase: ${pvc.status}`,
    ...(pvc.volumeName ? [`  volumeName: ${pvc.volumeName}`] : []),
  ]
  return lines.join('\n') + '\n'
}

export function jobYaml(job: K8sJob): string {
  const lines = [
    'apiVersion: batch/v1',
    'kind: Job',
    'metadata:',
    `  name: ${job.name}`,
    `  namespace: ${job.namespace}`,
    'spec:',
    `  completions: ${job.completions}`,
    '  template:',
    '    spec:',
    '      containers:',
    `      - name: ${job.name.split('-')[0]}`,
    `        image: ${job.image}`,
    '        command: ["sh", "-c", "echo hello && sleep 1"]',
    '      restartPolicy: Never',
    '  status:',
    `    completionTime: ${new Date((1783000000 + job.created + 1) * 60 * 1000).toISOString()}`,
  ]
  return lines.join('\n') + '\n'
}

export function cronJobYaml(cj: K8sCronJob): string {
  const lines = [
    'apiVersion: batch/v1',
    'kind: CronJob',
    'metadata:',
    `  name: ${cj.name}`,
    `  namespace: ${cj.namespace}`,
    'spec:',
    `  schedule: "${cj.schedule}"`,
    `  suspend: ${cj.suspend}`,
    '  jobTemplate:',
    '    spec:',
    '      template:',
    '        spec:',
    '          containers:',
    `          - name: ${cj.name}`,
    `            image: ${cj.image}`,
    '            command: ["sh", "-c", "echo job ran"]',
    '          restartPolicy: Never',
  ]
  return lines.join('\n') + '\n'
}

function indentBlock(s: string): string {
  return s
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')
}
