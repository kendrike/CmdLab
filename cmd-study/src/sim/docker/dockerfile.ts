import type { CommandResult, FsNode, SimState } from '../types'
import { err, ok } from '../shell/registry'
import { parseInput } from '../shell/lexer'
import { runPipeline } from '../shell/executor'
import { getParent, normalizePath, walk } from '../vfs/paths'
import { cloneNode, findImage, imageId } from './state'

export interface DockerfileParseError {
  line: number
  message: string
}

export type DockerfileInstruction =
  | { type: 'FROM'; image: string; tag: string }
  | { type: 'WORKDIR'; path: string }
  | { type: 'COPY'; src: string; dest: string }
  | { type: 'RUN'; command: string }
  | { type: 'EXPOSE'; ports: number[] }
  | { type: 'CMD'; args: string[] }
  | { type: 'ENV'; key: string; value: string }
  | { type: 'HEALTHCHECK'; command: string; port: number | null }
  | { type: 'COMMENT' }
  | { type: 'BLANK' }

export function parseDockerfile(content: string): { instructions: DockerfileInstruction[]; error?: DockerfileParseError } {
  const instructions: DockerfileInstruction[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trimEnd()
    const lineNo = i + 1
    const trimmed = raw.trim()
    if (trimmed === '') {
      instructions.push({ type: 'BLANK' })
      continue
    }
    if (trimmed.startsWith('#')) {
      instructions.push({ type: 'COMMENT' })
      continue
    }
    const m = /^([A-Za-z]+)\s+(.*)$/.exec(trimmed)
    if (!m) return { instructions, error: { line: lineNo, message: `invalid instruction format: '${trimmed}'` } }
    const [key, value] = [m[1].toUpperCase(), m[2].trim()]
    switch (key) {
      case 'FROM': {
        const ref = value.trim()
        const parts = ref.split(':')
        const image = parts[0]
        const tag = parts[1] ?? 'latest'
        instructions.push({ type: 'FROM', image, tag })
        break
      }
      case 'WORKDIR': {
        instructions.push({ type: 'WORKDIR', path: value.trim() })
        break
      }
      case 'COPY': {
        const parts = value.split(/\s+/)
        if (parts.length < 2) return { instructions, error: { line: lineNo, message: 'COPY requires at least two arguments' } }
        instructions.push({ type: 'COPY', src: parts[0], dest: parts[parts.length - 1] })
        break
      }
      case 'RUN': {
        instructions.push({ type: 'RUN', command: value })
        break
      }
      case 'EXPOSE': {
        const ports = value
          .split(/\s+/)
          .map((p) => parseInt(p, 10))
          .filter((p) => Number.isInteger(p) && p > 0)
        if (ports.length === 0) return { instructions, error: { line: lineNo, message: 'EXPOSE requires a valid port' } }
        instructions.push({ type: 'EXPOSE', ports })
        break
      }
      case 'CMD': {
        let args: string[]
        if (value.startsWith('[')) {
          try {
            args = JSON.parse(value) as string[]
          } catch {
            return { instructions, error: { line: lineNo, message: `invalid CMD JSON array: '${value}'` } }
          }
          if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
            return { instructions, error: { line: lineNo, message: `invalid CMD JSON array: '${value}'` } }
          }
        } else {
          args = value.split(/\s+/)
        }
        instructions.push({ type: 'CMD', args })
        break
      }
      case 'ENV': {
        const eq = value.indexOf('=')
        if (eq <= 0) return { instructions, error: { line: lineNo, message: `invalid ENV: '${value}'` } }
        instructions.push({ type: 'ENV', key: value.slice(0, eq).trim(), value: value.slice(eq + 1).trim() })
        break
      }
      case 'HEALTHCHECK': {
        const inner = value.replace(/^CMD\s+/, '').trim()
        const portM = /(?:localhost|127\.0\.0\.1):(\d+)/.exec(inner)
        instructions.push({ type: 'HEALTHCHECK', command: inner, port: portM ? Number(portM[1]) : null })
        break
      }
      default:
        return { instructions, error: { line: lineNo, message: `unsupported instruction '${key}'（模拟器仅支持 FROM / WORKDIR / COPY / RUN / EXPOSE / CMD / ENV / HEALTHCHECK）` } }
    }
  }
  return { instructions }
}

