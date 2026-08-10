export type NodeKind = 'file' | 'dir'

export interface FsNode {
  kind: NodeKind
  name: string
  content: string
  mode: number
  uid: number
  gid: number
  mtime: number
  children?: Record<string, FsNode>
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  stateChanges?: unknown
}

export interface DockerPort {
  host: number
  container: number
  proto: string
}

export type DockerStatus = 'created' | 'running' | 'exited'

export type DockerHealth = 'none' | 'starting' | 'healthy' | 'unhealthy'

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  created: number
  fsRoot: FsNode
  env: Record<string, string>
  cmd: string[] | null
  workdir: string | null
  exposedPorts: number[]
  history: string[]
  healthcheck: string | null
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  imageId: string
  command: string
  created: number
  status: DockerStatus
  exitCode: number | null
  ports: DockerPort[]
  mounts: string[]
  network: string
  rmOnExit: boolean
  restartPolicy: string
  logLines: string[]
  startTick: number | null
  stopTick: number | null
  fsRoot: FsNode
  env: Record<string, string>
  workdir: string | null
  exposedPorts: number[]
  health: DockerHealth
  healthcheck: string | null
  limits: { memory?: string; cpus?: string }
  ip: string | null
}

export interface DockerNetwork {
  id: string
  name: string
  driver: string
  scope: string
  subnet: string | null
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  tree: FsNode | null
}

export interface DockerState {
  images: DockerImage[]
  containers: DockerContainer[]
  networks: DockerNetwork[]
  volumes: DockerVolume[]
  seq: number
}

export type PodStatus =
  | 'Running'
  | 'Pending'
  | 'ContainerCreating'
  | 'CrashLoopBackOff'
  | 'ImagePullBackOff'
  | 'OOMKilled'
  | 'Succeeded'
  | 'Completed'
  | 'Failed'
  | 'Terminating'

export interface K8sResourceLimits {
  requests?: { cpu?: string; memory?: string }
  limits?: { cpu?: string; memory?: string }
}

export interface K8sProbe {
  httpGet?: { path: string; port: number }
  exec?: { command: string }
  periodSeconds?: number
  initialDelaySeconds?: number
}

export interface K8sPod {
  name: string
  namespace: string
  status: PodStatus
  ready: string
  restarts: number
  node: string
  image: string
  ip: string
  labels: Record<string, string>
  annotations: Record<string, string>
  created: number
  logs: string[]
  owner: string | null
  ownerKind?: 'deployment' | 'job' | null
  env: Record<string, string>
  fs: Record<string, string>
  resources: K8sResourceLimits
  probes: { readiness?: K8sProbe; liveness?: K8sProbe; startup?: K8sProbe }
  nodeSelector: Record<string, string>
  tolerations: { key: string; value: string; effect?: string }[]
  pvcRefs: string[]
  exitCode: number | null
  message: string
}

export interface K8sRevision {
  revision: number
  image: string
  containerName: string
  rsName: string
  created: number
}

export interface K8sDeployment {
  name: string
  namespace: string
  replicas: number
  available: number
  image: string
  containerName: string
  podHash: string
  created: number
  labels: Record<string, string>
  selector: Record<string, string>
  revision: number
  revisions: K8sRevision[]
  resources: K8sResourceLimits
  probes: { readiness?: K8sProbe; liveness?: K8sProbe; startup?: K8sProbe }
  envFrom: { configMapRef?: string; secretRef?: string }[]
  env: { name: string; configMapKeyRef?: { name: string; key: string }; secretKeyRef?: { name: string; key: string }; value?: string }[]
  volumes: { name: string; configMap?: string; secret?: string; pvc?: string }[]
  volumeMounts: { name: string; mountPath: string; subPath?: string }[]
  nodeSelector: Record<string, string>
  tolerations: { key: string; value: string; effect?: string }[]
  ports: number[]
}

export interface K8sService {
  name: string
  namespace: string
  type: string
  clusterIP: string
  ports: { port: number; targetPort: number; nodePort: number | null }[]
  selector: Record<string, string>
  created: number
}

export interface K8sConfigMap {
  name: string
  namespace: string
  data: Record<string, string>
  created: number
}

export interface K8sSecret {
  name: string
  namespace: string
  type: string
  data: Record<string, string>
  created: number
}

export interface K8sJob {
  name: string
  namespace: string
  image: string
  completions: number
  status: 'Running' | 'Succeeded' | 'Failed'
  created: number
  owner: string | null
}

export interface K8sCronJob {
  name: string
  namespace: string
  schedule: string
  image: string
  created: number
  suspend: boolean
}

export interface K8sPV {
  name: string
  capacity: string
  accessModes: string
  reclaimPolicy: string
  status: 'Available' | 'Bound' | 'Released'
  claimRef: string | null
  storageClass: string
  created: number
}

export interface K8sPVC {
  name: string
  namespace: string
  requested: string
  accessModes: string
  status: 'Pending' | 'Bound'
  volumeName: string | null
  created: number
}

export interface K8sNodeTaint {
  key: string
  value: string
  effect?: string
}

export interface K8sNode {
  name: string
  status: 'Ready' | 'NotReady'
  roles: string[]
  version: string
  labels: Record<string, string>
  memCapacityMi: number
  memUsedMi: number
  cpuCapacity: number
  cpuUsed: number
  taints: K8sNodeTaint[]
  created: number
}

export interface K8sEvent {
  tick: number
  type: 'Normal' | 'Warning'
  reason: string
  object: string
  message: string
  count: number
}

export interface K8sState {
  namespaces: string[]
  nodes: K8sNode[]
  pods: K8sPod[]
  deployments: K8sDeployment[]
  services: K8sService[]
  configmaps: K8sConfigMap[]
  secrets: K8sSecret[]
  jobs: K8sJob[]
  cronjobs: K8sCronJob[]
  pvs: K8sPV[]
  pvcs: K8sPVC[]
  events: K8sEvent[]
}

export interface ProcEntry {
  pid: number
  cmd: string
  tty: string
  time: string
}

export type ServiceStatus = 'active' | 'inactive' | 'failed'

export interface ServiceEntry {
  name: string
  status: ServiceStatus
  pid: number | null
  startTime: number | null
  log: string[]
}

export interface SimState {
  version: number
  cwd: string
  uid: number
  gids: number[]
  env: Record<string, string>
  fsRoot: FsNode
  procs: ProcEntry[]
  services: ServiceEntry[]
  docker: DockerState
  k8s: K8sState
  history: string[]
  exitCodes: number[]
  clock: number
}
