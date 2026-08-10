import type { FsNode } from '../types'

export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}

export function normalizePath(cwd: string, input: string, home: string): string {
  let p = input.trim()
  if (p === '~') p = home
  else if (p.startsWith('~/')) p = home + p.slice(1)
  if (!isAbsolute(p)) p = cwd.endsWith('/') ? cwd + p : cwd + '/' + p
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length) out.pop()
    } else {
      out.push(seg)
    }
  }
  return '/' + out.join('/')
}

export function parentOf(absPath: string): string {
  const i = absPath.lastIndexOf('/')
  return i <= 0 ? '/' : absPath.slice(0, i)
}

export function basenameOf(absPath: string): string {
  const i = absPath.lastIndexOf('/')
  return absPath.slice(i + 1)
}

export function segmentsOf(absPath: string): string[] {
  return absPath.split('/').filter(Boolean)
}

export function walk(root: FsNode, absPath: string): FsNode | undefined {
  let node: FsNode | undefined = root
  for (const seg of segmentsOf(absPath)) {
    if (!node || node.kind !== 'dir' || !node.children) return undefined
    node = node.children[seg]
  }
  return node
}

export function getParent(root: FsNode, absPath: string): { parent: FsNode; name: string } | undefined {
  const parentAbs = parentOf(absPath)
  const name = basenameOf(absPath)
  const parent = walk(root, parentAbs)
  if (!parent || parent.kind !== 'dir' || !parent.children) return undefined
  return { parent, name }
}

export function globRegex(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}

export function hasGlobChars(s: string): boolean {
  return /[*?]/.test(s)
}