export interface BuildContext {
  state: SimState
  baseDir: string
  tag: string
}

export interface BuildResult {
  image?: ReturnType<typeof buildImageEntry>
  steps: string[]
  error?: string
}

function buildImageEntry(
  repo: string,
  tag: string,
  created: number,
  base: { fsRoot: FsNode; env: Record<string, string>; cmd: string[] | null; workdir: string | null; exposedPorts: number[]; healthcheck: string | null },
): {
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
} {
  let totalBytes = 0
  const count = (node: FsNode) => {
    if (node.kind === 'file') totalBytes += node.content.length
    for (const k of Object.keys(node.children ?? {})) count(node.children![k])
  }
  count(base.fsRoot)
  return {
    id: imageId(repo, tag),
    repository: repo,
    tag,
    size: totalBytes > 1024 ? (totalBytes / 1024).toFixed(1) + 'KB' : totalBytes + 'B',
    created,
    fsRoot: cloneNode(base.fsRoot),
    env: { ...base.env },
    cmd: base.cmd ? [...base.cmd] : null,
    workdir: base.workdir,
    exposedPorts: [...base.exposedPorts],
    history: [],
    healthcheck: base.healthcheck,
  }
}

function putFileAt(root: FsNode, abs: string, content: string, mode = 0o644): boolean {
  const par = getParent(root, abs)
  if (!par || !par.parent.children) return false
  par.parent.children[par.name] = { kind: 'file', name: par.name, content, mode, uid: 0, gid: 0, mtime: 0 }
  return true
}

