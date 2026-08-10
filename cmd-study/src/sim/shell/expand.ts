import type { FsNode } from '../types'
import { basenameOf, globRegex, hasGlobChars, normalizePath, parentOf, walk } from '../vfs/paths'

export function expandArgs(
  args: string[],
  cwd: string,
  home: string,
  root: FsNode,
  allowGlob: boolean[],
): string[] {
  const out: string[] = []
  args.forEach((arg, idx) => {
    if (!allowGlob[idx] || !hasGlobChars(arg)) {
      out.push(arg)
      return
    }
    const abs = normalizePath(cwd, arg, home)
    const parent = walk(root, parentOf(abs))
    const base = basenameOf(abs)
    if (!parent || parent.kind !== 'dir' || !parent.children) {
      out.push(arg)
      return
    }
    const re = globRegex(base)
    const prefix = abs.slice(0, abs.length - base.length)
    const matches = Object.keys(parent.children)
      .filter((nm) => (base.startsWith('.') ? re.test(nm) : re.test(nm) && !nm.startsWith('.')))
      .sort()
    if (matches.length === 0) {
      out.push(arg)
      return
    }
    for (const m of matches) out.push(prefix + m)
  })
  return out
}
