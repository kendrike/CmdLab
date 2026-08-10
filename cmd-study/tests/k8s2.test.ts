import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/sim/state/build'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import { LABS } from '../src/courses/labs'
import { evaluateLab } from '../src/courses/validate'

initCommands()

function session() {
  return new ShellSession(createInitialState())
}

function dep(s: ShellSession, name: string) {
  return s.state.k8s.deployments.find((d) => d.name === name)
}

function depPods(s: ShellSession, name: string) {
  return s.state.k8s.pods.filter((p) => p.owner === name)
}

function applyLines(s: ShellSession, lines: string[]) {
  for (const l of lines) s.execute(l)
}

function yamlDoc(lines: string[]): string[] {
  return ['cat > test.yaml <<EOF', ...lines, 'EOF', 'kubectl apply -f test.yaml']
}

const DEPLOY_BASE = [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: web',
  'spec:',
  '  replicas: 2',
  '  selector:',
  '    matchLabels:',
  '      app: web',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: web',
  '    spec:',
  '      containers:',
  '      - name: web',
  '        image: nginx',
]

describe('kubectl 基础与命名空间', () => {
  it('cluster-info / config current-context / get namespaces', () => {
    const s = session()
    expect(s.execute('kubectl cluster-info').stdout).toContain('6443')
    expect(s.execute('kubectl config current-context').stdout).toContain('kubernetes-admin@kubernetes')
    const ns = s.execute('kubectl get namespaces')
    expect(ns.stdout).toContain('kube-system')
    expect(ns.stdout).toContain('default')
  })

  it('get pods -n / -A / -o wide', () => {
    const s = session()
    const sys = s.execute('kubectl get pods -n kube-system')
    expect(sys.stdout).toContain('coredns')
    const all = s.execute('kubectl get pods -A')
    expect(all.stdout).toContain('coredns')
    const wide = s.execute('kubectl get pods -n kube-system -o wide')
    expect(wide.stdout).toContain('node-1')
  })

  it('get 不存在的资源类型与命名空间报错', () => {
    const s = session()
    expect(s.execute('kubectl get foos').exitCode).toBe(1)
    expect(s.execute('kubectl get pods -n nope').exitCode).toBe(1)
  })

  it('create namespace 与 delete', () => {
    const s = session()
    expect(s.execute('kubectl create namespace prod').stdout).toContain('namespace/prod created')
    expect(s.execute('kubectl get namespaces').stdout).toContain('prod')
    expect(s.execute('kubectl delete namespace prod').stdout).toContain('deleted')
    expect(s.execute('kubectl delete namespace kube-system').exitCode).toBe(1)
  })
})

describe('Pod 与 apply YAML', () => {
  it('apply Pod 创建并调度运行', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: hello', 'spec:', '  containers:', '  - name: hello', '    image: nginx']))
    const pod = s.state.k8s.pods.find((p) => p.name === 'hello')
    expect(pod?.status).toBe('Running')
    expect(pod?.ready).toBe('1/1')
  })

  it('YAML 语法错误报错', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: x', '  bad-indent', 'spec:']))
    const r = s.execute('kubectl apply -f test.yaml')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('yaml')
  })

  it('缺少 apiVersion/kind 报错', () => {
    const s = session()
    applyLines(s, ['name: x'])
    expect(s.execute('kubectl apply -f test.yaml').exitCode).toBe(1)
  })

  it('未知 kind 报错', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Foo', 'metadata:', '  name: x']))
    const r = s.execute('kubectl apply -f test.yaml')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('no matches for kind')
  })

  it('多文档 YAML 一次创建两个资源', () => {
    const s = session()
    applyLines(s, yamlDoc([...DEPLOY_BASE, '---', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80']))
    expect(dep(s, 'web')).toBeDefined()
    expect(s.state.k8s.services.find((x) => x.name === 'web')).toBeDefined()
  })

  it('apply 幂等：重复执行输出 configured', () => {
    const s = session()
    applyLines(s, yamlDoc(DEPLOY_BASE))
    applyLines(s, yamlDoc(DEPLOY_BASE))
    expect(dep(s, 'web')).toBeDefined()
  })

  it('describe pod 与 delete pod', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: hello', 'spec:', '  containers:', '  - name: hello', '    image: nginx']))
    const d = s.execute('kubectl describe pod hello')
    expect(d.stdout).toContain('Name:')
    expect(d.stdout).toContain('nginx')
    expect(s.execute('kubectl delete pod hello').stdout).toContain('deleted')
    expect(s.execute('kubectl get pod hello').stdout).toContain('No resources found')
  })
})

