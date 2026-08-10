import type { FsNode } from '../types'

export const UID_ROOT = 0
export const UID_STUDENT = 1000

export const USERS: { name: string; uid: number; gid: number; groups: number[] }[] = [
  { name: 'root', uid: 0, gid: 0, groups: [0] },
  { name: 'student', uid: 1000, gid: 1000, groups: [1000, 27] },
]

export function userName(uid: number): string {
  const u = USERS.find((x) => x.uid === uid)
  return u ? u.name : String(uid)
}

export function groupName(gid: number): string {
  const g: Record<number, string> = { 0: 'root', 1000: 'student', 27: 'sudo' }
  return g[gid] ?? String(gid)
}

function checkBits(node: FsNode, uid: number, gids: number[], bits: number, shift: number): boolean {
  if (uid === UID_ROOT) return true
  const isOwner = node.uid === uid
  const isGroup = gids.includes(node.gid)
  if (isOwner) return (node.mode & bits) !== 0
  if (isGroup) return (node.mode & (bits >> shift)) !== 0
  return (node.mode & (bits >> (shift * 2))) !== 0
}

export function canRead(node: FsNode, uid: number, gids: number[]): boolean {
  return checkBits(node, uid, gids, 0o400, 3)
}

export function canWrite(node: FsNode, uid: number, gids: number[]): boolean {
  return checkBits(node, uid, gids, 0o200, 3)
}

export function canExec(node: FsNode, uid: number, gids: number[]): boolean {
  return checkBits(node, uid, gids, 0o100, 3)
}

export function modeString(node: FsNode): string {
  const t = node.kind === 'dir' ? 'd' : '-'
  const rwx = (b: number) =>
    ((node.mode & b) ? 'r' : '-') +
    ((node.mode & (b >> 1)) ? 'w' : '-') +
    ((node.mode & (b >> 2)) ? 'x' : '-')
  return t + rwx(0o400) + rwx(0o040) + rwx(0o004)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const BASE_EPOCH_MIN = 1783000000

export function formatMtime(mtimeMinutes: number, nowMinutes: number): string {
  const age = nowMinutes - mtimeMinutes
  const d = new Date((BASE_EPOCH_MIN + mtimeMinutes) * 60 * 1000)
  const dd = String(d.getDate()).padStart(2, ' ')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (age > 60 * 24 * 180) return `${MONTHS[d.getMonth()]} ${dd}  ${d.getFullYear()}`
  return `${MONTHS[d.getMonth()]} ${dd} ${hh}:${mm}`
}

export function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'M'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'K'
  return String(bytes)
}
