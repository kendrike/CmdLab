export type Align = 'left' | 'right'

export interface TableCol {
  name: string
  align?: Align
  flex?: boolean
}

export function formatTable(cols: TableCol[], rows: string[][], sep = ' '): string {
  const widths = cols.map((c, i) => {
    if (c.flex) return 0
    return Math.max(c.name.length, ...rows.map((r) => (r[i] ?? '').length))
  })
  const fmt = (v: string, i: number): string => {
    const c = cols[i]
    const w = widths[i]
    if (c.flex || w === 0) return v
    return c.align === 'right' ? v.padStart(w) : v.padEnd(w)
  }
  const header = cols.map((c, i) => fmt(c.name, i)).join(sep)
  if (rows.length === 0) return header
  const body = rows.map((r) => r.map((_v, i) => fmt(r[i] ?? '', i)).join(sep))
  return header + '\n' + body.join('\n')
}