describe('Deployment 控制器', () => {
  it('create deployment 生成 RS 与 Pod', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const d = dep(s, 'web')!
    expect(d.replicas).toBe(1)
    expect(d.revisions.length).toBe(1)
    expect(depPods(s, 'web').length).toBe(1)
    const rs = s.execute('kubectl get rs')
    expect(rs.stdout).toContain(d.revisions[0].rsName)
  })

  it('scale 扩缩容', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx --replicas=2')
    s.execute('kubectl scale deployment web --replicas=5')
    expect(depPods(s, 'web').length).toBe(5)
    expect(dep(s, 'web')!.available).toBe(5)
    s.execute('kubectl scale deployment web --replicas=1')
    expect(depPods(s, 'web').length).toBe(1)
  })

  it('set image 触发新 revision，rollout history/undo 回滚', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx --replicas=2')
    expect(s.execute('kubectl rollout history deployment/web').stdout).toContain('REVISION')
    s.execute('kubectl set image deployment/web web=nginx:1.25')
    const d = dep(s, 'web')!
    expect(d.image).toBe('nginx:1.25')
    expect(d.revisions.length).toBe(2)
    expect(depPods(s, 'web').every((p) => p.image === 'nginx:1.25' && p.status === 'Running')).toBe(true)
    expect(s.execute('kubectl rollout status deployment/web').stdout).toContain('successfully rolled out')
    s.execute('kubectl rollout undo deployment/web')
    expect(dep(s, 'web')!.image).toBe('nginx')
    expect(dep(s, 'web')!.revisions.length).toBe(3)
    expect(depPods(s, 'web').every((p) => p.status === 'Running')).toBe(true)
  })

  it('rollout restart 原地重启', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const before = depPods(s, 'web')[0].name
    s.execute('kubectl rollout restart deployment/web')
    expect(dep(s, 'web')!.revisions.length).toBe(2)
    expect(depPods(s, 'web')[0].name).not.toBe(before)
  })

  it('apply 更新模板（tolerations）触发重建', () => {
    const s = session()
    applyLines(s, yamlDoc(DEPLOY_BASE))
    const revBefore = dep(s, 'web')!.revisions.length
    applyLines(s, yamlDoc([
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      '  name: web',
      'spec:',
      '  replicas: 2',
      '  selector:',
      '    matchLabels:',
      '      app: web',
      '  template:',
      '    metadata:',
      '      labels:',
      '        app: web',
      '    spec:',
      '      tolerations:',
      '      - key: gpu',
      '        operator: Exists',
      '        effect: NoSchedule',
      '      containers:',
      '      - name: web',
      '        image: nginx',
    ]))
    expect(dep(s, 'web')!.revisions.length).toBeGreaterThan(revBefore)
    expect(dep(s, 'web')!.tolerations.some((t) => t.key === 'gpu')).toBe(true)
  })
})

describe('Service selector 与 endpoints', () => {
  it('expose deployment 后 endpoints 非空', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx --replicas=2')
    s.execute('kubectl expose deployment web --port=80 --type=NodePort')
    const eps = s.execute('kubectl get endpoints web')
    expect(eps.stdout).toContain('10.244.0.')
    const svc = s.state.k8s.services.find((x) => x.name === 'web')!
    expect(svc.type).toBe('NodePort')
    expect(svc.ports[0].nodePort).toBeGreaterThan(30000)
  })

  it('selector 不匹配时 endpoints 为 none', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    s.execute('kubectl label deployment web app=other')
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Service', 'metadata:', '  name: s1', 'spec:', '  selector:', '    app: nomatch', '  ports:', '  - port: 80']))
    expect(s.execute('kubectl get endpoints s1').stdout).toContain('<none>')
  })

  it('apply Service 更新 selector 生效', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80']))
    expect(s.execute('kubectl get endpoints web').stdout).toContain('10.244.0.')
  })
})

