import type { FsNode, SimState } from '../types'
import { canRead, canWrite } from '../vfs/access'
import { walk } from '../vfs/paths'

export interface ServiceDef {
  name: string
  description: string
  execPath: string
  port: number | null
  logPath: string | null
  readyCheck: (s: SimState) => { ready: boolean; reason: string }
  page: string
}

function logFileWritableBy(s: SimState, absPath: string): { ready: boolean; reason: string } {
  const node = walk(s.fsRoot, absPath)
  if (!node || node.kind !== 'file') return { ready: false, reason: `cannot open log file ${absPath}: No such file or directory` }
  if (!canWrite(node, s.uid, s.gids) || !canRead(node, s.uid, s.gids)) {
    return { ready: false, reason: `cannot open log file ${absPath}: Permission denied` }
  }
  return { ready: true, reason: '' }
}

export const SERVICE_DEFS: Record<string, ServiceDef> = {
  webapp: {
    name: 'webapp',
    description: 'CmdLab web application server',
    execPath: '/opt/webapp/app',
    port: 8080,
    logPath: '/var/log/webapp/app.log',
    readyCheck: (s) => logFileWritableBy(s, '/var/log/webapp/app.log'),
    page:
      '<!DOCTYPE html>\n<html>\n<head><title>CmdLab Web App</title></head>\n<body>\n<h1>CmdLab Web App</h1>\n<p>Service is up and healthy.</p>\n</body>\n</html>\n',
  },
  nginx: {
    name: 'nginx',
    description: 'A high performance web server and a reverse proxy server',
    execPath: '/usr/sbin/nginx',
    port: 80,
    logPath: null,
    readyCheck: () => ({ ready: true, reason: '' }),
    page:
      '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>It works.</p>\n</body>\n</html>\n',
  },
}

export function serviceNames(): string[] {
  return Object.keys(SERVICE_DEFS).sort()
}

export function activePorts(state: SimState): { port: number; name: string }[] {
  const ports: { port: number; name: string }[] = []
  for (const svc of state.services) {
    const def = SERVICE_DEFS[svc.name]
    if (svc.status === 'active' && def && def.port !== null) {
      ports.push({ port: def.port, name: svc.name })
    }
  }
  return ports
}

export function findServiceEntry(state: SimState, name: string) {
  return state.services.find((s) => s.name === name)
}

export function addService(state: SimState, name: string, status: 'active' | 'inactive' | 'failed', log: string[]): void {
  if (state.services.some((s) => s.name === name)) return
  state.services.push({ name, status, pid: null, startTime: null, log })
}

export function servicePid(state: SimState, name: string): number {
  void state
  const base: Record<string, number> = { webapp: 3100, nginx: 3200 }
  return (base[name] ?? 3300) + name.length
}

export function collectFileList(node: FsNode, prefix: string, out: { path: string; content: string; mode: number; uid: number; gid: number }[]): void {
  for (const name of Object.keys(node.children ?? {}).sort()) {
    const child = node.children![name]
    const path = prefix + '/' + name
    if (child.kind === 'dir') collectFileList(child, path, out)
    else out.push({ path, content: child.content, mode: child.mode, uid: child.uid, gid: child.gid })
  }
}
