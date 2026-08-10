import type {
  DockerContainer,
  DockerImage,
  DockerNetwork,
  DockerState,
  DockerVolume,
  FsNode,
  SimState,
} from '../types'
import { UID_ROOT, UID_STUDENT } from '../vfs/access'
import { getParent, walk } from '../vfs/paths'

export interface ImageSpec {
  id: string
  size: string
  command: string
  bootLogs: string[]
  files: [string, string, number?][]
  env?: Record<string, string>
  cmd?: string[]
  workdir?: string
  exposedPorts?: number[]
  healthcheck?: string | null
}

export const IMAGE_CATALOG: Record<string, ImageSpec> = {
  nginx: {
    id: 'f7a6a03d20e1',
    size: '187MB',
    command: 'nginx -g "daemon off;"',
    bootLogs: [
      '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
      '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/',
      '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh',
      '/docker-entrypoint.sh: Configuration complete; ready for start up',
      '2026/08/01 08:00:00 [notice] 1#1: start worker processes',
      '2026/08/01 08:00:00 [notice] 1#1: start worker process 12',
    ],
    files: [
      ['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n'],
      ['/etc/nginx/nginx.conf', 'user  nginx;\nworker_processes  auto;\nevents { worker_connections 1024; }\nhttp {\n    server {\n        listen       80;\n        server_name  localhost;\n        location / { root /usr/share/nginx/html; index index.html; }\n    }\n}\n'],
      ['/etc/nginx/conf.d/default.conf', 'server {\n    listen       80;\n    server_name  localhost;\n    location / { root /usr/share/nginx/html; index index.html; }\n}\n'],
      ['/usr/share/nginx/html/index.html', '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is working.</p>\n</body>\n</html>\n'],
    ],
    exposedPorts: [80],
  },
  alpine: {
    id: 'a8ca24154ec1',
    size: '7.34MB',
    command: '/bin/sh',
    bootLogs: ['Welcome to Alpine Linux 3.19.1 (v20240315-bf7fdd4513)\nKernel: 6.1.0-cmdlab on an x86_64 (1 CPUs)'],
    files: [
      ['/etc/os-release', 'PRETTY_NAME="Alpine Linux v3.19"\nID=alpine\nVERSION_ID=3.19.1\n'],
      ['/etc/alpine-release', '3.19.1\n'],
    ],
  },
  ubuntu: {
    id: 'b6f507652425',
    size: '77.8MB',
    command: '/bin/bash',
    bootLogs: [],
    files: [['/etc/os-release', 'PRETTY_NAME="Ubuntu 22.04.4 LTS"\nID=ubuntu\nVERSION_ID="22.04"\n']],
  },
  busybox: {
    id: 'c1dc91c16ada',
    size: '2.45MB',
    command: '/bin/sh',
    bootLogs: [],
    files: [['/etc/os-release', 'PRETTY_NAME="Buildroot 2023.02"\nID=buildroot\n']],
  },
  redis: {
    id: '9e8b8e63f8cd',
    size: '117MB',
    command: 'docker-entrypoint.sh redis-server',
    bootLogs: [
      '1:C 01 Aug 2026 08:00:00.000 # oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo',
      '1:C 01 Aug 2026 08:00:00.000 # Configuration loaded',
      '1:M 01 Aug 2026 08:00:00.001 * Ready to accept connections tcp',
    ],
    files: [['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n']],
    exposedPorts: [6379],
  },
  httpd: {
    id: '2c202f521d99',
    size: '145MB',
    command: 'httpd-foreground',
    bootLogs: ['AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name', 'AH00094: Command line: \'httpd -D FOREGROUND\''],
    files: [['/usr/local/apache2/htdocs/index.html', '<!DOCTYPE html>\n<html><body><h1>It works!</h1></body></html>\n']],
    exposedPorts: [80],
  },
  python: {
    id: '5d1f5f6b8e2a',
    size: '940MB',
    command: 'python3',
    bootLogs: ['Python 3.11.9 (main, Apr 10 2026, 13:33:27) [GCC 12.2.0] on linux'],
    files: [['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n']],
  },
  node: {
    id: '4c2f7e3a1d5b',
    size: '1.1GB',
    command: 'docker-entrypoint.sh node',
    bootLogs: ['Node.js v18.19.1'],
    files: [
      ['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n'],
      ['/usr/local/bin/node', '', 0o755],
      ['/usr/local/lib/node_modules/npm/bin/npm-cli.js', '#!/usr/bin/env node\n', 0o755],
    ],
    cmd: ['node'],
    workdir: '/',
    exposedPorts: [],
  },
  mysql: {
    id: 'a1b2c3d4e5f6',
    size: '592MB',
    command: 'docker-entrypoint.sh mysqld',
    bootLogs: [
      '2026-08-01T08:00:00.000000Z 0 [System] [MY-010116] [Server] /usr/sbin/mysqld (mysqld 8.0.36) starting as process 1',
      '2026-08-01T08:00:02.123456Z 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections.',
    ],
    files: [['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n']],
    env: { MYSQL_ROOT_PASSWORD: '' },
    exposedPorts: [3306],
  },
  postgres: {
    id: 'd3e4f5a6b7c8',
    size: '432MB',
    command: 'docker-entrypoint.sh postgres',
    bootLogs: [
      '2026-08-01 08:00:00.000 UTC [1] LOG:  starting PostgreSQL 16.2 (Debian 16.2-1.pgdg120+2)',
      '2026-08-01 08:00:00.500 UTC [1] LOG:  database system is ready to accept connections',
    ],
    files: [
      ['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n'],
      ['/usr/local/bin/postgres', '', 0o755],
      ['/var/lib/postgresql/data/init-done', ''],
    ],
    env: { POSTGRES_PASSWORD: '', POSTGRES_DB: '' },
    exposedPorts: [5432],
  },
  web: {
    id: '6f7a8b9c0d1e',
    size: '98MB',
    command: 'nginx -g "daemon off;"',
    bootLogs: [
      '/docker-entrypoint.sh: Configuration complete; ready for start up',
      '2026/08/01 08:00:00 [notice] 1#1: start worker process 7',
    ],
    files: [
      ['/etc/nginx/nginx.conf', 'user  nginx;\nworker_processes  auto;\nevents { worker_connections 1024; }\nhttp {\n    server {\n        listen       80;\n        server_name  localhost;\n        location / { proxy_pass http://api:3000; proxy_set_header Host $host; }\n        location /static/ { root /usr/share/nginx/html; }\n    }\n}\n'],
      ['/usr/share/nginx/html/index.html', '<!DOCTYPE html>\n<html>\n<head><title>CmdLab Web</title></head>\n<body>\n<h1>CmdLab 三层应用</h1>\n<p>Web 服务已启动，通过 nginx 反向代理访问 API。</p>\n</body>\n</html>\n'],
    ],
    exposedPorts: [80],
  },
  api: {
    id: '0e1f2a3b4c5d',
    size: '1.05GB',
    command: 'node app.js',
    bootLogs: [
      'api starting on port 3000',
      'connecting to database at ${DB_HOST:-localhost}:${DB_PORT:-5432}',
      'node: internal/modules/cjs/loader:1 Error: Cannot find module /app/app.js',
    ],
    files: [
      ['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n'],
      ['/usr/local/bin/node', '', 0o755],
      ['/app/package.json', '{\n  "name": "api",\n  "version": "1.0.0",\n  "scripts": { "start": "node app.js" }\n}\n'],
      ['/app/app.js', 'const http = require("http");\nconst dbHost = process.env.DB_HOST || "localhost";\nconst dbPort = process.env.DB_PORT || "5432";\nconsole.log(`api starting on port 3000`);\nconsole.log(`connecting to database at ${dbHost}:${dbPort}`);\nhttp.createServer((req, res) => {\n  res.writeHead(200, {"Content-Type": "application/json"});\n  res.end(JSON.stringify({ status: "ok", service: "api", db: dbHost + ":" + dbPort }));\n}).listen(3000);\n'],
    ],
    env: { DB_HOST: '', DB_PORT: '' },
    cmd: ['node', 'app.js'],
    workdir: '/app',
    exposedPorts: [3000],
  },
  'api-broken': {
    id: '5e6f7a8b9c0d',
    size: '1.05GB',
    command: 'node app.js',
    bootLogs: [
      'api starting on port 3000',
      'connecting to database at wronghost:5432',
      'ERROR: getaddrinfo ENOTFOUND wronghost',
      'api crashed: could not connect to database',
      'supervisor: restarting api (attempt 1/5)',
    ],
    files: [
      ['/etc/os-release', 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n'],
      ['/usr/local/bin/node', '', 0o755],
      ['/app/package.json', '{\n  "name": "api",\n  "version": "1.0.0"\n}\n'],
      ['/app/app.js', 'const http = require("http");\nconst dbHost = process.env.DB_HOST || "wronghost";\nconsole.log(`connecting to database at ${dbHost}:5432`);\nhttp.createServer((req, res) => {\n  res.writeHead(200, {"Content-Type": "application/json"});\n  res.end(JSON.stringify({ status: "degraded", service: "api" }));\n}).listen(3000);\n'],
    ],
    env: { DB_HOST: 'wronghost', DB_PORT: '5432' },
    cmd: ['node', 'app.js'],
    workdir: '/app',
    exposedPorts: [3000],
  },
}

export function cloneNode(node: FsNode, name?: string): FsNode {
  const copy: FsNode = { ...node, name: name ?? node.name }
  if (node.children) {
    const children: Record<string, FsNode> = {}
    for (const k of Object.keys(node.children)) {
      children[k] = cloneNode(node.children[k], k)
    }
    copy.children = children
  }
  return copy
}

function ensureImageDir(root: FsNode, abs: string): FsNode | null {
  const parts = abs.split('/').filter(Boolean)
  let node: FsNode = root
  for (const seg of parts) {
    if (!node.children) return null
    let child = node.children[seg]
    if (!child) {
      child = { kind: 'dir', name: seg, content: '', mode: 0o755, uid: UID_ROOT, gid: UID_ROOT, mtime: 0, children: {} }
      node.children[seg] = child
    }
    if (child.kind !== 'dir') return null
    node = child
  }
  return node
}

export function buildImageFs(spec: ImageSpec): FsNode {
  const root: FsNode = { kind: 'dir', name: '', content: '', mode: 0o755, uid: UID_ROOT, gid: UID_ROOT, mtime: 0, children: {} }
  for (const [path, content, mode] of spec.files) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    const parentAbs = path.slice(0, path.lastIndexOf('/')) || '/'
    const dir = ensureImageDir(root, parentAbs)
    if (!dir || !dir.children) continue
    dir.children[name] = {
      kind: 'file',
      name,
      content,
      mode: mode ?? 0o644,
      uid: UID_ROOT,
      gid: UID_ROOT,
      mtime: 0,
    }
  }
  return root
}