describe('ConfigMap 与 Secret 注入', () => {
  it('ConfigMap envFrom 注入并 exec 验证', () => {
    const s = session()
    s.execute('kubectl create configmap app-config --from-literal=APP_MODE=prod')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        envFrom:', '        - configMapRef:', '            name: app-config']))
    const pod = depPods(s, 'app')[0]
    expect(pod.env['APP_MODE']).toBe('prod')
    expect(s.execute(`kubectl exec ${pod.name} -- env`).stdout).toContain('APP_MODE=prod')
  })

  it('Secret base64 存储与解码注入', () => {
    const s = session()
    s.execute('kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123')
    const sec = s.state.k8s.secrets.find((x) => x.name === 'db-secret')!
    expect(sec.data['DB_PASSWORD']).toBe('c2VjcmV0MTIz')
    const y = s.execute('kubectl get secret db-secret -o yaml')
    expect(y.stdout).toContain('c2VjcmV0MTIz')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        env:', '        - name: DB_PASSWORD', '          valueFrom:', '            secretKeyRef:', '              name: db-secret', '              key: DB_PASSWORD']))
    const pod = depPods(s, 'app')[0]
    expect(pod.env['DB_PASSWORD']).toBe('secret123')
  })

  it('Secret 挂载为卷文件', () => {
    const s = session()
    s.execute('kubectl create secret generic app-secret --from-literal=TOKEN=abc123')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        volumeMounts:', '        - name: creds', '          mountPath: /etc/creds', '      volumes:', '      - name: creds', '        secret:', '          secretName: app-secret']))
    const pod = depPods(s, 'app')[0]
    expect(pod.fs['/etc/creds/TOKEN']).toBe('abc123')
    expect(s.execute(`kubectl exec ${pod.name} -- cat /etc/creds/TOKEN`).stdout).toContain('abc123')
  })
})

describe('PV / PVC', () => {
  it('PVC 绑定 PV，Pod 挂载运行', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: data-pv', 'spec:', '  capacity:', '    storage: 1Gi', '  accessModes:', '    - ReadWriteOnce', '  persistentVolumeReclaimPolicy: Retain', '---', 'apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', '  name: data-pvc', 'spec:', '  accessModes:', '    - ReadWriteOnce', '  resources:', '    requests:', '      storage: 500Mi']))
    const pvc = s.state.k8s.pvcs.find((x) => x.name === 'data-pvc')!
    expect(pvc.status).toBe('Bound')
    expect(pvc.volumeName).toBe('data-pv')
    expect(s.state.k8s.pvs.find((x) => x.name === 'data-pv')!.status).toBe('Bound')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        volumeMounts:', '        - name: data', '          mountPath: /data', '      volumes:', '      - name: data', '        persistentVolumeClaim:', '          claimName: data-pvc']))
    expect(depPods(s, 'app')[0].status).toBe('Running')
    expect(s.execute('kubectl get pv').stdout).toContain('Bound')
    expect(s.execute('kubectl get pvc').stdout).toContain('Bound')
  })

  it('容量不足时 PVC 保持 Pending，Pod 也 Pending', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: small-pv', 'spec:', '  capacity:', '    storage: 100Mi', '  accessModes:', '    - ReadWriteOnce', '  persistentVolumeReclaimPolicy: Retain', '---', 'apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', '  name: big-pvc', 'spec:', '  accessModes:', '    - ReadWriteOnce', '  resources:', '    requests:', '      storage: 1Gi']))
    const pvc = s.state.k8s.pvcs.find((x) => x.name === 'big-pvc')!
    expect(pvc.status).toBe('Pending')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        volumeMounts:', '        - name: data', '          mountPath: /data', '      volumes:', '      - name: data', '        persistentVolumeClaim:', '          claimName: big-pvc']))
    expect(depPods(s, 'app')[0].status).toBe('Pending')
  })
})

