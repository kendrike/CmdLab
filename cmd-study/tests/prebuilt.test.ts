import { describe, expect, it } from 'vitest'
import { LABS } from '../src/courses/labs'
import { walk } from '../src/sim/vfs/paths'

describe('prebuilt yaml', () => {
  it.each(['k8s-pods', 'k8s-configmap', 'k8s-secret', 'k8s-storage', 'k8s-probes', 'k8s-resources', 'k8s-jobs', 'k8s-scheduling', 'k8s-app'])('%s 首次进入有预置 YAML', (id) => {
    const lab = LABS.find((l) => l.id === id)!
    const s = lab.build()
    const files = ['pod.yaml', 'app-deploy.yaml', 'storage.yaml', 'web-deploy.yaml', 'api-deploy.yaml', 'web.yaml', 'big.yaml', 'tiny.yaml', 'backup-cron.yaml', 'gpu-app.yaml']
    const present = files.filter((f) => walk(s.fsRoot, '/home/student/' + f)?.kind === 'file')
    expect(present.length).toBeGreaterThan(0)
  })
})