function ensureDir(root: FsNode, abs: string): FsNode | null {
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

export function buildImageFromDockerfile(ctx: BuildContext, content: string): BuildResult {
  const { state, baseDir, tag } = ctx
  const parsed = parseDockerfile(content)
  if (parsed.error) {
    return { steps: [], error: `Dockerfile parse error line ${parsed.error.line}: ${parsed.error.message}` }
  }
  const steps: string[] = []
  let fsRoot: FsNode | null = null
  let env: Record<string, string> = {}
  let cmd: string[] | null = null
  let workdir: string | null = null
  let exposed: number[] = []
  let healthcheck: string | null = null
  let imageRepo = ''

  const instructions = parsed.instructions.filter((ins) => ins.type !== 'COMMENT' && ins.type !== 'BLANK')
  for (let i = 0; i < instructions.length; i++) {
    const ins = instructions[i]
    const stepNo = i + 1
    const total = instructions.length
    switch (ins.type) {
      case 'FROM': {
        const baseImage = findImage(state.docker, ins.image, ins.tag)
        if (!baseImage) {
          return { steps, error: `Step ${stepNo}/${total} : FROM ${ins.image}:${ins.tag}\nUnable to find image '${ins.image}:${ins.tag}' locally` }
        }
        fsRoot = cloneNode(baseImage.fsRoot)
        env = { ...baseImage.env }
        cmd = baseImage.cmd ? [...baseImage.cmd] : null
        workdir = baseImage.workdir
        exposed = [...baseImage.exposedPorts]
        healthcheck = baseImage.healthcheck
        imageRepo = ins.image
        steps.push(`Step ${stepNo}/${total} : FROM ${ins.image}:${ins.tag}`)
        break
      }
      case 'WORKDIR': {
        const target = normalizePath(workdir ?? '/', ins.path, '/')
        if (!ensureDir(fsRoot!, target)) return { steps, error: `Step ${stepNo}/${total} : WORKDIR ${ins.path}\nCannot create directory` }
        workdir = target
        steps.push(`Step ${stepNo}/${total} : WORKDIR ${ins.path}`)
        break
      }
      case 'COPY': {
        const srcAbs = normalizePath(baseDir, ins.src, '/')
        const srcNode = walk(state.fsRoot, srcAbs)
        if (!srcNode) return { steps, error: `Step ${stepNo}/${total} : COPY ${ins.src} ${ins.dest}\nCOPY failed: file ${ins.src} not found in build context` }
        const destTarget = ins.dest.endsWith('/') ? ins.dest + ins.src.split('/').pop() : ins.dest
        const destAbs = destTarget.startsWith('/') ? destTarget : normalizePath(workdir ?? '/', destTarget, '/')
        if (srcNode.kind === 'file') {
          if (!putFileAt(fsRoot!, destAbs, srcNode.content, srcNode.mode)) return { steps, error: `Step ${stepNo}/${total} : COPY ${ins.src} ${ins.dest}\nCOPY failed: invalid destination` }
        } else {
          const destDir = ensureDir(fsRoot!, destAbs)
          if (!destDir || !destDir.children) return { steps, error: `Step ${stepNo}/${total} : COPY ${ins.src} ${ins.dest}\nCOPY failed: invalid destination` }
          for (const k of Object.keys(srcNode.children ?? {})) {
            destDir.children[k] = cloneNode(srcNode.children![k], k)
          }
        }
        steps.push(`Step ${stepNo}/${total} : COPY ${ins.src} ${ins.dest}`)
        break
      }
      case 'RUN': {
        const tmp: SimState = { ...state, fsRoot: fsRoot!, env: { ...env }, cwd: workdir ?? '/', uid: 0, gids: [0], history: [], exitCodes: [], clock: state.clock }
        const parsedCmd = parseInput(ins.command, tmp.env)
        let failed = false
        for (const pipeline of parsedCmd.pipelines) {
          const r = runPipeline(tmp, pipeline)
          if (r.exitCode !== 0) {
            failed = true
            if (r.stderr) steps.push(r.stderr.trimEnd())
          }
        }
        fsRoot = tmp.fsRoot
        if (failed) {
          return { steps, error: `Step ${stepNo}/${total} : RUN ${ins.command}\nThe command '/bin/sh -c ${ins.command}' returned a non-zero code: 1` }
        }
        steps.push(`Step ${stepNo}/${total} : RUN ${ins.command}`)
        break
      }
      case 'EXPOSE': {
        for (const p of ins.ports) if (!exposed.includes(p)) exposed.push(p)
        steps.push(`Step ${stepNo}/${total} : EXPOSE ${ins.ports.join(' ')}`)
        break
      }
      case 'CMD': {
        cmd = ins.args
        steps.push(`Step ${stepNo}/${total} : CMD ${JSON.stringify(ins.args)}`)
        break
      }
      case 'ENV': {
        env[ins.key] = ins.value
        steps.push(`Step ${stepNo}/${total} : ENV ${ins.key}=${ins.value}`)
        break
      }
      case 'HEALTHCHECK': {
        healthcheck = ins.command
        steps.push(`Step ${stepNo}/${total} : HEALTHCHECK CMD ${ins.command}`)
        break
      }
    }
  }
  if (!fsRoot) {
    return { steps, error: 'Dockerfile parse error: missing FROM instruction' }
  }
  const [repo, tagName] = tag.split(':')
  const entry = buildImageEntry(repo, tagName ?? 'latest', state.clock, { fsRoot, env, cmd, workdir, exposedPorts: exposed, healthcheck })
  entry.history = [...steps]
  state.docker.images.push(entry)
  void imageRepo
  return { image: entry, steps }
}

export function dockerfileBuildResult(build: BuildResult): CommandResult {
  if (build.error) return err(build.error, 125)
  const steps = build.steps.map((s) => ` ---> ${s}`)
  return ok(
    [...steps, `Successfully built ${build.image!.id}`, `Successfully tagged ${build.image!.repository}:${build.image!.tag}`, ''].join('\n'),
  )
}
