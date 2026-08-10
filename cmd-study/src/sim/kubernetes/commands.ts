import yaml from 'js-yaml'
import type {
  CommandResult,
  K8sDeployment,
  K8sNode,
  K8sPod,
  K8sProbe,
  SimState,
} from '../types'
import { normalizePath, walk } from '../vfs/paths'
import { err, ok, register } from '../shell/registry'
import {
  K8S_IMAGES,
  addDeploymentWithSpec,
  bumpDeploymentRevision,
  configMapYaml,
  cronJobYaml,
  deploymentPods,
  deploymentYaml,
  describePodText,
  encodeB64,
  ensureNamespace,
  fmtAge,
  jobPods,
  jobYaml,
  knownImage,
  nextClusterIP,
  nextNodePort,
  nodeCpuRequest,
  nodeMemAvailableMi,
  nodeYaml,
  parseCpuToCores,
  parseMemToMi,
  podCpuRequest,
  podHash,
  podMemRequestMi,
  podYaml,
  pushEvent,
  pvYaml,
  pvcYaml,
  reconcileDeployment,
  secretYaml,
  serviceYaml,
  svcEndpoints,
  nextPodIP,
  schedulePod,
} from './state'

const RESOURCE_ALIASES: Record<string, string> = {
  pods: 'pods',
  po: 'pods',
  pod: 'pods',
  deployments: 'deployments',
  deploy: 'deployments',
  deployment: 'deployments',
  services: 'services',
  svc: 'services',
  service: 'services',
  configmaps: 'configmaps',
  cm: 'configmaps',
  configmap: 'configmaps',
  secrets: 'secrets',
  secret: 'secrets',
  namespaces: 'namespaces',
  ns: 'namespaces',
  namespace: 'namespaces',
  nodes: 'nodes',
  no: 'nodes',
  node: 'nodes',
  replicasets: 'replicasets',
  rs: 'replicasets',
  events: 'events',
  ev: 'events',
  jobs: 'jobs',
  job: 'jobs',
  cronjobs: 'cronjobs',
  cj: 'cronjobs',
  cronjob: 'cronjobs',
  persistentvolumes: 'persistentvolumes',
  pv: 'persistentvolumes',
  persistentvolumeclaims: 'persistentvolumeclaims',
  pvc: 'persistentvolumeclaims',
  endpoints: 'endpoints',
  ep: 'endpoints',
  all: 'all',
}

const SUPPORTED_RESOURCES =
  'pods/po, deployments/deploy, services/svc, configmaps/cm, secrets, namespaces/ns, nodes/no, replicasets/rs, events/ev, jobs, cronjobs/cj, persistentvolumes/pv, persistentvolumeclaims/pvc, endpoints/ep, all'

interface CliFlags {
  flags: Record<string, string[]>
  pos: string[]
  error?: CommandResult
}

function parseCli(
  args: string[],
  valueFlags: string[],
  boolFlags: string[],
  shortMap: Record<string, string> = {},
): CliFlags {
  const flags: Record<string, string[]> = {}
  const pos: string[] = []
  const add = (k: string, v: string) => {
    if (!flags[k]) flags[k] = []
    flags[k].push(v)
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      pos.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq)
      if (valueFlags.includes(name)) {
        if (eq !== -1) add(name, a.slice(eq + 1))
        else {
          const v = args[i + 1]
          if (v === undefined) return { flags, pos, error: err(`error: flag needs an argument: --${name}`, 1) }
          add(name, v)
          i++
        }
      } else if (boolFlags.includes(name)) {
        add(name, '')
      } else {
        return { flags, pos, error: err(`error: unknown flag: ${a.slice(0, eq === -1 ? a.length : eq)}\n提示：检查参数名是否正确。`, 1) }
      }
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      const short = a.slice(1)
      const longName = shortMap[short]
      if (longName && valueFlags.includes(longName)) {
        const v = args[i + 1]
        if (v === undefined) return { flags, pos, error: err(`error: flag needs an argument: -${short}`, 1) }
        add(longName, v)
        i++
      } else if (short === 'A') {
        add('all-namespaces', '')
      } else {
        return { flags, pos, error: err(`error: unknown shorthand flag: '${short}' in -${short}`, 1) }
      }
      continue
    }
    pos.push(a)
  }
  return { flags, pos }
}

function namespaceOf(flags: Record<string, string[]>): string {
  const ns = flags['namespace']?.[0]
  if (ns === undefined || ns === '') return 'default'
  return ns
}

function allNamespaces(flags: Record<string, string[]>): boolean {
  return flags['all-namespaces'] !== undefined
}

function resolveResourceType(kind: string): string | null {
  return RESOURCE_ALIASES[kind.toLowerCase()] ?? null
}

function labelSelectorMatches(labels: Record<string, string>, selector: string | undefined): boolean {
  if (!selector) return true
  return selector.split(',').every((part) => {
    part = part.trim()
    if (!part) return true
    if (part.startsWith('!')) {
      return !(part.slice(1) in labels)
    }
    const inMatch = /^([\w.-]+)\s+in\s+\(([^)]+)\)$/.exec(part)
    if (inMatch) {
      return inMatch[2].split(/\s+/).map((x) => x.trim()).includes(labels[inMatch[1]])
    }
    const notInMatch = /^([\w.-]+)\s+notin\s+\(([^)]+)\)$/.exec(part)
    if (notInMatch) {
      return !notInMatch[2].split(/\s+/).map((x) => x.trim()).includes(labels[notInMatch[1]])
    }
    const neq = part.indexOf('!=')
    if (neq !== -1) {
      return labels[part.slice(0, neq)] !== part.slice(neq + 2)
    }
    const eq = part.indexOf('=')
    if (eq === -1) return part in labels
    return labels[part.slice(0, eq)] === part.slice(eq + 1)
  })
}

function isoTime(created: number): string {
  return new Date((1783000000 + created) * 60 * 1000).toISOString()
}

function headerFor(kind: string): string {
  switch (kind) {
    case 'pods':
      return 'NAME'.padEnd(36) + 'READY'.padEnd(7) + 'STATUS'.padEnd(9) + 'RESTARTS'.padEnd(9) + 'AGE'
    case 'deployments':
      return 'NAME'.padEnd(36) + 'READY'.padEnd(7) + 'UP-TO-DATE'.padEnd(12) + 'AVAILABLE'.padEnd(11) + 'AGE'
    case 'services':
      return 'NAME'.padEnd(36) + 'TYPE'.padEnd(10) + 'CLUSTER-IP'.padEnd(15) + 'EXTERNAL-IP'.padEnd(13) + 'PORT(S)'.padEnd(18) + 'AGE'
    case 'configmaps':
      return 'NAME'.padEnd(36) + 'DATA'.padEnd(6) + 'AGE'
    case 'secrets':
      return 'NAME'.padEnd(36) + 'TYPE'.padEnd(7) + 'DATA'.padEnd(6) + 'AGE'
    case 'namespaces':
      return 'NAME'.padEnd(20) + 'STATUS'.padEnd(12) + 'AGE'
    case 'nodes':
      return 'NAME'.padEnd(9) + 'STATUS'.padEnd(8) + 'ROLES'.padEnd(22) + 'AGE'.padEnd(8) + 'VERSION'
    case 'replicasets':
      return 'NAME'.padEnd(36) + 'DESIRED'.padEnd(9) + 'CURRENT'.padEnd(9) + 'READY'.padEnd(8) + 'AGE'
    case 'events':
      return 'LAST SEEN'.padEnd(12) + 'TYPE'.padEnd(7) + 'REASON'.padEnd(20) + 'OBJECT'.padEnd(27) + 'MESSAGE'
    case 'jobs':
      return 'NAME'.padEnd(36) + 'COMPLETIONS'.padEnd(12) + 'DURATION'.padEnd(9) + 'AGE'
    case 'cronjobs':
      return 'NAME'.padEnd(36) + 'SCHEDULE'.padEnd(14) + 'SUSPEND'.padEnd(7) + 'ACTIVE'.padEnd(8) + 'LAST SCHEDULE'.padEnd(14) + 'AGE'
    case 'persistentvolumes':
      return (
        'NAME'.padEnd(43) + 'CAPACITY'.padEnd(10) + 'ACCESS MODES'.padEnd(13) + 'RECLAIM POLICY'.padEnd(16) + 'STATUS'.padEnd(9) + 'CLAIM'.padEnd(25) + 'STORAGECLASS'.padEnd(14) + 'AGE'
      )
    case 'persistentvolumeclaims':
      return 'NAME'.padEnd(36) + 'STATUS'.padEnd(7) + 'VOLUME'.padEnd(10) + 'CAPACITY'.padEnd(10) + 'ACCESS MODES'.padEnd(13) + 'STORAGECLASS'.padEnd(12) + 'AGE'
    case 'endpoints':
      return 'NAME'.padEnd(36) + 'ENDPOINTS'.padEnd(22) + 'AGE'
    default:
      return ''
  }
}