describe('探针与状态', () => {
  it('readiness 失败 → Running 但 Ready 0/1', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: api', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: api', '  template:', '    metadata:', '      labels:', '        app: api', '    spec:', '      containers:', '      - name: api', '        image: api-broken', '        readinessProbe:', '          httpGet:', '            path: /health', '            port: 3000']))
    const pod = depPods(s, 'api')[0]
    expect(pod.status).toBe('Running')
    expect(pod.ready).toBe('0/1')
    const d = s.execute('kubectl describe pod ' + pod.name)
    expect(d.stdout).toContain('Readiness probe failed')
  })

  it('健康镜像 + readiness 探针 → 1/1', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: web', '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: nginx', '        readinessProbe:', '          httpGet:', '            path: /', '            port: 80']))
    const pod = depPods(s, 'web')[0]
    expect(pod.ready).toBe('1/1')
  })

  it('startup 探针失败 → CrashLoopBackOff', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: bad', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: bad', '  template:', '    metadata:', '      labels:', '        app: bad', '    spec:', '      containers:', '      - name: bad', '        image: badapp', '        startupProbe:', '          exec:', '            command: ["ls", "/etc"]']))
    expect(depPods(s, 'bad')[0].status).toBe('CrashLoopBackOff')
  })
})

describe('资源限制与异常状态', () => {
  it('requests 超节点容量 → Pending + FailedScheduling', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: big', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: big', '  template:', '    metadata:', '      labels:', '        app: big', '    spec:', '      containers:', '      - name: big', '        image: nginx', '        resources:', '          requests:', '            memory: 4Gi']))
    const pod = depPods(s, 'big')[0]
    expect(pod.status).toBe('Pending')
    expect(pod.message).toContain('Insufficient')
  })

  it('limits 小于镜像需求 → OOMKilled', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: tiny', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: tiny', '  template:', '    metadata:', '      labels:', '        app: tiny', '    spec:', '      containers:', '      - name: tiny', '        image: nginx', '        resources:', '          limits:', '            memory: 32Mi']))
    expect(depPods(s, 'tiny')[0].status).toBe('OOMKilled')
  })

  it('未知镜像 → ImagePullBackOff', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: v1', 'kind: Pod', 'metadata:', '  name: pullx', 'spec:', '  containers:', '  - name: pullx', '    image: nonexistent:1.0']))
    const pod = s.state.k8s.pods.find((p) => p.name === 'pullx')!
    expect(pod.status).toBe('ImagePullBackOff')
    const logs = s.execute('kubectl logs pullx')
    expect(logs.stdout).toContain('Back-off pulling image')
  })

  it('crash 镜像 → CrashLoopBackOff，set image 修复', () => {
    const s = session()
    s.execute('kubectl create deployment broken --image=crashy-app')
    expect(depPods(s, 'broken')[0].status).toBe('CrashLoopBackOff')
    expect(s.execute('kubectl logs deployment/broken').stdout).toContain('Error')
    expect(s.execute('kubectl rollout status deployment/broken').exitCode).toBe(1)
    s.execute('kubectl set image deployment/broken broken=nginx')
    expect(depPods(s, 'broken')[0].status).toBe('Running')
  })

  it('top nodes / top pods 输出', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx --replicas=2')
    expect(s.execute('kubectl top nodes').stdout).toContain('node-1')
    expect(s.execute('kubectl top pods').stdout).toContain('web-')
  })
})