export function buildImageFsByRepo(repo: string): FsNode {
  const spec = IMAGE_CATALOG[repo]
  return spec ? buildImageFs(spec) : { kind: 'dir', name: '', content: '', mode: 0o755, uid: UID_ROOT, gid: UID_ROOT, mtime: 0, children: {} }
}

export const AUTO_NAMES = [
  'vibrant_wozniak',
  'priceless_hoover',
  'nostalgic_hermann',
  'admiring_pasteur',
  'clever_galileo',
  'agitated_shirley',
  'focused_babbage',
  'serene_swirles',
  'heuristic_aryabhata',
  'eager_blackwell',
]

export function containerId(seq: number): string {
  return (0x9f1e2d3c + seq * 0x17b).toString(16).padStart(12, '0')
}

export function imageId(repo: string, tag: string): string {
  let h = 0x811c9dc5
  const s = repo + ':' + tag
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 0x01000193 >>> 0
  return h.toString(16).padStart(12, '0').slice(0, 12)
}

export function networkId(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(12, '0').slice(0, 12)
}

function catalogImage(repo: string, tag: string, created: number): DockerImage {
  const spec = IMAGE_CATALOG[repo]
  return {
    id: spec ? spec.id : imageId(repo, tag),
    repository: repo,
    tag,
    size: spec?.size ?? '50MB',
    created,
    fsRoot: spec ? buildImageFs(spec) : buildImageFsByRepo(repo),
    env: { ...(spec?.env ?? {}) },
    cmd: spec?.cmd ?? (spec ? null : null),
    workdir: spec?.workdir ?? null,
    exposedPorts: spec?.exposedPorts ?? [],
    history: [],
    healthcheck: spec?.healthcheck ?? null,
  }
}