function getTable(
  state: SimState,
  kind: string,
  ns: string,
  allNs: boolean,
  name?: string,
  wide = false,
  selector?: string,
): string[] {
  const lines: string[] = [headerFor(kind)]
  const match = <T extends { namespace?: string; name: string }>(items: T[]): T[] =>
    items.filter((x) => (allNs || (x.namespace ?? '') === ns || kind === 'namespaces' || kind === 'nodes' || kind === 'persistentvolumes') && (!name || x.name === name))
  if (kind === 'pods') {
    const pods = match(state.k8s.pods.filter((p) => labelSelectorMatches(p.labels, selector)))
    for (const p of pods) {
      const row = `${p.name.padEnd(36)}${p.ready.padEnd(7)}${p.status.padEnd(9)}${String(p.restarts).padEnd(9)}${fmtAge(state.clock, p.created)}`
      lines.push(wide ? row + `   ${p.ip.padEnd(15)}${p.node.padEnd(9)}${Object.entries(p.labels).map(([k, v]) => `${k}=${v}`).join(',')}` : row)
    }
    if (pods.length === 0) lines.pop()
  } else if (kind === 'deployments') {
    const deps = match(state.k8s.deployments)
    for (const d of deps) {
      lines.push(
        `${d.name.padEnd(36)}${`${d.available}/${d.replicas}`.padEnd(7)}${String(d.replicas).padEnd(12)}${String(d.available).padEnd(11)}${fmtAge(state.clock, d.created)}`,
      )
    }
    if (deps.length === 0) lines.pop()
  } else if (kind === 'services') {
    const svcs = match(state.k8s.services)
    for (const s of svcs) {
      const ports = s.ports
        .map((p) => (p.nodePort ? `${p.port}:${p.nodePort}/NodePort` : `${p.port}/TCP`))
        .join(',')
      const ext = s.type === 'LoadBalancer' ? 'pending' : '<none>'
      lines.push(
        `${s.name.padEnd(36)}${s.type.padEnd(10)}${s.clusterIP.padEnd(15)}${ext.padEnd(13)}${ports.padEnd(18)}${fmtAge(state.clock, s.created)}`,
      )
    }
    if (svcs.length === 0) lines.pop()
  } else if (kind === 'configmaps') {
    const cms = match(state.k8s.configmaps)
    for (const c of cms) {
      lines.push(`${c.name.padEnd(36)}${String(Object.keys(c.data).length).padEnd(6)}${fmtAge(state.clock, c.created)}`)
    }
    if (cms.length === 0) lines.pop()
  } else if (kind === 'secrets') {
    const secs = match(state.k8s.secrets)
    for (const c of secs) {
      lines.push(`${c.name.padEnd(36)}${c.type.padEnd(7)}${String(Object.keys(c.data).length).padEnd(6)}${fmtAge(state.clock, c.created)}`)
    }
    if (secs.length === 0) lines.pop()
  } else if (kind === 'namespaces') {
    for (const n of state.k8s.namespaces) {
      if (name && n !== name) continue
      lines.push(`${n.padEnd(20)}${'Active'.padEnd(12)}${fmtAge(state.clock, state.clock - 300)}`)
    }
  } else if (kind === 'nodes') {
    const nodes = state.k8s.nodes.filter((n) => !name || n.name === name)
    for (const n of nodes) {
      const row = `${n.name.padEnd(9)}${n.status.padEnd(8)}${(n.roles.join(',')).padEnd(22)}${fmtAge(state.clock, state.clock - 300).padEnd(8)}${n.version}`
      lines.push(wide ? row + `   ${n.taints.map((t) => `${t.key}=${t.value}:${t.effect ?? 'NoSchedule'}`).join(',') || '<none>'}` : row)
    }
    if (nodes.length === 0) lines.pop()
  } else if (kind === 'replicasets') {
    let count = 0
    for (const d of state.k8s.deployments) {
      if (!allNs && d.namespace !== ns) continue
      if (name && !d.name.startsWith(name)) continue
      for (let i = 0; i < d.revisions.length; i++) {
        const rev = d.revisions[i]
        const isCurrent = i === d.revisions.length - 1
        const owned = deploymentPods(state, d.name, d.namespace)
        const desired = isCurrent ? d.replicas : 0
        const current = isCurrent ? owned.length : 0
        const ready = isCurrent ? d.available : 0
        lines.push(
          `${rev.rsName.padEnd(36)}${String(desired).padEnd(9)}${String(current).padEnd(9)}${String(ready).padEnd(8)}${fmtAge(state.clock, rev.created)}`,
        )
        count++
      }
    }
    if (count === 0) lines.pop()
  } else if (kind === 'jobs') {
    const jobs = match(state.k8s.jobs)
    for (const j of jobs) {
      const done = j.status === 'Succeeded'
      const completions = done ? `${j.completions}/${j.completions}` : `0/${j.completions}`
      const duration = done ? '11s' : '<none>'
      lines.push(`${j.name.padEnd(36)}${completions.padEnd(12)}${duration.padEnd(9)}${fmtAge(state.clock, j.created)}`)
    }
    if (jobs.length === 0) lines.pop()
  } else if (kind === 'cronjobs') {
    const cjs = match(state.k8s.cronjobs)
    for (const c of cjs) {
      lines.push(
        `${c.name.padEnd(36)}${c.schedule.padEnd(14)}${(c.suspend ? 'True' : 'False').padEnd(7)}${'0'.padEnd(8)}${fmtAge(state.clock, state.clock - 2).padEnd(14)}${fmtAge(state.clock, c.created)}`,
      )
    }
    if (cjs.length === 0) lines.pop()
  } else if (kind === 'persistentvolumes') {
    const pvs = state.k8s.pvs.filter((v) => !name || v.name === name)
    for (const v of pvs) {
      const claim = v.claimRef ? v.claimRef.split('/')[1] : ''
      lines.push(
        `${v.name.padEnd(43)}${v.capacity.padEnd(10)}${v.accessModes.padEnd(13)}${v.reclaimPolicy.padEnd(16)}${v.status.padEnd(9)}${claim.padEnd(25)}${v.storageClass.padEnd(14)}${fmtAge(state.clock, v.created)}`,
      )
    }
    if (pvs.length === 0) lines.pop()
  } else if (kind === 'persistentvolumeclaims') {
    const pvcs = match(state.k8s.pvcs)
    for (const c of pvcs) {
      const pv = c.volumeName ? state.k8s.pvs.find((v) => v.name === c.volumeName) : undefined
      lines.push(
        `${c.name.padEnd(36)}${c.status.padEnd(7)}${(c.volumeName ?? '').padEnd(10)}${(pv?.capacity ?? '').padEnd(10)}${c.accessModes.padEnd(13)}${'<unset>'.padEnd(12)}${fmtAge(state.clock, c.created)}`,
      )
    }
    if (pvcs.length === 0) lines.pop()
  } else if (kind === 'endpoints') {
    let count = 0
    for (const s of state.k8s.services) {
      if (!allNs && s.namespace !== ns) continue
      if (name && s.name !== name) continue
      const eps = svcEndpoints(state, s)
      lines.push(`${s.name.padEnd(36)}${eps.join(',') ? eps.join(',').padEnd(22) : '<none>'.padEnd(22)}${fmtAge(state.clock, s.created)}`)
      count++
    }
    if (count === 0) lines.pop()
  } else if (kind === 'events') {
    const events = [...state.k8s.events].sort((a, b) => b.tick - a.tick).slice(0, 20)
    for (const e of events) {
      lines.push(
        `${fmtAge(state.clock, e.tick).padEnd(12)}${e.type.padEnd(7)}${e.reason.padEnd(20)}${e.object.padEnd(27)}${e.message}${e.count > 1 ? ` (x${e.count})` : ''}`,
      )
    }
    if (events.length === 0) lines.pop()
  } else if (kind === 'all') {
    lines.length = 0
    lines.push('NAME                                READY   STATUS    RESTARTS   AGE')
    for (const p of state.k8s.pods) {
      if (!allNs && p.namespace !== ns) continue
      lines.push(`pod/${p.name}`.padEnd(36) + `${p.ready.padEnd(7)}${p.status.padEnd(9)}${String(p.restarts).padEnd(9)}${fmtAge(state.clock, p.created)}`)
    }
    for (const s of state.k8s.services) {
      if (!allNs && s.namespace !== ns) continue
      const ports = s.ports.map((p) => (p.nodePort ? `${p.port}:${p.nodePort}/NodePort` : `${p.port}/TCP`)).join(',')
      lines.push(`service/${s.name}`.padEnd(36) + `${s.type.padEnd(7)}${s.clusterIP.padEnd(9)}${'<none>'.padEnd(9)}${ports.padEnd(9)}${fmtAge(state.clock, s.created)}`)
    }
    for (const d of state.k8s.deployments) {
      if (!allNs && d.namespace !== ns) continue
      lines.push(`deployment.apps/${d.name}`.padEnd(36) + `${`${d.available}/${d.replicas}`.padEnd(7)}${String(d.replicas).padEnd(9)}${String(d.available).padEnd(9)}${fmtAge(state.clock, d.created)}`)
    }
    for (const d of state.k8s.deployments) {
      if (!allNs && d.namespace !== ns) continue
      lines.push(`replicaset/${d.name}-${d.podHash}`.padEnd(36) + `${String(d.replicas).padEnd(7)}${String(d.replicas).padEnd(9)}${String(d.available).padEnd(9)}${fmtAge(state.clock, d.created)}`)
    }
    if (lines.length === 1) lines.pop()
  }
  return lines
}

function findPod(state: SimState, name: string, ns: string): K8sPod | undefined {
  return state.k8s.pods.find((p) => p.name === name && p.namespace === ns)
}

function resourceYaml(state: SimState, kind: string, name: string, ns: string): CommandResult | null {
  switch (kind) {
    case 'pods': {
      const pod = findPod(state, name, ns)
      if (!pod) return err(`Error from server (NotFound): pods "${name}" not found`, 1)
      return ok(podYaml(pod) + '\n')
    }
    case 'deployments': {
      const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
      if (!dep) return err(`Error from server (NotFound): deployments.apps "${name}" not found`, 1)
      return ok(deploymentYaml(state, dep))
    }
    case 'services': {
      const svc = state.k8s.services.find((s) => s.name === name && s.namespace === ns)
      if (!svc) return err(`Error from server (NotFound): services "${name}" not found`, 1)
      return ok(serviceYaml(svc))
    }
    case 'configmaps': {
      const cm = state.k8s.configmaps.find((c) => c.name === name && c.namespace === ns)
      if (!cm) return err(`Error from server (NotFound): configmaps "${name}" not found`, 1)
      return ok(configMapYaml(cm))
    }
    case 'secrets': {
      const sec = state.k8s.secrets.find((c) => c.name === name && c.namespace === ns)
      if (!sec) return err(`Error from server (NotFound): secrets "${name}" not found`, 1)
      return ok(secretYaml(sec))
    }
    case 'nodes': {
      const node = state.k8s.nodes.find((n) => n.name === name)
      if (!node) return err(`Error from server (NotFound): nodes "${name}" not found`, 1)
      return ok(nodeYaml(node))
    }
    case 'persistentvolumes': {
      const pv = state.k8s.pvs.find((v) => v.name === name)
      if (!pv) return err(`Error from server (NotFound): persistentvolumes "${name}" not found`, 1)
      return ok(pvYaml(pv))
    }
    case 'persistentvolumeclaims': {
      const pvc = state.k8s.pvcs.find((c) => c.name === name && c.namespace === ns)
      if (!pvc) return err(`Error from server (NotFound): persistentvolumeclaims "${name}" not found`, 1)
      return ok(pvcYaml(pvc))
    }
    case 'jobs': {
      const job = state.k8s.jobs.find((j) => j.name === name && j.namespace === ns)
      if (!job) return err(`Error from server (NotFound): jobs.batch "${name}" not found`, 1)
      return ok(jobYaml(job))
    }
    case 'cronjobs': {
      const cj = state.k8s.cronjobs.find((j) => j.name === name && j.namespace === ns)
      if (!cj) return err(`Error from server (NotFound): cronjobs.batch "${name}" not found`, 1)
      return ok(cronJobYaml(cj))
    }
    default:
      return null
  }
}