describe('Job 与 CronJob', () => {
  it('create job 完成并显示 Succeeded', () => {
    const s = session()
    s.execute('kubectl create job hello --image=busybox')
    const job = s.state.k8s.jobs.find((j) => j.name === 'hello')!
    expect(job.status).toBe('Succeeded')
    expect(s.execute('kubectl get jobs').stdout).toContain('hello')
    const pod = s.state.k8s.pods.find((p) => p.owner === 'hello')!
    expect(pod.status).toBe('Completed')
  })

  it('CronJob YAML 创建并生成 Job', () => {
    const s = session()
    applyLines(s, yamlDoc(['apiVersion: batch/v1', 'kind: CronJob', 'metadata:', '  name: backup', 'spec:', '  schedule: "*/1 * * * *"', '  jobTemplate:', '    spec:', '      template:', '        spec:', '          containers:', '          - name: backup', '            image: busybox', '          restartPolicy: Never']))
    expect(s.state.k8s.cronjobs.find((j) => j.name === 'backup')?.schedule).toBe('*/1 * * * *')
    expect(s.execute('kubectl get cronjobs').stdout).toContain('backup')
  })
})

describe('调度：taint / nodeSelector / toleration', () => {
  it('taint node-2 → nodeSelector 匹配但无容忍 → Pending；加容忍 → Running', () => {
    const s = session()
    expect(s.execute('kubectl taint nodes node-2 gpu=true:NoSchedule').stdout).toContain('tainted')
    expect(s.execute('kubectl get nodes -o wide').stdout).toContain('gpu=true:NoSchedule')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: gpu-app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: gpu-app', '  template:', '    metadata:', '      labels:', '        app: gpu-app', '    spec:', '      nodeSelector:', '        disktype: hdd', '      containers:', '      - name: gpu-app', '        image: nginx']))
    const p1 = depPods(s, 'gpu-app')[0]
    expect(p1.status).toBe('Pending')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: gpu-app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: gpu-app', '  template:', '    metadata:', '      labels:', '        app: gpu-app', '    spec:', '      nodeSelector:', '        disktype: hdd', '      tolerations:', '      - key: gpu', '        operator: Exists', '        effect: NoSchedule', '      containers:', '      - name: gpu-app', '        image: nginx']))
    const p2 = depPods(s, 'gpu-app')[0]
    expect(p2.status).toBe('Running')
    expect(p2.node).toBe('node-2')
  })

  it('移除 taint（key-）', () => {
    const s = session()
    s.execute('kubectl taint nodes node-2 gpu=true:NoSchedule')
    expect(s.execute('kubectl taint nodes node-2 gpu=true:NoSchedule-').stdout).toContain('untainted')
    expect(s.state.k8s.nodes.find((n) => n.name === 'node-2')!.taints.length).toBe(0)
  })
})

describe('label / annotate / exec / edit', () => {
  it('label 与 annotate 操作', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const pod = depPods(s, 'web')[0]
    expect(s.execute(`kubectl label pod ${pod.name} tier=frontend`).stdout).toContain('labeled')
    expect(s.state.k8s.pods.find((p) => p.name === pod.name)!.labels['tier']).toBe('frontend')
    expect(s.execute(`kubectl get pods -l tier=frontend`).stdout).toContain(pod.name)
    expect(s.execute(`kubectl annotate pod ${pod.name} note=example`).stdout).toContain('annotated')
    expect(s.state.k8s.pods.find((p) => p.name === pod.name)!.annotations['note']).toBe('example')
    expect(s.execute(`kubectl label pod ${pod.name} tier-`).stdout).toContain('labeled')
    expect(s.state.k8s.pods.find((p) => p.name === pod.name)!.labels['tier']).toBeUndefined()
  })

  it('label 冲突需要 --overwrite', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const pod = depPods(s, 'web')[0]
    expect(s.execute(`kubectl label pod ${pod.name} app=web`).exitCode).toBe(1)
    expect(s.execute(`kubectl label pod ${pod.name} app=web --overwrite`).exitCode).toBe(0)
  })

  it('exec 在 Pod 内执行命令', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const pod = depPods(s, 'web')[0]
    expect(s.execute(`kubectl exec ${pod.name} -- echo hi`).stdout).toContain('hi')
    expect(s.execute(`kubectl exec ${pod.name} -- whoami`).stdout).toContain('root')
    expect(s.execute(`kubectl exec ${pod.name} -- cat /etc/hosts`).exitCode).toBe(1)
    expect(s.execute(`kubectl exec ${pod.name} -- nope`).exitCode).toBe(127)
  })

  it('CrashLoopBackOff 的 Pod 无法 exec', () => {
    const s = session()
    s.execute('kubectl create deployment broken --image=crashy-app')
    const pod = depPods(s, 'broken')[0]
    expect(s.execute(`kubectl exec ${pod.name} -- ls`).exitCode).toBe(1)
  })

  it('edit 导出资源 YAML', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const r = s.execute('kubectl edit deployment web')
    expect(r.stdout).toContain('web-edit.yaml')
  })

  it('get -o yaml 输出资源定义', () => {
    const s = session()
    s.execute('kubectl create deployment web --image=nginx')
    const y = s.execute('kubectl get deployment web -o yaml')
    expect(y.stdout).toContain('kind: Deployment')
    expect(y.stdout).toContain('replicas: 1')
  })
})