export function buildDockerState(): DockerState {
  const images: DockerImage[] = [
    catalogImage('nginx', 'latest', -14 * 24 * 60),
    catalogImage('alpine', 'latest', -28 * 24 * 60),
    catalogImage('node', '16-alpine', -20 * 24 * 60),
    catalogImage('postgres', '15', -10 * 24 * 60),
    catalogImage('web', 'latest', -7 * 24 * 60),
    catalogImage('api', 'latest', -7 * 24 * 60),
    catalogImage('api-broken', 'latest', -7 * 24 * 60),
  ]
  const networks: DockerNetwork[] = [
    { id: networkId('bridge'), name: 'bridge', driver: 'bridge', scope: 'local', subnet: '172.17.0.0/16' },
    { id: networkId('host'), name: 'host', driver: 'host', scope: 'local', subnet: null },
    { id: networkId('none'), name: 'none', driver: 'null', scope: 'local', subnet: null },
  ]
  const volumes: DockerVolume[] = [
    { name: 'lab-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/lab-data/_data', tree: null },
    { name: 'postgres-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/postgres-data/_data', tree: null },
  ]
  return { images, containers: [], networks, volumes, seq: 1 }
}

export function normalizeDockerState(state: SimState): void {
  for (const img of state.docker.images) {
    img.fsRoot = img.fsRoot ?? buildImageFsByRepo(img.repository)
    img.env = img.env ?? {}
    img.cmd = img.cmd ?? null
    img.workdir = img.workdir ?? null
    img.exposedPorts = img.exposedPorts ?? []
    img.history = img.history ?? []
    img.healthcheck = img.healthcheck ?? null
  }
  for (const ctr of state.docker.containers) {
    if (!ctr.fsRoot) {
      const img = state.docker.images.find((i) => i.id === ctr.imageId)
      ctr.fsRoot = img ? cloneNode(img.fsRoot) : buildImageFsByRepo(ctr.image.split(':')[0])
    }
    ctr.env = ctr.env ?? {}
    ctr.health = ctr.health ?? 'none'
    ctr.healthcheck = ctr.healthcheck ?? null
    ctr.limits = ctr.limits ?? {}
    ctr.ip = ctr.ip ?? null
    ctr.workdir = ctr.workdir ?? null
    ctr.exposedPorts = ctr.exposedPorts ?? []
  }
  for (const v of state.docker.volumes) {
    v.tree = v.tree ?? null
  }
  for (const n of state.docker.networks) {
    n.subnet = n.subnet ?? null
  }
}

export function findContainer(state: DockerState, nameOrId: string): DockerContainer | undefined {
  const exact = state.containers.find((c) => c.name === nameOrId || c.id === nameOrId)
  if (exact) return exact
  return state.containers.find((c) => c.id.startsWith(nameOrId) || c.name.startsWith(nameOrId))
}

export function findImage(state: DockerState, repo: string, tag: string): DockerImage | undefined {
  return state.images.find((i) => i.repository === repo && i.tag === tag)
}

export function pushEvent(state: DockerState, event: string): void {
  void state
  void event
}

export function dockerAge(now: number, tick: number): string {
  const m = now - tick
  if (m <= 0) return '12 seconds ago'
  return `${m} minute${m === 1 ? '' : 's'} ago`
}

export function dockerUp(now: number, startTick: number): string {
  const m = now - startTick
  if (m <= 0) return '12 seconds'
  return `${m} minute${m === 1 ? '' : 's'}`
}

export function containerIP(state: DockerState, ctr: DockerContainer): string {
  const netIdx = Math.max(0, state.networks.findIndex((n) => n.name === ctr.network))
  const idx = state.containers.indexOf(ctr) + 2
  return `172.${17 + netIdx}.0.${idx}`
}