function describeResource(state: SimState, kind: string, name: string, ns: string): CommandResult {
  if (kind === 'pods') {
    const pod = findPod(state, name, ns)
    if (!pod) return err(`Error from server (NotFound): pods "${name}" not found`, 1)
    return ok(describePodText(state, pod) + '\n')
  }
  if (kind === 'deployments') {
    const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
    if (!dep) return err(`Error from server (NotFound): deployments.apps "${name}" not found`, 1)
    const pods = deploymentPods(state, name, ns)
    const curRev = dep.revisions[dep.revisions.length - 1]
    const oldRs = dep.revisions.slice(0, -1).map((r) => r.rsName).join(', ') || '<none>'
    const lines = [
      `Name:                   ${dep.name}`,
      `Namespace:              ${dep.namespace}`,
      `CreationTimestamp:      ${isoTime(dep.created)}`,
      `Labels:                 ${Object.entries(dep.labels).map(([k, v]) => `${k}=${v}`).join(',')}`,
      `Annotations:            <none>`,
      `Selector:               ${Object.entries(dep.selector).map(([k, v]) => `${k}=${v}`).join(',')}`,
      `Replicas:               ${dep.replicas} desired | ${dep.available} updated | ${dep.available} total | ${dep.available} available | ${dep.replicas - dep.available} unavailable`,
      `StrategyType:           RollingUpdate`,
      'Pod Template:',
      `  Labels:               ${Object.entries(dep.selector).map(([k, v]) => `${k}=${v}`).join(',')}`,
      '  Containers:',
      `   ${dep.containerName}:`,
      `    Image:              ${dep.image}`,
      `    Port:               ${dep.ports.length ? dep.ports.join(',') : '<none>'}`,
      `    Requests:           cpu=${dep.resources.requests?.cpu ?? '<none>'}, memory=${dep.resources.requests?.memory ?? '<none>'}`,
      `    Limits:             cpu=${dep.resources.limits?.cpu ?? '<none>'}, memory=${dep.resources.limits?.memory ?? '<none>'}`,
      `    Liveness:           ${dep.probes.liveness ? fmtProbe(dep.probes.liveness) : '<none>'}`,
      `    Readiness:          ${dep.probes.readiness ? fmtProbe(dep.probes.readiness) : '<none>'}`,
      `    Startup:            ${dep.probes.startup ? fmtProbe(dep.probes.startup) : '<none>'}`,
      ...(dep.env.length ? [`    Environment:        ${dep.env.map((e) => e.configMapKeyRef ? `${e.name} (cm:${e.configMapKeyRef.name}/${e.configMapKeyRef.key})` : e.secretKeyRef ? `${e.name} (secret:${e.secretKeyRef.name}/${e.secretKeyRef.key})` : `${e.name}=${e.value}`).join(', ')}`] : []),
      ...(dep.envFrom.length ? [`    Environment Variables from: ${dep.envFrom.map((e) => e.configMapRef ? `ConfigMap ${e.configMapRef} (Optional: false)` : `Secret ${e.secretRef} (Optional: false)`).join(', ')}`] : []),
      ...(dep.volumeMounts.length ? ['  Volumes:', ...dep.volumeMounts.map((m) => `   ${m.name}:`), ...dep.volumes.map((v) => `    Type: ${v.configMap ? 'ConfigMap' : v.secret ? 'Secret' : v.pvc ? 'PersistentVolumeClaim' : ''} (a ${v.name})`)] : ['  Volumes:              <none>']),
      'Conditions:',
      '  Type           Status  Reason',
      `  Available      ${dep.available > 0 ? 'True' : 'False'}    ${dep.available > 0 ? 'MinimumReplicasAvailable' : 'DeploymentPaused'}`,
      'OldReplicaSets:  ' + oldRs,
      `NewReplicaSet:   ${curRev ? curRev.rsName : '<none>'} (${dep.available}/${dep.replicas} replicas created)`,
      'Events:',
    ]
    const events = state.k8s.events.filter((e) => e.object.includes(dep.name)).slice(-5)
    lines.push('  Type     Reason    Age   From             Message')
    for (const e of events) {
      lines.push(`  ${e.type.padEnd(8)}${e.reason.padEnd(10)}${fmtAge(state.clock, e.tick).padEnd(6)}deployment-controller  ${e.message}`)
    }
    if (events.length === 0) lines.push('  <none>')
    void pods
    return ok(lines.join('\n') + '\n')
  }
  if (kind === 'services') {
    const svc = state.k8s.services.find((s) => s.name === name && s.namespace === ns)
    if (!svc) return err(`Error from server (NotFound): services "${name}" not found`, 1)
    const p = svc.ports[0]
    const eps = svcEndpoints(state, svc)
    return ok(
      [
        `Name:              ${svc.name}`,
        `Namespace:         ${svc.namespace}`,
        `Type:              ${svc.type}`,
        `Cluster-IP:        ${svc.clusterIP}`,
        `External-IP:       ${svc.type === 'LoadBalancer' ? '<pending>' : '<none>'}`,
        `Port:              ${p.port}  ${p.nodePort ? `:${p.nodePort}` : ''}`,
        `TargetPort:        ${p.targetPort}`,
        `Selector:          ${Object.entries(svc.selector).map(([k, v]) => `${k}=${v}`).join(',')}`,
        `Endpoints:         ${eps.length ? eps.join(',') : '<none>'}`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'configmaps') {
    const cm = state.k8s.configmaps.find((c) => c.name === name && c.namespace === ns)
    if (!cm) return err(`Error from server (NotFound): configmaps "${name}" not found`, 1)
    const lines = [`Name:              ${cm.name}`, `Namespace:         ${cm.namespace}`, '', 'Data', '====', ...Object.keys(cm.data).map((k) => `${k}:\n----\n${cm.data[k]}`)]
    return ok(lines.join('\n') + '\n')
  }
  if (kind === 'secrets') {
    const sec = state.k8s.secrets.find((c) => c.name === name && c.namespace === ns)
    if (!sec) return err(`Error from server (NotFound): secrets "${name}" not found`, 1)
    const lines = [`Name:              ${sec.name}`, `Namespace:         ${sec.namespace}`, `Type:              ${sec.type}`, '', 'Data', '====', ...Object.keys(sec.data).map((k) => `${k}:  ${sec.data[k]} bytes`)]
    return ok(lines.join('\n') + '\n')
  }
  if (kind === 'nodes') {
    const node = state.k8s.nodes.find((n) => n.name === name)
    if (!node) return err(`Error from server (NotFound): nodes "${name}" not found`, 1)
    return ok(
      [
        `Name:               ${node.name}`,
        `Roles:              ${node.roles.join(',')}`,
        `Labels:             ${Object.entries(node.labels).map(([k, v]) => `${k}=${v}`).join(',')}`,
        `CreationTimestamp:  ${isoTime(node.created)}`,
        'Taints:             ' + (node.taints.length ? node.taints.map((t) => `${t.key}=${t.value}:${t.effect ?? 'NoSchedule'}`).join(',') : '<none>'),
        'Unschedulable:      false',
        '',
        'Allocated resources:',
        '  (Total limits may be over 100 percent, i.e., overcommitted.)',
        '  Resource           Requests      Limits',
        `  cpu                ${state.k8s.pods.filter((p) => p.node === node.name).reduce((s, p) => s + podCpuRequest(p), 0).toFixed(3)}     0`,
        `  memory             ${state.k8s.pods.filter((p) => p.node === node.name).reduce((s, p) => s + podMemRequestMi(p), 0)}Mi     0`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'persistentvolumes') {
    const pv = state.k8s.pvs.find((v) => v.name === name)
    if (!pv) return err(`Error from server (NotFound): persistentvolumes "${name}" not found`, 1)
    return ok(
      [
        `Name:              ${pv.name}`,
        `Labels:            type=local`,
        `Capacity:          ${pv.capacity}`,
        `Access Modes:      ${pv.accessModes}`,
        `PersistentVolume Reclaim Policy: ${pv.reclaimPolicy}`,
        `StorageClass:      ${pv.storageClass || '<unset>'}`,
        `Status:            ${pv.status}`,
        `Claim:             ${pv.claimRef ?? '<none>'}`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'persistentvolumeclaims') {
    const pvc = state.k8s.pvcs.find((c) => c.name === name && c.namespace === ns)
    if (!pvc) return err(`Error from server (NotFound): persistentvolumeclaims "${name}" not found`, 1)
    return ok(
      [
        `Name:          ${pvc.name}`,
        `Namespace:     ${pvc.namespace}`,
        `StorageClass:  ${'<unset>'}`,
        `Status:        ${pvc.status}`,
        `Volume:        ${pvc.volumeName ?? '<none>'}`,
        `Capacity:      ${pvc.volumeName ? state.k8s.pvs.find((v) => v.name === pvc.volumeName)?.capacity : ''}`,
        `Access Modes:  ${pvc.accessModes}`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'jobs') {
    const job = state.k8s.jobs.find((j) => j.name === name && j.namespace === ns)
    if (!job) return err(`Error from server (NotFound): jobs.batch "${name}" not found`, 1)
    return ok(
      [
        `Name:             ${job.name}`,
        `Namespace:        ${job.namespace}`,
        `CreationTimestamp: ${isoTime(job.created)}`,
        `Selector:         controller-uid=<none>`,
        `Parallelism:      1`,
        `Completions:      ${job.completions}`,
        `Status:           ${job.status}`,
        `Start Time:       ${isoTime(job.created)}`,
        `Duration:         ${job.status === 'Succeeded' ? '11s' : '<none>'}`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'cronjobs') {
    const cj = state.k8s.cronjobs.find((j) => j.name === name && j.namespace === ns)
    if (!cj) return err(`Error from server (NotFound): cronjobs.batch "${name}" not found`, 1)
    return ok(
      [
        `Name:                          ${cj.name}`,
        `Namespace:                     ${cj.namespace}`,
        `CreationTimestamp:             ${isoTime(cj.created)}`,
        `Schedule:                      ${cj.schedule}`,
        `Suspend:                       ${cj.suspend}`,
        `ConcurrencyPolicy:             Allow`,
        `Last Schedule Time:            ${isoTime(cj.created + 2)}`,
        `Active Jobs:                   0`,
        `Image:                         ${cj.image}`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'replicasets') {
    const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
    if (!dep) return err(`Error from server (NotFound): replicasets.apps "${name}" not found`, 1)
    const curRev = dep.revisions[dep.revisions.length - 1]
    return ok(
      [
        `Name:           ${curRev?.rsName ?? name}`,
        `Namespace:      ${dep.namespace}`,
        `Selector:       ${Object.entries(dep.selector).map(([k, v]) => `${k}=${v}`).join(',')}`,
        `Labels:         ${Object.entries(dep.selector).map(([k, v]) => `${k}=${v}`).join(',')}`,
        `Annotations:    deployment.kubernetes.io/desired-replicas: ${dep.replicas}`,
        `Controlled By:  Deployment/${dep.name}`,
        `Replicas:       ${dep.replicas} current / ${dep.replicas} desired`,
        `Pods Status:    ${dep.available} Running / 0 Waiting / 0 Succeeded / 0 Failed`,
        '',
        'Events:              <none>',
      ].join('\n') + '\n',
    )
  }
  if (kind === 'endpoints') {
    const svc = state.k8s.services.find((s) => s.name === name && s.namespace === ns)
    if (!svc) return err(`Error from server (NotFound): endpoints "${name}" not found`, 1)
    const eps = svcEndpoints(state, svc)
    return ok(
      [
        `Name:         ${svc.name}`,
        `Namespace:    ${svc.namespace}`,
        `Subsets:      ${eps.length ? '' : '<none>'}`,
        ...(eps.length
          ? [`  Addresses:    ${eps.join(',')}`, `  Ports:        ${svc.ports[0].port}  TCP`]
          : []),
        '',
        'Events:       <none>',
      ].join('\n') + '\n',
    )
  }
  return err(`error: the server doesn't have a resource type "${kind}"\n提示：支持 ${SUPPORTED_RESOURCES}`, 1)
}

function fmtProbe(probe: K8sProbe): string {
  if (probe.httpGet) return `http-get ${probe.httpGet.path} delay=0s timeout=1s period=${probe.periodSeconds ?? 10}s #success=1 #failure=3`
  if (probe.exec) return `exec [${probe.exec.command}] delay=0s timeout=1s period=${probe.periodSeconds ?? 10}s #success=1 #failure=3`
  return '<none>'
}

// ---------- apply / yaml 解析 ----------

interface ContainerSpecParsed {
  name: string
  image: string
  ports: number[]
  resources: { requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } }
  probes: { readiness?: K8sProbe; liveness?: K8sProbe; startup?: K8sProbe }
  env: Record<string, unknown>[]
  envFrom: Record<string, unknown>[]
  volumeMounts: Record<string, unknown>[]
}

function parseContainerProbes(raw: Record<string, unknown>): { readiness?: K8sProbe; liveness?: K8sProbe; startup?: K8sProbe } {
  const parse = (p: unknown): K8sProbe | undefined => {
    if (!p || typeof p !== 'object') return undefined
    const po = p as Record<string, unknown>
    const probe: K8sProbe = { periodSeconds: Number(po['periodSeconds'] ?? 10), initialDelaySeconds: Number(po['initialDelaySeconds'] ?? 0) }
    const http = po['httpGet'] as Record<string, unknown> | undefined
    if (http) probe.httpGet = { path: String(http['path'] ?? '/'), port: Number(http['port'] ?? 80) }
    const exec = po['exec'] as Record<string, unknown> | undefined
    if (exec) probe.exec = { command: Array.isArray(exec['command']) ? (exec['command'] as string[]).join(' ') : String(exec['command'] ?? '') }
    if (!probe.httpGet && !probe.exec) return undefined
    return probe
  }
  return {
    readiness: parse(poReadiness(raw)),
    liveness: parse(poLiveness(raw)),
    startup: parse(poStartup(raw)),
  }
}

function poReadiness(c: Record<string, unknown>): unknown {
  return c['readinessProbe']
}
function poLiveness(c: Record<string, unknown>): unknown {
  return c['livenessProbe']
}
function poStartup(c: Record<string, unknown>): unknown {
  return c['startupProbe']
}

function parseContainer(raw: Record<string, unknown>): ContainerSpecParsed | null {
  const image = String(raw['image'] ?? '')
  if (!image) return null
  const ports: number[] = ((raw['ports'] as Record<string, unknown>[]) ?? []).map((p) => Number(p['containerPort'] ?? 0)).filter((n) => n > 0)
  const resources = (raw['resources'] ?? {}) as Record<string, unknown>
  const req = (resources['requests'] ?? {}) as Record<string, unknown>
  const lim = (resources['limits'] ?? {}) as Record<string, unknown>
  return {
    name: String(raw['name'] ?? ''),
    image,
    ports,
    resources: {
      requests: { cpu: req['cpu'] !== undefined ? String(req['cpu']) : undefined, memory: req['memory'] !== undefined ? String(req['memory']) : undefined },
      limits: { cpu: lim['cpu'] !== undefined ? String(lim['cpu']) : undefined, memory: lim['memory'] !== undefined ? String(lim['memory']) : undefined },
    },
    probes: parseContainerProbes(raw),
    env: (raw['env'] ?? []) as Record<string, unknown>[],
    envFrom: (raw['envFrom'] ?? []) as Record<string, unknown>[],
    volumeMounts: (raw['volumeMounts'] ?? []) as Record<string, unknown>[],
  }
}

function bindPVC(state: SimState, pvcName: string, ns: string): void {
  const pvc = state.k8s.pvcs.find((c) => c.name === pvcName && c.namespace === ns)
  if (!pvc || pvc.status === 'Bound') return
  const pv = state.k8s.pvs.find(
    (v) => v.status === 'Available' && v.accessModes.includes(pvc.accessModes) && parseMemToMi(v.capacity) >= parseMemToMi(pvc.requested),
  )
  if (pv) {
    pv.status = 'Bound'
    pv.claimRef = `${ns}/${pvc.name}`
    pvc.status = 'Bound'
    pvc.volumeName = pv.name
    pushEvent(state, 'Normal', 'ProvisioningSucceeded', `persistentvolumeclaim/${pvc.name}`, `Successfully provisioned volume ${pv.name}`)
  }
}

function applyYaml(state: SimState, content: string, sourceName: string): CommandResult {
  let docs: unknown[]
  try {
    docs = yaml.loadAll(content) as unknown[]
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(`error: error converting YAML to JSON: yaml: ${msg}\n提示：请检查 ${sourceName} 的缩进和语法（可用 cat 查看文件内容）。`, 1)
  }
  const outputs: string[] = []
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') {
      return err(`error: unable to decode "${sourceName}": document must not be empty\n提示：文件内容可能是空的，请先写入 YAML。`, 1)
    }
    const obj = doc as Record<string, unknown>
    const apiVersion = String(obj['apiVersion'] ?? '')
    const kind = String(obj['kind'] ?? '')
    const meta = (obj['metadata'] ?? {}) as Record<string, unknown>
    const name = String(meta['name'] ?? '')
    const ns = String(meta['namespace'] ?? 'default')
    const labels = (meta['labels'] ?? {}) as Record<string, string>
    const annotations = (meta['annotations'] ?? {}) as Record<string, string>
    if (!apiVersion || !kind) {
      return err(`error: unable to recognize "${sourceName}": no matches for kind "" in version ""\n提示：YAML 需要包含 apiVersion 和 kind 字段。`, 1)
    }
    if (!name) {
      return err(`error: error validating "${sourceName}": error validating data: ValidationError(${kind}.metadata): missing required field "name" in io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta\n提示：metadata.name 是必填的。`, 1)
    }
    if (!ensureNamespace(state, ns)) {
      return err(`error: namespaces "${ns}" not found`, 1)
    }
    if (kind === 'Pod') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const containers = (spec['containers'] ?? []) as Record<string, unknown>[]
      const c = parseContainer(containers[0] ?? {})
      if (!c) return err(`error: error validating "${sourceName}": error validating data: [ValidationError(Pod.spec.containers[0]): missing required field "image"]\n提示：Pod 需要 spec.containers[0].image。`, 1)
      const existing = findPod(state, name, ns)
      const pod: K8sPod = {
        name,
        namespace: ns,
        status: 'Pending',
        ready: '0/1',
        restarts: 0,
        node: 'node-1',
        image: c.image,
        ip: '',
        labels: Object.keys(labels).length ? labels : { app: name },
        annotations,
        created: state.clock,
        logs: [],
        owner: null,
        env: {},
        fs: {},
        resources: c.resources,
        probes: c.probes,
        nodeSelector: (spec['nodeSelector'] ?? {}) as Record<string, string>,
        tolerations: ((spec['tolerations'] ?? []) as Record<string, unknown>[]).map((t) => ({ key: String(t['key'] ?? ''), value: String(t['value'] ?? ''), effect: t['effect'] !== undefined ? String(t['effect']) : undefined })),
        pvcRefs: [],
        exitCode: null,
        message: '',
      }
      if (existing) {
        existing.image = pod.image
        existing.labels = pod.labels
        existing.annotations = pod.annotations
        existing.resources = pod.resources
        existing.probes = pod.probes
        outputs.push(`pod/${name} configured`)
      } else {
        state.k8s.pods.push(pod)
        schedulePod(state, pod)
        outputs.push(`pod/${name} created`)
      }
    } else if (kind === 'Deployment') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const replicas = Number(spec['replicas'] ?? 1)
      if (!Number.isInteger(replicas) || replicas < 0) {
        return err(`error: error validating "${sourceName}": spec.replicas must be a non-negative integer`, 1)
      }
      const template = (spec['template'] ?? {}) as Record<string, unknown>
      const templateMeta = (template['metadata'] ?? {}) as Record<string, unknown>
      const templateSpec = (template['spec'] ?? {}) as Record<string, unknown>
      const containers = (templateSpec['containers'] ?? []) as Record<string, unknown>[]
      const c = parseContainer(containers[0] ?? {})
      if (!c) return err(`error: error validating "${sourceName}": error validating data: [ValidationError(Deployment.spec.template.spec.containers[0]): missing required field "image"]\n提示：Deployment 需要 spec.template.spec.containers[0].image。`, 1)
      const selMatch = ((spec['selector'] ?? {}) as Record<string, unknown>)['matchLabels'] as Record<string, string> | undefined
      const selector = selMatch ?? { app: name }
      const templateLabels = ((templateMeta['labels'] ?? {}) as Record<string, string>) || selector
      const env: K8sDeployment['env'] = []
      for (const e of c.env) {
        const en = String(e['name'] ?? '')
        const from = e['valueFrom'] as Record<string, unknown> | undefined
        if (from) {
          const cmk = (from['configMapKeyRef'] ?? {}) as Record<string, unknown>
          const sek = (from['secretKeyRef'] ?? {}) as Record<string, unknown>
          if (cmk['name']) env.push({ name: en, configMapKeyRef: { name: String(cmk['name']), key: String(cmk['key'] ?? '') } })
          else if (sek['name']) env.push({ name: en, secretKeyRef: { name: String(sek['name']), key: String(sek['key'] ?? '') } })
        } else {
          env.push({ name: en, value: e['value'] !== undefined ? String(e['value']) : '' })
        }
      }
      const envFrom: K8sDeployment['envFrom'] = []
      for (const e of c.envFrom) {
        const cmRef = (e['configMapRef'] ?? {}) as Record<string, unknown>
        const secRef = (e['secretRef'] ?? {}) as Record<string, unknown>
        if (cmRef['name']) envFrom.push({ configMapRef: String(cmRef['name']) })
        else if (secRef['name']) envFrom.push({ secretRef: String(secRef['name']) })
      }
      const volumesRaw = ((templateSpec['volumes'] ?? []) as Record<string, unknown>[]) ?? []
      const volumes: K8sDeployment['volumes'] = []
      for (const v of volumesRaw) {
        const vn = String(v['name'] ?? '')
        const cm = (v['configMap'] ?? {}) as Record<string, unknown>
        const sec = (v['secret'] ?? {}) as Record<string, unknown>
        const pvc = (v['persistentVolumeClaim'] ?? {}) as Record<string, unknown>
        if (cm['name']) volumes.push({ name: vn, configMap: String(cm['name']) })
        else if (sec['secretName']) volumes.push({ name: vn, secret: String(sec['secretName']) })
        else if (pvc['claimName']) volumes.push({ name: vn, pvc: String(pvc['claimName']) })
      }
      const volumeMounts: K8sDeployment['volumeMounts'] = []
      for (const m of c.volumeMounts) {
        const mn = String(m['name'] ?? '')
        if (mn) volumeMounts.push({ name: mn, mountPath: String(m['mountPath'] ?? ''), subPath: m['subPath'] !== undefined ? String(m['subPath']) : undefined })
      }
      const tolerations = ((templateSpec['tolerations'] ?? []) as Record<string, unknown>[]).map((t) => ({ key: String(t['key'] ?? ''), value: String(t['value'] ?? ''), effect: t['effect'] !== undefined ? String(t['effect']) : undefined }))
      const nodeSelector = (templateSpec['nodeSelector'] ?? {}) as Record<string, string>

      const existing = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
      if (existing) {
        const prevImage = existing.image
        const prevTemplate = JSON.stringify({
          selector: existing.selector,
          resources: existing.resources,
          probes: existing.probes,
          env: existing.env,
          envFrom: existing.envFrom,
          volumes: existing.volumes,
          volumeMounts: existing.volumeMounts,
          nodeSelector: existing.nodeSelector,
          tolerations: existing.tolerations,
          ports: existing.ports,
        })
        existing.replicas = replicas
        existing.selector = selector
        existing.labels = Object.keys(labels).length ? labels : existing.labels
        existing.containerName = c.name || existing.containerName
        existing.image = c.image
        existing.resources = c.resources
        existing.probes = c.probes
        existing.env = env
        existing.envFrom = envFrom
        existing.volumes = volumes
        existing.volumeMounts = volumeMounts
        existing.nodeSelector = nodeSelector
        existing.tolerations = tolerations
        existing.ports = c.ports
        const newTemplate = JSON.stringify({
          selector: existing.selector,
          resources: existing.resources,
          probes: existing.probes,
          env: existing.env,
          envFrom: existing.envFrom,
          volumes: existing.volumes,
          volumeMounts: existing.volumeMounts,
          nodeSelector: existing.nodeSelector,
          tolerations: existing.tolerations,
          ports: existing.ports,
        })
        if (existing.image !== prevImage) {
          bumpDeploymentRevision(state, existing, { image: existing.image, containerName: existing.containerName })
          pushEvent(state, 'Normal', 'SuccessfulUpdate', `deployment/${name}`, `Updated image to ${existing.image}`)
        } else if (prevTemplate !== newTemplate) {
          bumpDeploymentRevision(state, existing, { restart: true })
        } else {
          reconcileDeployment(state, existing)
        }
        outputs.push(`deployment.apps/${name} configured`)
      } else {
        const dep: K8sDeployment = {
          name,
          namespace: ns,
          replicas,
          available: 0,
          image: c.image,
          containerName: c.name || name,
          podHash: podHash(name, c.image, 0),
          created: state.clock,
          labels: Object.keys(labels).length ? labels : { app: name },
          selector,
          revision: 1,
          revisions: [],
          resources: c.resources,
          probes: c.probes,
          envFrom,
          env,
          volumes,
          volumeMounts,
          nodeSelector,
          tolerations,
          ports: c.ports,
        }
        dep.revisions.push({ revision: 1, image: c.image, containerName: dep.containerName, rsName: `${name}-${dep.podHash}`, created: state.clock })
        const error = addDeploymentWithSpec(state, dep)
        if (error) return err(error, 1)
        outputs.push(`deployment.apps/${name} created`)
      }
    } else if (kind === 'Service') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const portsRaw = (spec['ports'] ?? []) as Record<string, unknown>[]
      const selector = (spec['selector'] ?? {}) as Record<string, string>
      const svcType = String(spec['type'] ?? 'ClusterIP')
      if (!['ClusterIP', 'NodePort', 'LoadBalancer'].includes(svcType)) {
        return err(`error: error validating "${sourceName}": spec.type must be ClusterIP, NodePort or LoadBalancer`, 1)
      }
      const svcDef = {
        name,
        namespace: ns,
        type: svcType,
        clusterIP: nextClusterIP(state),
        ports: portsRaw.map((p) => ({
          port: Number(p['port'] ?? 80),
          targetPort: Number(p['targetPort'] ?? p['port'] ?? 80),
          nodePort: svcType === 'NodePort' ? nextNodePort(state) : null,
        })),
        selector,
        created: state.clock,
      }
      const existing = state.k8s.services.find((s) => s.name === name && s.namespace === ns)
      if (existing) {
        existing.type = svcDef.type
        existing.ports = svcDef.ports
        existing.selector = selector
        outputs.push(`service/${name} configured`)
      } else {
        state.k8s.services.push(svcDef)
        pushEvent(state, 'Normal', 'CreatingLoadBalancer', `service/${name}`, 'Ensuring load balancer')
        outputs.push(`service/${name} created`)
      }
    } else if (kind === 'ConfigMap') {
      const data = (obj['data'] ?? {}) as Record<string, string>
      const existing = state.k8s.configmaps.find((c) => c.name === name && c.namespace === ns)
      if (existing) {
        existing.data = { ...existing.data, ...data }
        outputs.push(`configmap/${name} configured`)
      } else {
        state.k8s.configmaps.push({ name, namespace: ns, data, created: state.clock })
        outputs.push(`configmap/${name} created`)
      }
    } else if (kind === 'Secret') {
      const data = (obj['data'] ?? {}) as Record<string, string>
      const stringData = (obj['stringData'] ?? {}) as Record<string, string>
      const merged: Record<string, string> = { ...data }
      for (const [k, v] of Object.entries(stringData)) merged[k] = encodeB64(v)
      const secType = String(obj['type'] ?? 'Opaque')
      const existing = state.k8s.secrets.find((c) => c.name === name && c.namespace === ns)
      if (existing) {
        existing.data = { ...existing.data, ...merged }
        existing.type = secType
        outputs.push(`secret/${name} configured`)
      } else {
        state.k8s.secrets.push({ name, namespace: ns, type: secType, data: merged, created: state.clock })
        outputs.push(`secret/${name} created`)
      }
    } else if (kind === 'Namespace') {
      if (state.k8s.namespaces.includes(name)) {
        outputs.push(`namespace/${name} unchanged`)
      } else {
        state.k8s.namespaces.push(name)
        outputs.push(`namespace/${name} created`)
      }
    } else if (kind === 'Job') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const completions = Number(spec['completions'] ?? 1)
      const templateSpec = ((spec['template'] ?? {}) as Record<string, unknown>)['spec'] as Record<string, unknown> | undefined
      const containers = ((templateSpec ?? {})['containers'] ?? []) as Record<string, unknown>[]
      const image = String((containers[0] ?? {})['image'] ?? '')
      if (!image) return err(`error: error validating "${sourceName}": error validating data: [ValidationError(Job.spec.template.spec.containers[0]): missing required field "image"]\n提示：Job 需要 spec.template.spec.containers[0].image。`, 1)
      if (state.k8s.jobs.some((j) => j.name === name && j.namespace === ns)) {
        return err(`Error from server (AlreadyExists): jobs.batch "${name}" already exists`, 1)
      }
      const job = { name, namespace: ns, image, completions, status: 'Succeeded' as const, created: state.clock, owner: null }
      state.k8s.jobs.push(job)
      for (let i = 0; i < completions; i++) {
        const podName = `${name}-${i + 1}-x8z7k`
        const specImg = knownImage(image)
        state.k8s.pods.push({
          name: podName,
          namespace: ns,
          status: 'Completed',
          ready: '0/1',
          restarts: 0,
          node: 'node-1',
          image,
          ip: nextPodIP(state),
          labels: { 'job-name': name },
          annotations: {},
          created: state.clock,
          logs: specImg ? [...specImg.logs, 'job executed successfully'] : ['job executed successfully'],
          owner: name,
          ownerKind: 'job',
          env: {},
          fs: {},
          resources: {},
          probes: {},
          nodeSelector: {},
          tolerations: [],
          pvcRefs: [],
          exitCode: 0,
          message: '',
        })
      }
      pushEvent(state, 'Normal', 'SuccessfulCreate', `job/${name}`, `Created pod: ${name}-1-x8z7k`)
      outputs.push(`job.batch/${name} created`)
    } else if (kind === 'CronJob') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const schedule = String(spec['schedule'] ?? '')
      if (!/^(\S+\s+){4}\S+$/.test(schedule)) {
        return err(`error: error validating "${sourceName}": spec.schedule is required (5 字段 cron 表达式)`, 1)
      }
      const suspend = Boolean(spec['suspend'] ?? false)
      const jobTemplate = (spec['jobTemplate'] ?? {}) as Record<string, unknown>
      const jobTemplateSpec = (jobTemplate['spec'] ?? {}) as Record<string, unknown>
      const jobPodTemplate = (jobTemplateSpec['template'] ?? {}) as Record<string, unknown>
      const jobPodSpec = (jobPodTemplate['spec'] ?? {}) as Record<string, unknown>
      const containers = (jobPodSpec['containers'] ?? []) as Record<string, unknown>[]
      const image = String((containers[0] ?? {})['image'] ?? '')
      if (!image) return err(`error: error validating "${sourceName}": error validating data: [ValidationError(CronJob.spec.jobTemplate.spec.template.spec.containers[0]): missing required field "image"]\n提示：CronJob 需要 spec.jobTemplate.spec.template.spec.containers[0].image。`, 1)
      if (state.k8s.cronjobs.some((j) => j.name === name && j.namespace === ns)) {
        return err(`Error from server (AlreadyExists): cronjobs.batch "${name}" already exists`, 1)
      }
      state.k8s.cronjobs.push({ name, namespace: ns, schedule, image, created: state.clock, suspend })
      const jobName = `${name}-27000001`
      state.k8s.jobs.push({ name: jobName, namespace: ns, image, completions: 1, status: 'Succeeded', created: state.clock, owner: name })
      pushEvent(state, 'Normal', 'SuccessfulCreate', `cronjob/${name}`, `Created job ${jobName}`)
      outputs.push(`cronjob.batch/${name} created`)
    } else if (kind === 'PersistentVolume') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const cap = ((spec['capacity'] ?? {}) as Record<string, unknown>)['storage'] as string | undefined
      const accessModes = ((spec['accessModes'] ?? []) as string[])[0] ?? 'ReadWriteOnce'
      const reclaim = String(spec['persistentVolumeReclaimPolicy'] ?? 'Retain')
      const storageClass = String(spec['storageClassName'] ?? '')
      if (!cap) return err(`error: error validating "${sourceName}": spec.capacity.storage is required\n提示：PersistentVolume 需要 spec.capacity.storage（如 1Gi）。`, 1)
      if (state.k8s.pvs.some((v) => v.name === name)) {
        return err(`Error from server (AlreadyExists): persistentvolumes "${name}" already exists`, 1)
      }
      state.k8s.pvs.push({ name, capacity: String(cap), accessModes, reclaimPolicy: reclaim, status: 'Available', claimRef: null, storageClass, created: state.clock })
      for (const pvc of state.k8s.pvcs.filter((c) => c.status === 'Pending')) {
        bindPVC(state, pvc.name, pvc.namespace)
      }
      pushEvent(state, 'Normal', 'ProvisioningSucceeded', `persistentvolume/${name}`, 'Successfully provisioned volume')
      outputs.push(`persistentvolume/${name} created`)
    } else if (kind === 'PersistentVolumeClaim') {
      const spec = (obj['spec'] ?? {}) as Record<string, unknown>
      const accessModes = ((spec['accessModes'] ?? []) as string[])[0] ?? 'ReadWriteOnce'
      const storage = ((spec['resources'] ?? {}) as Record<string, unknown>)['requests'] as Record<string, unknown> | undefined
      const requested = String(storage?.['storage'] ?? '')
      if (!requested) return err(`error: error validating "${sourceName}": spec.resources.requests.storage is required\n提示：PersistentVolumeClaim 需要 spec.resources.requests.storage（如 500Mi）。`, 1)
      const existing = state.k8s.pvcs.find((c) => c.name === name && c.namespace === ns)
      if (existing) return err(`Error from server (AlreadyExists): persistentvolumeclaims "${name}" already exists`, 1)
      state.k8s.pvcs.push({ name, namespace: ns, requested, accessModes, status: 'Pending', volumeName: null, created: state.clock })
      bindPVC(state, name, ns)
      outputs.push(`persistentvolumeclaim/${name} created`)
    } else {
      return err(`error: unable to recognize "${sourceName}": no matches for kind "${kind}" in version "${apiVersion}"\n提示：模拟器支持 Pod、Deployment、Service、ConfigMap、Secret、Namespace、Job、CronJob、PersistentVolume、PersistentVolumeClaim。`, 1)
    }
  }
  return ok(outputs.join('\n') + '\n')
}

function execInPod(state: SimState, pod: K8sPod, cmdArgs: string[]): CommandResult {
  const container = pod.name.split('-')[0]
  if (pod.status === 'CrashLoopBackOff' || pod.status === 'ImagePullBackOff') {
    return err(`Error from server (InternalError): error executing command in container: container ${container} is waiting to start: ${pod.status}`, 1)
  }
  if (pod.status === 'Pending') {
    return err(`Error from server (BadRequest): container ${container} is in the waiting state\n提示：Pod 处于 Pending，无法执行命令（检查调度失败原因）。`, 1)
  }
  let args = cmdArgs
  if (args[0] === 'sh' && (args[1] === '-c' || args[1] === '-lc')) {
    args = args.slice(2).join(' ').split(/\s+/).filter(Boolean)
  }
  if (args.length === 0) return err('error: you must specify at least one command for the container', 1)
  const cmd = args[0]
  switch (cmd) {
    case 'echo':
      return ok(args.slice(1).join(' ') + '\n')
    case 'env':
      return ok(
        ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME=/root', `HOSTNAME=${pod.name}`, ...Object.entries(pod.env).map(([k, v]) => `${k}=${v}`)].join('\n') + '\n',
      )
    case 'whoami':
      return ok('root\n')
    case 'id':
      return ok('uid=0(root) gid=0(root) groups=0(root)\n')
    case 'pwd':
      return ok('/\n')
    case 'ls': {
      const dir = args[1] ?? '/'
      const prefix = dir.endsWith('/') ? dir : dir + '/'
      const names = Object.keys(pod.fs)
        .filter((f) => f.startsWith(prefix) && f.length > prefix.length)
        .map((f) => f.slice(prefix.length).split('/')[0])
      const uniq = [...new Set(names)].sort()
      return ok(uniq.join('\n') + (uniq.length ? '\n' : '') + (uniq.length ? '' : ''))
    }
    case 'cat': {
      const p = args[1]
      if (!p) return err('Usage: cat <file>', 1)
      if (pod.fs[p] !== undefined) return ok(pod.fs[p] + '\n')
      const key = Object.keys(pod.fs).find((f) => f.endsWith('/' + p))
      if (key) return ok(pod.fs[key] + '\n')
      return err(`cat: ${p}: No such file or directory`, 1)
    }
    case 'grep': {
      const pattern = args[1]
      const p = args[2]
      if (!pattern || !p) return err('Usage: grep <pattern> <file>', 1)
      const key = Object.keys(pod.fs).find((f) => f.endsWith('/' + p))
      const content = key !== undefined ? pod.fs[key] : undefined
      if (content === undefined) return err(`grep: ${p}: No such file or directory`, 1)
      const matches = content.split('\n').filter((l) => l.includes(pattern))
      return ok(matches.join('\n') + (matches.length ? '\n' : ''))
    }
    default:
      return err(`sh: ${cmd}: command not found\n提示：模拟器内 Pod 支持 echo / cat / env / ls / whoami / id / pwd / grep。`, 127)
  }
}

// ---------- 资源查找 ----------

type AnyK8sResource = { name: string; namespace?: string }

function findResourceByKind(state: SimState, kind: string, name: string, ns: string): AnyK8sResource | undefined {
  switch (kind) {
    case 'pods':
      return findPod(state, name, ns)
    case 'deployments':
      return state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
    case 'services':
      return state.k8s.services.find((s) => s.name === name && s.namespace === ns)
    case 'configmaps':
      return state.k8s.configmaps.find((c) => c.name === name && c.namespace === ns)
    case 'secrets':
      return state.k8s.secrets.find((c) => c.name === name && c.namespace === ns)
    case 'namespaces':
      return { name }
    case 'nodes':
      return state.k8s.nodes.find((n) => n.name === name)
    case 'jobs':
      return state.k8s.jobs.find((j) => j.name === name && j.namespace === ns)
    case 'cronjobs':
      return state.k8s.cronjobs.find((j) => j.name === name && j.namespace === ns)
    case 'persistentvolumes':
      return state.k8s.pvs.find((v) => v.name === name)
    case 'persistentvolumeclaims':
      return state.k8s.pvcs.find((c) => c.name === name && c.namespace === ns)
    default:
      return undefined
  }
}

function editResource(state: SimState, kind: string, name: string, ns: string, home: string): CommandResult {
  const res = findResourceByKind(state, kind, name, ns)
  if (!res) return err(`Error from server (NotFound): ${kind} "${name}" not found`, 1)
  const file = `${name}-edit.yaml`
  let yamlText: string
  switch (kind) {
    case 'pods':
      yamlText = podYaml(res as K8sPod)
      break
    case 'deployments':
      yamlText = deploymentYaml(state, res as K8sDeployment)
      break
    case 'services':
      yamlText = serviceYaml(res as never)
      break
    case 'configmaps':
      yamlText = configMapYaml(res as never)
      break
    case 'secrets':
      yamlText = secretYaml(res as never)
      break
    default:
      yamlText = podYaml(res as K8sPod)
  }
  const abs = normalizePath(state.cwd, file, home)
  let node: import('../types').FsNode = state.fsRoot
  const parts = abs.split('/').filter(Boolean)
  let created = false
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node.children) node.children = {}
    if (!node.children[parts[i]]) {
      node.children[parts[i]] = { kind: 'dir', name: parts[i], content: '', mode: 0o755, uid: 0, gid: 0, mtime: state.clock, children: {} }
      created = true
    }
    const next = node.children[parts[i]]
    if (!next || next.kind !== 'dir') return err('error: cannot edit resource: filesystem error', 1)
    node = next
  }
  if (!node.children) node.children = {}
  node.children[parts[parts.length - 1]] = {
    kind: 'file',
    name: parts[parts.length - 1],
    content: yamlText,
    mode: 0o644,
    uid: state.uid,
    gid: state.gids[0] ?? state.uid,
    mtime: state.clock,
  }
  return ok(
    `Edit cancelled, no changes made.\n\n模拟器说明：kubectl edit 在真实环境会打开编辑器；本模拟器中当前资源 YAML 已导出到 ~/${file}。\n请修改该文件后执行 kubectl apply -f ${file} 提交编辑。\n`,
  )
}

function registerKubectlCommands(): void {
  register('kubectl', (ctx) => {
    const state = ctx.state
    const sub = ctx.args[1]
    if (!sub) {
      return err(
        `kubectl controls the Kubernetes cluster manager.\n\nUsage:  kubectl [command]\n\nAvailable Commands:\n  version        Print the client and server version information\n  cluster-info   Display cluster info\n  config         Modify kubeconfig files\n  get            Display one or many resources\n  describe       Show details of a specific resource\n  logs           Print the logs for a container in a pod\n  exec           Execute a command in a container\n  create         Create a resource from a file or from stdin\n  apply          Apply a configuration to a resource by file name or stdin\n  edit           Edit a resource on the server\n  label          Update the labels on a resource\n  annotate       Update the annotations on a resource\n  expose         Expose a resource as a new Kubernetes Service\n  scale          Set a new size for a Deployment\n  set            Set specific features on objects\n  rollout        Manage the rollout of a resource\n  delete         Delete resources\n  top            Display Resource (CPU/Memory/Storage) usage\n  taint          Update the taints on one or more nodes\n\nUse "kubectl <command> --help" for more information about a given command.`,
        1,
      )
    }
    const args = ctx.args.slice(2)

    switch (sub) {
      case 'version': {
        const flags = parseCli(args, ['o'], [])
        if (flags.error) return flags.error
        if (flags.flags['o']?.[0] === 'yaml') {
          return ok('clientVersion:\n  gitVersion: v1.29.3\n  gitCommit: a145bcb1\n  gitTreeState: clean\n  goVersion: go1.21.5\nserverVersion:\n  gitVersion: v1.29.3\n  gitCommit: a145bcb1\n  gitTreeState: clean\n  goVersion: go1.21.5\n')
        }
        return ok(
          `Client Version: v1.29.3\nKustomize Version: v5.0.4-0.20230601165947-6ce0bf390ce3\nServer Version: v1.29.3\n`,
        )
      }
      case 'cluster-info':
        return ok(
          `Kubernetes control plane is running at https://127.0.0.1:6443\nCoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n\nTo further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.\n`,
        )
      case 'config': {
        const action = args[0]
        if (!action) return err('error: command is required, e.g. `kubectl config current-context`', 1)
        if (action === 'current-context') {
          return ok('kubernetes-admin@kubernetes\n')
        }
        if (action === 'get-contexts') {
          return ok(
            'CURRENT   NAME                          CLUSTER                      AUTHINFO                     NAMESPACE\n*         kubernetes-admin@kubernetes   kubernetes                   kubernetes-admin              default\n',
          )
        }
        if (action === 'use-context') {
          const name = args[1]
          if (!name) return err('error: a context name is required, e.g. `kubectl config use-context minikube`', 1)
          if (name !== 'kubernetes-admin@kubernetes' && name !== 'minikube') {
            return err(`error: no context exists with the name: "${name}"\n提示：可用 context：kubernetes-admin@kubernetes、minikube。`, 1)
          }
          return ok(`Switched to context "${name}".\n`)
        }
        if (action === 'view') {
          return ok(
            'apiVersion: v1\nclusters:\n- cluster:\n    certificate-authority-data: DATA+OMITTED\n    server: https://127.0.0.1:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: kubernetes-admin\n  name: kubernetes-admin@kubernetes\ncurrent-context: kubernetes-admin@kubernetes\nkind: Config\npreferences: {}\nusers:\n- name: kubernetes-admin\n  user:\n    client-certificate-data: REDACTED\n    client-key-data: REDACTED\n',
          )
        }
        return err(`error: unknown command "${action}" for "kubectl config"\n提示：支持 current-context / get-contexts / use-context / view`, 1)
      }
      case 'get': {
        const flags = parseCli(args, ['namespace', 'output', 'label', 'revision'], ['A', 'all-namespaces'], { n: 'namespace', o: 'output', l: 'label' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput) return err(`error: required resource not specified\nUse "kubectl get --help" for more information.\n提示：例如 kubectl get pods`, 1)
        const kind = resolveResourceType(kindInput)
        if (!kind) {
          return err(
            `error: the server doesn't have a resource type "${kindInput}"\n提示：支持 ${SUPPORTED_RESOURCES}`,
            1,
          )
        }
        const ns = namespaceOf(flags.flags)
        const allNs = allNamespaces(flags.flags)
        if (!allNs && !['namespaces', 'nodes', 'persistentvolumes'].includes(kind) && !ensureNamespace(state, ns)) {
          return err(`Error from server (NotFound): namespaces "${ns}" not found`, 1)
        }
        const out = flags.flags['output']?.[0]
        if (out && !['wide', 'yaml', 'name'].includes(out)) {
          return err(`error: unable to match a printer suitable for the output format "${out}"\n提示：模拟器支持 -o wide / -o yaml / -o name。`, 1)
        }
        if (!name && (out === 'yaml')) {
          return err('error: -o yaml requires a resource name, e.g. `kubectl get pod mypod -o yaml`', 1)
        }
        if (out === 'yaml') {
          const r = resourceYaml(state, kind, name!, ns)
          if (r) return r
          return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：支持 ${SUPPORTED_RESOURCES}`, 1)
        }
        const selector = flags.flags['label']?.[0]
        const lines = getTable(state, kind, ns, allNs, name, out === 'wide', selector)
        if (lines.length <= 1) {
          return ok(`No resources found${allNs ? '' : ` in ${ns} namespace`}.\n`)
        }
        return ok(lines.join('\n') + '\n')
      }
      case 'describe': {
        const flags = parseCli(args, ['namespace'], [], { n: 'namespace' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput || !name) {
          return err('error: a resource type and name are required, e.g. `kubectl describe pod mypod`', 1)
        }
        const kind = resolveResourceType(kindInput)
        if (!kind || kind === 'all') {
          return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：支持 ${SUPPORTED_RESOURCES}`, 1)
        }
        return describeResource(state, kind, name, namespaceOf(flags.flags))
      }
      case 'logs': {
        const flags = parseCli(args, ['namespace', 'container'], ['f', 'follow'], { n: 'namespace', c: 'container' })
        if (flags.error) return flags.error
        if (flags.flags['f']) {
          return err('error: unknown shorthand flag: \'f\' in -f\n提示：模拟器不支持实时跟随日志，请直接 kubectl logs <pod>。', 1)
        }
        const target = flags.pos[0]
        if (!target) return err('error: a pod name is required, e.g. `kubectl logs my-pod`', 1)
        let pod = findPod(state, target, namespaceOf(flags.flags))
        if (!pod && target.startsWith('deployment/')) {
          const depName = target.slice('deployment/'.length)
          const dep = state.k8s.deployments.find((d) => d.name === depName)
          if (dep) {
            const pods = deploymentPods(state, dep.name, dep.namespace)
            pod = pods[0]
          }
        }
        if (!pod) {
          return err(`Error from server (NotFound): pods "${target}" not found\n提示：先用 kubectl get pods 查看 Pod 名称。`, 1)
        }
        if (pod.status === 'CrashLoopBackOff' || pod.status === 'ImagePullBackOff') {
          return ok(
            pod.logs.join('\n') + '\n' + `\n提示：容器反复启动失败（${pod.status}）。可用 kubectl describe pod ${pod.name} 查看原因。\n`,
          )
        }
        if (pod.status === 'Pending') {
          return err(`Error from server (InternalError): pod ${pod.name} is in the pending state\n提示：Pod 还没被调度，先 kubectl describe pod ${pod.name} 看原因。`, 1)
        }
        return ok(pod.logs.join('\n') + '\n')
      }
      case 'exec': {
        const flags = parseCli(args, ['namespace', 'container'], ['i', 't', 'it'], { n: 'namespace', c: 'container' })
        if (flags.error) return flags.error
        const target = flags.pos[0]
        if (!target) return err('error: a pod name is required, e.g. `kubectl exec my-pod -- ls /`', 1)
        const pod = findPod(state, target, namespaceOf(flags.flags))
        if (!pod) return err(`Error from server (NotFound): pods "${target}" not found`, 1)
        return execInPod(state, pod, flags.pos.slice(1))
      }
      case 'create': {
        const flags = parseCli(args, ['namespace', 'image', 'replicas', 'from-literal', 'filename'], [], {
          n: 'namespace',
          i: 'image',
          r: 'replicas',
          f: 'filename',
        })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        let name = flags.pos[1]
        if (flags.flags['filename']) {
          const file = flags.flags['filename'][0]
          if (file === '-') {
            if (ctx.stdin === null) return err('error: no stdin given', 1)
            return applyYaml(state, ctx.stdin, 'STDIN')
          }
          const node = walk(ctx.state.fsRoot, normalizePath(ctx.state.cwd, file, ctx.state.env['HOME'] ?? '/home/student'))
          if (!node || node.kind !== 'file') return err(`error: the path "${file}" does not exist`, 1)
          return applyYaml(state, node.content, file)
        }
        if (!kindInput || !name) {
          return err(`error: must specify one of -f and -k; not both\nUsage: kubectl create DEPLOYMENT_NAME --image=IMAGE [--replicas=N]`, 1)
        }
        const ns = namespaceOf(flags.flags)
        if (!ensureNamespace(state, ns)) return err(`Error from server (NotFound): namespaces "${ns}" not found`, 1)
        if (kindInput === 'deployment') {
          const image = flags.flags['image']?.[0]
          if (!image) return err(`error: required flag(s) "image" not set\n提示：kubectl create deployment web --image=nginx`, 1)
          const replicasRaw = flags.flags['replicas']?.[0] ?? '1'
          const replicas = Number(replicasRaw)
          if (!Number.isInteger(replicas) || replicas < 0) {
            return err(`error: invalid argument "${replicasRaw}" for "--replicas" flag: strconv.Atoi: parsing "${replicasRaw}": invalid syntax`, 1)
          }
          const existing = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
          if (existing) return err(`Error from server (AlreadyExists): deployments.apps "${name}" already exists`, 1)
          const dep: K8sDeployment = {
            name,
            namespace: ns,
            replicas,
            available: 0,
            image,
            containerName: name,
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
          dep.revisions.push({ revision: 1, image, containerName: name, rsName: `${name}-${dep.podHash}`, created: state.clock })
          const error = addDeploymentWithSpec(state, dep)
          if (error) return err(error, 1)
          return ok(`deployment.apps/${name} created\n`)
        }
        if (kindInput === 'configmap') {
          const data: Record<string, string> = {}
          const literals = flags.flags['from-literal'] ?? []
          for (const lit of literals) {
            const eq = lit.indexOf('=')
            if (eq === -1) data[lit] = ''
            else data[lit.slice(0, eq)] = lit.slice(eq + 1)
          }
          if (state.k8s.configmaps.some((c) => c.name === name && c.namespace === ns)) {
            return err(`Error from server (AlreadyExists): configmaps "${name}" already exists`, 1)
          }
          state.k8s.configmaps.push({ name, namespace: ns, data, created: state.clock })
          return ok(`configmap/${name} created\n`)
        }
        if (kindInput === 'secret') {
          if (flags.pos[1] === 'generic') {
            name = flags.pos[2]
          }
          const data: Record<string, string> = {}
          const literals = flags.flags['from-literal'] ?? []
          for (const lit of literals) {
            const eq = lit.indexOf('=')
            if (eq === -1) data[lit] = encodeB64('')
            else data[lit.slice(0, eq)] = encodeB64(lit.slice(eq + 1))
          }
          if (state.k8s.secrets.some((c) => c.name === name && c.namespace === ns)) {
            return err(`Error from server (AlreadyExists): secrets "${name}" already exists`, 1)
          }
          state.k8s.secrets.push({ name, namespace: ns, type: 'Opaque', data, created: state.clock })
          return ok(`secret/${name} created\n`)
        }
        if (kindInput === 'namespace') {
          if (state.k8s.namespaces.includes(name)) {
            return err(`Error from server (AlreadyExists): namespaces "${name}" already exists`, 1)
          }
          state.k8s.namespaces.push(name)
          return ok(`namespace/${name} created\n`)
        }
        if (kindInput === 'job') {
          const image = flags.flags['image']?.[0]
          if (!image) return err(`error: required flag(s) "image" not set\n提示：kubectl create job hello --image=busybox`, 1)
          if (state.k8s.jobs.some((j) => j.name === name && j.namespace === ns)) {
            return err(`Error from server (AlreadyExists): jobs.batch "${name}" already exists`, 1)
          }
          state.k8s.jobs.push({ name, namespace: ns, image, completions: 1, status: 'Succeeded', created: state.clock, owner: null })
          const podName = `${name}-1-x8z7k`
          const specImg = knownImage(image)
          state.k8s.pods.push({
            name: podName,
            namespace: ns,
            status: 'Completed',
            ready: '0/1',
            restarts: 0,
            node: 'node-1',
            image,
            ip: nextPodIP(state),
            labels: { 'job-name': name },
            annotations: {},
            created: state.clock,
            logs: specImg ? [...specImg.logs, 'job executed successfully'] : ['job executed successfully'],
            owner: name,
            ownerKind: 'job',
            env: {},
            fs: {},
            resources: {},
            probes: {},
            nodeSelector: {},
            tolerations: [],
            pvcRefs: [],
            exitCode: 0,
            message: '',
          })
          pushEvent(state, 'Normal', 'SuccessfulCreate', `job/${name}`, `Created pod: ${podName}`)
          return ok(`job.batch/${name} created\n`)
        }
        return err(`error: unknown resource type "${kindInput}"\n提示：模拟器支持 create deployment / configmap / secret / namespace / job / -f`, 1)
      }
      case 'apply': {
        const flags = parseCli(args, ['filename', 'namespace'], [], { n: 'namespace', f: 'filename' })
        if (flags.error) return flags.error
        const file = flags.flags['filename']?.[0]
        if (!file) return err(`error: required flag(s) "filename" not set\n提示：kubectl apply -f deployment.yaml 或 kubectl apply -f - 读取标准输入`, 1)
        if (file === '-') {
          if (ctx.stdin === null) {
            return err(`error: no stdin given\n提示：可用 cat > file.yaml <<EOF 创建文件，再用 kubectl apply -f file.yaml。`, 1)
          }
          return applyYaml(state, ctx.stdin, 'STDIN')
        }
        const node = walk(ctx.state.fsRoot, normalizePath(ctx.state.cwd, file, ctx.state.env['HOME'] ?? '/home/student'))
        if (!node || node.kind !== 'file') {
          return err(`error: the path "${file}" does not exist\n提示：先创建 YAML 文件，例如 cat > ${file} <<EOF`, 1)
        }
        return applyYaml(state, node.content, file)
      }
      case 'edit': {
        const flags = parseCli(args, ['namespace'], [], { n: 'namespace' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput || !name) {
          return err('error: a resource type and name are required, e.g. `kubectl edit deployment web`', 1)
        }
        const kind = resolveResourceType(kindInput)
        if (!kind || !['pods', 'deployments', 'services', 'configmaps', 'secrets'].includes(kind)) {
          return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：模拟器支持 edit pod/deployment/service/configmap/secret`, 1)
        }
        return editResource(state, kind, name, namespaceOf(flags.flags), ctx.state.env['HOME'] ?? '/home/student')
      }
      case 'label':
      case 'annotate': {
        const flags = parseCli(args, ['namespace'], ['overwrite'], { n: 'namespace' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput || !name) {
          return err(`error: a resource type and name are required, e.g. \`kubectl ${sub} pod mypod app=web\``, 1)
        }
        const kind = resolveResourceType(kindInput)
        if (!kind) return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：支持 ${SUPPORTED_RESOURCES}`, 1)
        const res = findResourceByKind(state, kind, name, namespaceOf(flags.flags))
        if (!res) return err(`Error from server (NotFound): ${kind} "${name}" not found`, 1)
        const target = res as K8sPod
        const store = sub === 'label' ? target.labels : target.annotations
        const isPod = kind === 'pods'
        for (const kv of flags.pos.slice(2)) {
          const eq = kv.indexOf('=')
          if (eq === -1) {
            if (kv.endsWith('-')) {
              const key = kv.slice(0, -1)
              delete store[key]
            } else {
              return err(`error: invalid label format: "${kv}"\n提示：格式为 key=value 或 key-（删除）。`, 1)
            }
            continue
          }
          const key = kv.slice(0, eq)
          const value = kv.slice(eq + 1)
          if (key in store && !flags.flags['overwrite']) {
            return err(`Error from server (Conflict): ${kind} "${name}" not updated\n提示：标签已存在，需要 --overwrite 才能覆盖。`, 1)
          }
          store[key] = value
        }
        if (isPod && sub === 'label') pushEvent(state, 'Normal', 'Labeled', `pod/${name}`, 'Successfully labeled pod')
        const verb = sub === 'label' ? 'labeled' : 'annotated'
        return ok(`${kind}/${name} ${verb}\n`)
      }
      case 'expose': {
        const flags = parseCli(args, ['namespace', 'port', 'target-port', 'name', 'type'], [], {
          n: 'namespace',
          p: 'port',
          t: 'target-port',
          l: 'name',
          e: 'type',
        })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput || !name) {
          return err('error: a resource type and name are required, e.g. `kubectl expose deployment web --port=80`', 1)
        }
        if (kindInput !== 'deployment') {
          return err(`error: unknown resource type "${kindInput}"\n提示：模拟器支持 expose deployment`, 1)
        }
        const ns = namespaceOf(flags.flags)
        const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
        if (!dep) return err(`Error from server (NotFound): deployments.apps "${name}" not found\n提示：先 kubectl create deployment ${name} --image=nginx`, 1)
        const portRaw = flags.flags['port']?.[0]
        const port = portRaw === undefined ? 80 : Number(portRaw)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return err(`error: invalid argument "${portRaw}" for "--port" flag: invalid port`, 1)
        }
        const targetPortRaw = flags.flags['target-port']?.[0]
        const targetPort = targetPortRaw === undefined ? port : Number(targetPortRaw)
        const svcType = flags.flags['type']?.[0] ?? 'ClusterIP'
        if (!['ClusterIP', 'NodePort', 'LoadBalancer'].includes(svcType)) {
          return err(`error: unknown service type "${svcType}"\n提示：支持 ClusterIP / NodePort / LoadBalancer`, 1)
        }
        const svcName = flags.flags['name']?.[0] ?? name
        if (state.k8s.services.some((s) => s.name === svcName && s.namespace === ns)) {
          return err(`Error from server (AlreadyExists): services "${svcName}" already exists`, 1)
        }
        state.k8s.services.push({
          name: svcName,
          namespace: ns,
          type: svcType,
          clusterIP: nextClusterIP(state),
          ports: [{ port, targetPort, nodePort: svcType === 'NodePort' ? nextNodePort(state) : null }],
          selector: { app: name },
          created: state.clock,
        })
        pushEvent(state, 'Normal', 'CreatingLoadBalancer', `service/${svcName}`, 'Ensuring load balancer')
        return ok(`service/${svcName} exposed\n`)
      }
      case 'scale': {
        const flags = parseCli(args, ['namespace', 'replicas'], [], { n: 'namespace', r: 'replicas' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput || !name) {
          return err('error: a resource type and name are required, e.g. `kubectl scale deployment web --replicas=3`', 1)
        }
        const kind = resolveResourceType(kindInput)
        if (kind !== 'deployments') {
          return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：模拟器支持 scale deployment`, 1)
        }
        const replicasRaw = flags.flags['replicas']?.[0]
        if (replicasRaw === undefined) {
          return err('error: required flag(s) "replicas" not set\n提示：kubectl scale deployment web --replicas=3', 1)
        }
        const replicas = Number(replicasRaw)
        if (!Number.isInteger(replicas) || replicas < 0) {
          return err(`error: invalid argument "${replicasRaw}" for "--replicas" flag: strconv.Atoi: parsing "${replicasRaw}": invalid syntax`, 1)
        }
        const ns = namespaceOf(flags.flags)
        const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
        if (!dep) return err(`Error from server (NotFound): deployments.apps "${name}" not found`, 1)
        dep.replicas = replicas
        reconcileDeployment(state, dep)
        return ok(`deployment.apps/${name} scaled\n`)
      }
      case 'set': {
        const flags = parseCli(args, ['namespace'], [], { n: 'namespace' })
        if (flags.error) return flags.error
        const field = flags.pos[0]
        if (field !== 'image') {
          return err(`error: unknown set command "${field}"\n提示：模拟器支持 kubectl set image`, 1)
        }
        const target = flags.pos[1]
        const assignment = flags.pos[2]
        if (!target || !assignment) {
          return err('error: SET_IMAGE is required, e.g. `kubectl set image deployment/broken broken=nginx`', 1)
        }
        const slash = target.indexOf('/')
        const kindInput = slash === -1 ? target : target.slice(0, slash)
        const name = slash === -1 ? flags.pos[2] : target.slice(slash + 1)
        if (!name) return err('error: a resource name is required, e.g. `kubectl set image deployment/broken broken=nginx`', 1)
        const kind = resolveResourceType(kindInput)
        if (kind !== 'deployments') {
          return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：模拟器支持 set image deployment/<名称>`, 1)
        }
        const eq = assignment.indexOf('=')
        if (eq === -1) return err(`error: invalid assignment "${assignment}"\n提示：格式为 容器名=镜像，如 web=nginx`, 1)
        const containerName = assignment.slice(0, eq)
        const newImage = assignment.slice(eq + 1)
        const ns = namespaceOf(flags.flags)
        const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
        if (!dep) return err(`Error from server (NotFound): deployments.apps "${name}" not found`, 1)
        if (dep.containerName !== containerName) {
          return err(`error: container "${containerName}" not found in deployment "${name}"\n提示：该 Deployment 的容器名是 ${dep.containerName}`, 1)
        }
        bumpDeploymentRevision(state, dep, { image: newImage, containerName })
        return ok(`deployment.apps/${name} image updated\n`)
      }
      case 'rollout': {
        const flags = parseCli(args, ['namespace', 'revision', 'to-revision'], ['A'], { n: 'namespace' })
        if (flags.error) return flags.error
        const action = flags.pos[0]
        let kindInput = flags.pos[1]
        let name = flags.pos[2]
        if (kindInput && kindInput.includes('/') && !name) {
          const slash = kindInput.indexOf('/')
          const k = kindInput.slice(0, slash)
          const n = kindInput.slice(slash + 1)
          if (['deployment', 'deploy'].includes(k)) {
            kindInput = k
            name = n
          }
        }
        if (!action) return err('error: an action is required, e.g. `kubectl rollout status deployment web`', 1)
        if (!['status', 'history', 'undo', 'restart'].includes(action)) {
          return err(`error: unknown rollout action "${action}"\n提示：支持 kubectl rollout status|history|undo|restart deployment <名称>`, 1)
        }
        if (action === 'history' && !kindInput) {
          return err('error: a resource type is required, e.g. `kubectl rollout history deployment web`', 1)
        }
        const kind = resolveResourceType(kindInput ?? '')
        if (kind !== 'deployments' || !name) {
          return err('error: a deployment is required, e.g. `kubectl rollout status deployment web`', 1)
        }
        const ns = namespaceOf(flags.flags)
        const dep = state.k8s.deployments.find((d) => d.name === name && d.namespace === ns)
        if (!dep) return err(`Error from server (NotFound): deployments.apps "${name}" not found`, 1)
        if (action === 'restart') {
          bumpDeploymentRevision(state, dep, { restart: true })
          return ok(`deployment.apps/${name} restarted\n`)
        }
        if (action === 'history') {
          const revRaw = flags.flags['revision']?.[0]
          if (revRaw !== undefined) {
            const rev = Number(revRaw)
            const r = dep.revisions.find((x) => x.revision === rev)
            if (!r) return err(`error: the requested revision is not found`, 1)
            return ok(`deployment.apps/${name} with revision #${rev} on ${isoTime(r.created)}:\n  pod-template-hash: ${r.rsName.split('-').pop()}\n  image: ${r.image}\n`)
          }
          const lines = [`REVISION  CHANGE-CAUSE`, ...dep.revisions.map((r) => `${String(r.revision).padEnd(9)}<none>`)]
          return ok(`deployment.apps/${name}\n` + lines.join('\n') + '\n')
        }
        if (action === 'undo') {
          const toRevRaw = flags.flags['to-revision']?.[0]
          if (toRevRaw !== undefined) {
            const rev = Number(toRevRaw)
            if (!Number.isInteger(rev) || rev < 1) {
              return err(`error: invalid argument "${toRevRaw}" for "--to-revision" flag: strconv.Atoi: parsing "${toRevRaw}": invalid syntax`, 1)
            }
            const target = dep.revisions.find((r) => r.revision === rev)
            if (!target) return err(`error: the requested revision is not found`)
            bumpDeploymentRevision(state, dep, { image: target.image, containerName: target.containerName })
            return ok(`deployment.apps/${name} rolled back\n`)
          }
          if (dep.revisions.length < 2) {
            return err(`error: no rollout history found for deployment "${name}"\n提示：只有一次部署历史，无法回滚。`, 1)
          }
          const prev = dep.revisions[dep.revisions.length - 2]
          bumpDeploymentRevision(state, dep, { image: prev.image, containerName: prev.containerName })
          return ok(`deployment.apps/${name} rolled back\n`)
        }
        const pods = deploymentPods(state, dep.name, dep.namespace)
        const bad = pods.find((p) => p.status !== 'Running' || p.ready !== '1/1')
        if (bad) {
          const wait = `Waiting for deployment "${name}" rollout to finish: ${dep.available} out of ${dep.replicas} new replicas have been updated...`
          return err(
            `${wait}\nError: timed out waiting for the condition\n提示：Pod 处于 ${bad.status}（${bad.message || '未就绪'}），检查 kubectl logs 和 kubectl describe pod，确认镜像或配置是否有问题。`,
            1,
          )
        }
        return ok(`deployment "${name}" successfully rolled out\n`)
      }
      case 'delete': {
        const flags = parseCli(args, ['namespace'], ['A', 'all', 'force'], { n: 'namespace' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const name = flags.pos[1]
        if (!kindInput) return err('error: a resource type is required, e.g. `kubectl delete deployment web`', 1)
        const kind = resolveResourceType(kindInput)
        if (!kind || kind === 'all' || kind === 'namespaces' || kind === 'nodes') {
          if (kind === 'namespaces' && name) {
            if (state.k8s.namespaces.includes(name)) {
              if (name.startsWith('kube-') || name === 'default') {
                return err(`Error from server (Forbidden): namespaces "${name}" is forbidden to delete\n提示：系统命名空间不可删除。`, 1)
              }
              state.k8s.namespaces = state.k8s.namespaces.filter((n) => n !== name)
              state.k8s.pods = state.k8s.pods.filter((p) => p.namespace !== name)
              state.k8s.deployments = state.k8s.deployments.filter((d) => d.namespace !== name)
              state.k8s.services = state.k8s.services.filter((s) => s.namespace !== name)
              state.k8s.configmaps = state.k8s.configmaps.filter((c) => c.namespace !== name)
              state.k8s.secrets = state.k8s.secrets.filter((c) => c.namespace !== name)
              state.k8s.jobs = state.k8s.jobs.filter((j) => j.namespace !== name)
              state.k8s.cronjobs = state.k8s.cronjobs.filter((j) => j.namespace !== name)
              state.k8s.pvcs = state.k8s.pvcs.filter((c) => c.namespace !== name)
              return ok(`namespace "${name}" deleted\n`)
            }
            return err(`Error from server (NotFound): namespaces "${name}" not found`, 1)
          }
          return err(`error: the server doesn't have a resource type "${kindInput}"\n提示：支持 delete pod/deployment/service/configmap/secret/namespace/job/cronjob/pvc/pv`, 1)
        }
        const ns = namespaceOf(flags.flags)
        if (kind === 'pods') {
          const idx = state.k8s.pods.findIndex((p) => p.name === name && p.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): pods "${name}" not found`, 1)
          state.k8s.pods.splice(idx, 1)
          return ok(`pod "${name}" deleted\n`)
        }
        if (kind === 'deployments') {
          const idx = state.k8s.deployments.findIndex((d) => d.name === name && d.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): deployments.apps "${name}" not found`, 1)
          const owned = deploymentPods(state, name, ns)
          state.k8s.pods = state.k8s.pods.filter((p) => !owned.includes(p))
          state.k8s.deployments.splice(idx, 1)
          return ok(`deployment.apps "${name}" deleted\n`)
        }
        if (kind === 'services') {
          const idx = state.k8s.services.findIndex((s) => s.name === name && s.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): services "${name}" not found`, 1)
          state.k8s.services.splice(idx, 1)
          return ok(`service "${name}" deleted\n`)
        }
        if (kind === 'configmaps') {
          const idx = state.k8s.configmaps.findIndex((c) => c.name === name && c.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): configmaps "${name}" not found`, 1)
          state.k8s.configmaps.splice(idx, 1)
          return ok(`configmap "${name}" deleted\n`)
        }
        if (kind === 'secrets') {
          const idx = state.k8s.secrets.findIndex((c) => c.name === name && c.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): secrets "${name}" not found`, 1)
          state.k8s.secrets.splice(idx, 1)
          return ok(`secret "${name}" deleted\n`)
        }
        if (kind === 'jobs') {
          const idx = state.k8s.jobs.findIndex((j) => j.name === name && j.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): jobs.batch "${name}" not found`, 1)
          for (const p of jobPods(state, name, ns)) {
            state.k8s.pods = state.k8s.pods.filter((x) => x !== p)
          }
          state.k8s.jobs.splice(idx, 1)
          return ok(`job.batch "${name}" deleted\n`)
        }
        if (kind === 'cronjobs') {
          const idx = state.k8s.cronjobs.findIndex((j) => j.name === name && j.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): cronjobs.batch "${name}" not found`, 1)
          state.k8s.cronjobs.splice(idx, 1)
          return ok(`cronjob.batch "${name}" deleted\n`)
        }
        if (kind === 'persistentvolumeclaims') {
          const idx = state.k8s.pvcs.findIndex((c) => c.name === name && c.namespace === ns)
          if (idx === -1) return err(`Error from server (NotFound): persistentvolumeclaims "${name}" not found`, 1)
          const pvc = state.k8s.pvcs[idx]
          if (pvc.volumeName) {
            const pv = state.k8s.pvs.find((v) => v.name === pvc.volumeName)
            if (pv) {
              pv.status = 'Released'
              pv.claimRef = null
            }
          }
          state.k8s.pvcs.splice(idx, 1)
          return ok(`persistentvolumeclaim "${name}" deleted\n`)
        }
        if (kind === 'persistentvolumes') {
          const idx = state.k8s.pvs.findIndex((v) => v.name === name)
          if (idx === -1) return err(`Error from server (NotFound): persistentvolumes "${name}" not found`, 1)
          state.k8s.pvs.splice(idx, 1)
          return ok(`persistentvolume "${name}" deleted\n`)
        }
        return err(`error: unsupported resource "${kind}"`, 1)
      }
      case 'top': {
        const flags = parseCli(args, ['namespace'], [], { n: 'namespace' })
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        if (kindInput === 'nodes') {
          const lines = ['NAME     CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%']
          for (const n of state.k8s.nodes) {
            const podCpu = state.k8s.pods.filter((p) => p.node === n.name && p.status === 'Running').reduce((s, p) => s + podCpuRequest(p) + parseCpuToCores('50m'), 0)
            const podMem = state.k8s.pods.filter((p) => p.node === n.name && p.status === 'Running').reduce((s, p) => s + podMemRequestMi(p) + 64, 0)
            const cpu = Math.round(n.cpuUsed * 1000) + Math.round(podCpu * 1000)
            const cpuPct = Math.round((cpu / (n.cpuCapacity * 1000)) * 100)
            const mem = n.memUsedMi + podMem
            const memPct = Math.round((mem / n.memCapacityMi) * 100)
            lines.push(`${n.name.padEnd(9)}${String(cpu).padEnd(11)}${String(cpuPct).padEnd(6)}${String(mem * 1024).padEnd(15)}${String(memPct).padEnd(5)}`)
          }
          return ok(lines.join('\n') + '\n')
        }
        if (kindInput === 'pods') {
          const ns = namespaceOf(flags.flags)
          const pods = state.k8s.pods.filter((p) => p.namespace === ns && p.status === 'Running')
          const lines = ['NAME                                CPU(cores)   MEMORY(bytes)']
          for (const p of pods) {
            const cpu = Math.max(1, Math.round(podCpuRequest(p) * 1000) + (knownImage(p.image) ? 50 : 0))
            const mem = (podMemRequestMi(p) || (knownImage(p.image) ? knownImage(p.image)!.memUsageMi : 128)) * 1024
            lines.push(`${p.name.padEnd(36)}${String(cpu).padEnd(12)}${String(mem)}`)
          }
          if (pods.length === 0) return ok(`No resources found\n`)
          return ok(lines.join('\n') + '\n')
        }
        return err(`error: unknown resource type "${kindInput}"\n提示：支持 kubectl top nodes / kubectl top pods`, 1)
      }
      case 'taint': {
        const flags = parseCli(args, [], [])
        if (flags.error) return flags.error
        const kindInput = flags.pos[0]
        const nodeName = flags.pos[1]
        const taintArg = flags.pos[2]
        if (kindInput !== 'nodes' && kindInput !== 'node' && kindInput !== 'no') {
          return err(`error: unknown resource type "${kindInput}"\n提示：支持 kubectl taint nodes <节点名> <key=value:Effect>`, 1)
        }
        if (!nodeName || !taintArg) {
          return err('error: a node and taint are required, e.g. `kubectl taint nodes node-2 gpu=true:NoSchedule`', 1)
        }
        const node = state.k8s.nodes.find((n) => n.name === nodeName)
        if (!node) return err(`Error from server (NotFound): nodes "${nodeName}" not found`, 1)
        if (taintArg.endsWith('-')) {
          const spec = taintArg.slice(0, -1)
          const eq = spec.indexOf('=')
          const key = eq === -1 ? spec : spec.slice(0, eq)
          const effect = eq === -1 ? undefined : spec.split(':').pop()
          node.taints = node.taints.filter((t) => t.key !== key || (effect !== undefined && t.effect !== effect))
          return ok(`node/${nodeName} untainted\n`)
        }
        const eq = taintArg.indexOf('=')
        const colon = taintArg.lastIndexOf(':')
        if (eq === -1 || colon === -1) {
          return err(`error: invalid taint spec "${taintArg}"\n提示：格式为 key=value:Effect（Effect 为 NoSchedule / NoExecute / PreferNoSchedule）。`, 1)
        }
        const key = taintArg.slice(0, eq)
        const value = taintArg.slice(eq + 1, colon)
        const effect = taintArg.slice(colon + 1)
        if (!['NoSchedule', 'NoExecute', 'PreferNoSchedule'].includes(effect)) {
          return err(`error: invalid effect "${effect}"\n提示：支持 NoSchedule / NoExecute / PreferNoSchedule。`, 1)
        }
        if (node.taints.some((t) => t.key === key && t.effect === effect)) {
          return err(`Error from server (Conflict): node "${nodeName}" already has the taint "${key}=${value}:${effect}"`, 1)
        }
        node.taints.push({ key, value, effect })
        pushEvent(state, 'Normal', 'TaintManager', `node/${nodeName}`, `Created taint ${key}=${value}:${effect}`)
        return ok(`node/${nodeName} tainted\n`)
      }
      default:
        return err(
          `error: unknown command "${sub}" for "kubectl"\nRun 'kubectl --help' for usage.\n提示：支持 version cluster-info config get describe logs exec create apply edit label annotate expose scale set rollout delete top taint`,
          1,
        )
    }
  })
}

export function installKubectlCommands(): void {
  registerKubectlCommands()
}