describe('综合实验（k8s-app）', () => {
  it('SOLUTIONS 流程可完成全部步骤', () => {
    const lab = LABS.find((l) => l.id === 'k8s-app')!
    const s = new ShellSession(lab.build())
    s.execute('kubectl create namespace prod')
    s.execute('kubectl create configmap app-config --from-literal=APP_MODE=prod -n prod')
    s.execute('kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123 -n prod')
    applyLines(s, yamlDoc(['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', '  namespace: prod', 'spec:', '  replicas: 3', '  selector:', '    matchLabels:', '      app: web', '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: nginx', '        ports:', '        - containerPort: 80', '        envFrom:', '        - configMapRef:', '            name: app-config', '        env:', '        - name: DB_PASSWORD', '          valueFrom:', '            secretKeyRef:', '              name: db-secret', '              key: DB_PASSWORD', '        resources:', '          requests:', '            cpu: 100m', '            memory: 256Mi', '          limits:', '            cpu: 500m', '            memory: 512Mi', '        readinessProbe:', '          httpGet:', '            path: /', '            port: 80', '        livenessProbe:', '          httpGet:', '            path: /', '            port: 80', '---', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', '  namespace: prod', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80', '    targetPort: 80']))
    const webPods = s.state.k8s.pods.filter((p) => p.owner === 'web' && p.namespace === 'prod')
    expect(webPods.length).toBe(3)
    expect(webPods.every((p) => p.status === 'Running' && p.ready === '1/1')).toBe(true)
    expect(webPods.every((p) => p.env['APP_MODE'] === 'prod' && p.env['DB_PASSWORD'] === 'secret123')).toBe(true)
    const eps = s.execute('kubectl get endpoints web -n prod')
    expect(eps.stdout).toContain('10.244.0.')
    s.execute('kubectl set image deployment/web web=nginx:1.25 -n prod')
    expect(dep(s, 'web')!.revisions.length).toBe(2)
    s.execute('kubectl rollout undo deployment/web -n prod')
    expect(dep(s, 'web')!.revisions.length).toBe(3)
    const apiPod = s.state.k8s.pods.find((p) => p.owner === 'api' && p.namespace === 'prod')!
    expect(apiPod.ready).toBe('0/1')
    s.execute(`kubectl describe pod ${apiPod.name} -n prod`)
    s.execute(`kubectl logs ${apiPod.name} -n prod`)
    s.execute('kubectl set image deployment/api api=api -n prod')
    const fixed = s.state.k8s.pods.find((p) => p.owner === 'api' && p.namespace === 'prod')!
    expect(fixed.status).toBe('Running')
    expect(fixed.ready).toBe('1/1')
    const result = evaluateLab(lab, s.state)
    expect(result.done).toBe(true)
  })
})
