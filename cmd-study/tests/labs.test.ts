import { describe, expect, it } from 'vitest'
import { LABS } from '../src/courses/labs'
import { evaluateLab } from '../src/courses/validate'
import { initCommands } from '../src/sim/commands'
import { ShellSession } from '../src/sim/shell/session'
import type { SimState } from '../src/sim/types'

initCommands()

function runLines(lines: string[]): SimState {
  const lab = LABS[0]
  const session = new ShellSession(lab.build())
  for (const line of lines) session.execute(line)
  return session.state
}

const SOLUTIONS: Record<string, string[]> = {
  'linux-pwd': ['whoami', 'pwd', 'ls', 'history', 'clear'],
  'linux-ls': ['ls', 'ls -a', 'ls -l', 'ls -lh /var/log'],
  'linux-cd': ['cd projects', 'cd /var/log', 'cd ..', 'cd ~'],
  'linux-touch-mkdir': ['mkdir work', 'mkdir -p work/projects/web', 'touch work/notes.txt', 'touch work/projects/web/app.js'],
  'linux-cp-mv': ['cp projects/readme.md projects/readme-copy.md', 'cp -r projects projects-backup', 'mv projects/todo.txt todo.txt', 'mv todo.txt todo-final.txt'],
  'linux-rm': ['rm scratch.txt', 'rm trash/junk1.txt', 'rm -r trash', 'rm -f ghost.txt'],
  'linux-text-view': ['cat /var/log/app.log', 'head -5 /var/log/app.log', 'tail -5 /var/log/app.log', 'tail -f /var/log/app.log'],
  'linux-redirect': ['echo hello > output.txt', 'echo world >> output.txt', '? ls /nonexistent 2> error.txt', '? cat /nonexistent 2>> error.txt'],
  'linux-pipe': ['cat /var/log/app.log | grep ERROR | wc -l', 'cat /var/log/app.log | grep INFO | wc -l', 'cat /var/log/app.log | head -3'],
  'linux-grep': ['grep -n ERROR /var/log/app.log', 'grep -i error /var/log/app.log', 'grep -c ERROR /var/log/app.log', 'grep -v INFO /var/log/app.log'],
  'linux-find': ['find . -name "*.txt"', 'find /var/log -type f', 'find . -type d'],
  'linux-text-tools': ['wc -l data/names.txt', 'sort data/names.txt | uniq -c', 'sort -n data/ip.txt', 'cut -d "," -f 2 data/scores.txt'],
  'linux-chmod': ['chmod 600 secrets.txt', 'chmod +x scripts/run.sh', 'chown :student shared.txt', 'ls -l'],
  'linux-env': ['id', 'env | grep PATH', 'export MY_VAR=hello', 'echo $MY_VAR', 'echo $PATH'],
  'linux-procs': ['ps', 'top', 'kill 2345', 'ps'],
  'linux-archive': ['gzip backup/file1.txt', 'gunzip backup/file1.txt.gz', 'tar -czf backup.tar.gz backup', 'mkdir restore', 'tar -xf backup.tar.gz -C restore', 'ls -R restore'],
  'linux-network': ['ping -c 3 example.com', 'curl http://example.com', '? curl http://localhost:8080/', 'ss -tlnp', 'systemctl start webapp', 'curl http://localhost:8080/'],
  'linux-troubleshoot': ['systemctl status webapp', 'tail -5 /var/log/webapp/app.log', 'ls -l /var/log/webapp/app.log', 'chmod 644 /var/log/webapp/app.log', 'systemctl start webapp', 'curl http://localhost:8080/'],
  'docker-arch': ['docker version', 'docker info', 'docker images'],
  'docker-images': ['docker images', 'docker pull redis', 'docker inspect redis', 'docker rmi redis'],
  'docker-run-nginx': ['docker images', 'docker run -d --name web -p 8080:80 nginx', 'docker ps'],
  'docker-lifecycle': ['docker run -d --name web -p 8080:80 nginx', 'docker stop web', 'docker ps -a', 'docker start web', 'docker restart web', 'docker stop web', 'docker rm web'],
  'docker-logs-stop': ['docker ps', 'docker logs web', 'docker exec web ls /etc/nginx/conf.d', 'docker inspect web'],
  'docker-ports': ['docker run -d --name web -p 8080:80 nginx', 'curl http://localhost:8080/', '? docker run -d --name web2 -p 8080:80 nginx'],
  'docker-env': ['docker run -d --name app -e APP_MODE=prod -e APP_REGION=cn nginx', 'docker exec app env', 'docker inspect app'],
  'docker-volumes': ['docker volume create appdata', 'docker run -d --name app -v appdata:/data nginx', 'docker exec app touch /data/saved.txt', 'docker stop app', 'docker rm app', 'docker run -d --name app2 -v appdata:/data nginx', 'docker exec app2 ls /data'],
  'docker-networks': ['docker network create webnet', 'docker run -d --name app1 --network webnet nginx', 'docker run -d --name app2 --network webnet nginx', 'docker network inspect webnet'],
  'docker-dockerfile': ['cat > Dockerfile <<EOF', 'FROM nginx', 'WORKDIR /usr/share/nginx/html', 'COPY index.html /usr/share/nginx/html/', 'RUN echo built > /build.log', 'EXPOSE 80', 'CMD ["nginx", "-g", "daemon off;"]', 'EOF'],
  'docker-build': ['docker build -t myapp:v1 .', 'docker tag myapp:v1 myapp:latest', 'docker history myapp:v1', 'docker run -d --name myapp myapp:v1'],
  'docker-compose': ['cat > compose.yaml <<EOF', 'version: "3"', 'services:', '  web:', '    image: web', '    ports:', '      - "8080:80"', '  api:', '    image: api', '    ports:', '      - "3000:3000"', 'EOF', 'docker compose up', 'docker compose ps', 'docker compose stop', 'docker compose down'],
  'docker-limits': ['docker run -d --name app --health-cmd "curl -f http://localhost:80/" nginx', 'docker run -d --name limited --memory 128m --cpus 0.5 nginx', 'docker run -d --name auto --restart always nginx', 'docker inspect app'],
  'docker-troubleshoot': ['docker ps -a', 'docker logs api', 'docker network create webnet', 'docker volume create pgdata', 'docker run -d --name db --network webnet -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:15', 'docker stop api', 'docker rm api', 'docker run -d --name api --network webnet -e DB_HOST=db -p 3000:3000 --health-cmd "curl -f http://localhost:3000/health" api-broken', 'docker run -d --name web --network webnet -p 8080:80 web', 'curl http://localhost:8080/'],
  'k8s-pods': ['kubectl get pods', 'kubectl get deployments', 'kubectl get pods -n kube-system', 'cat > pod.yaml <<EOF', 'apiVersion: v1', 'kind: Pod', 'metadata:', '  name: hello', 'spec:', '  containers:', '  - name: hello', '    image: nginx', 'EOF', 'kubectl apply -f pod.yaml', 'kubectl describe pod hello', 'kubectl delete pod hello'],
  'k8s-intro': ['kubectl cluster-info', 'kubectl config current-context', 'kubectl get namespaces'],
  'k8s-apply': ['kubectl apply -f web-app.yaml', 'kubectl apply -f web-app.yaml', 'kubectl get deployment web -o yaml', 'kubectl get services'],
  'k8s-labels': ['kubectl get pods', 'kubectl label pod <nginx-pod> tier=frontend', 'kubectl get pods -l tier=frontend', 'kubectl annotate pod <nginx-pod> note=example', 'kubectl label pod <nginx-pod> tier-'],
  'k8s-deploy-scale': ['kubectl create deployment web --image=nginx', 'kubectl scale deployment web --replicas=3', 'kubectl get pods'],
  'k8s-scale': ['kubectl scale deployment web --replicas=5', 'kubectl scale deployment web --replicas=2', 'kubectl get rs', 'kubectl get pods'],
  'k8s-rollout': ['kubectl set image deployment/web web=nginx:1.25', 'kubectl rollout status deployment/web', 'kubectl rollout history deployment/web', 'kubectl rollout undo deployment/web'],
  'k8s-service': ['kubectl get deployments', 'kubectl expose deployment web --port=80 --type=NodePort', 'kubectl get services', 'kubectl get endpoints'],
  'k8s-configmap': ['kubectl create configmap app-config --from-literal=APP_MODE=prod', 'cat > app-deploy.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        envFrom:', '        - configMapRef:', '            name: app-config', 'EOF', 'kubectl apply -f app-deploy.yaml', 'kubectl exec <app-pod> -- env', 'kubectl describe configmap app-config'],
  'k8s-secret': ['kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123', 'kubectl get secret db-secret -o yaml', 'cat > app-deploy.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        env:', '        - name: DB_PASSWORD', '          valueFrom:', '            secretKeyRef:', '              name: db-secret', '              key: DB_PASSWORD', 'EOF', 'kubectl apply -f app-deploy.yaml', 'kubectl exec <app-pod> -- env'],
  'k8s-storage': ['cat > storage.yaml <<EOF', 'apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: data-pv', 'spec:', '  capacity:', '    storage: 1Gi', '  accessModes:', '    - ReadWriteOnce', '  persistentVolumeReclaimPolicy: Retain', '---', 'apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', '  name: data-pvc', 'spec:', '  accessModes:', '    - ReadWriteOnce', '  resources:', '    requests:', '      storage: 500Mi', 'EOF', 'kubectl apply -f storage.yaml', 'kubectl get pvc', 'cat > app-deploy.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: app', '  template:', '    metadata:', '      labels:', '        app: app', '    spec:', '      containers:', '      - name: app', '        image: nginx', '        volumeMounts:', '        - name: data', '          mountPath: /data', '      volumes:', '      - name: data', '        persistentVolumeClaim:', '          claimName: data-pvc', 'EOF', 'kubectl apply -f app-deploy.yaml', 'kubectl get pv', 'kubectl get pvc'],
  'k8s-probes': ['cat > web-deploy.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: web', '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: nginx', '        readinessProbe:', '          httpGet:', '            path: /', '            port: 80', '        livenessProbe:', '          httpGet:', '            path: /', '            port: 80', 'EOF', 'kubectl apply -f web-deploy.yaml', 'cat > api-deploy.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: api', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: api', '  template:', '    metadata:', '      labels:', '        app: api', '    spec:', '      containers:', '      - name: api', '        image: api-broken', '        readinessProbe:', '          httpGet:', '            path: /health', '            port: 3000', 'EOF', 'kubectl apply -f api-deploy.yaml', 'kubectl describe pod <api-pod>', 'kubectl set image deployment/api api=api'],
  'k8s-resources': ['cat > web.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: web', '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: nginx', '        resources:', '          requests:', '            cpu: 250m', '            memory: 256Mi', '          limits:', '            cpu: 500m', '            memory: 512Mi', 'EOF', 'kubectl apply -f web.yaml', 'cat > big.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: big', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: big', '  template:', '    metadata:', '      labels:', '        app: big', '    spec:', '      containers:', '      - name: big', '        image: nginx', '        resources:', '          requests:', '            memory: 4Gi', 'EOF', 'kubectl apply -f big.yaml', 'cat > tiny.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: tiny', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: tiny', '  template:', '    metadata:', '      labels:', '        app: tiny', '    spec:', '      containers:', '      - name: tiny', '        image: nginx', '        resources:', '          limits:', '            memory: 32Mi', 'EOF', 'kubectl apply -f tiny.yaml', 'kubectl top nodes', 'kubectl top pods'],
  'k8s-jobs': ['kubectl create job hello --image=busybox', 'kubectl get jobs', 'cat > backup-cron.yaml <<EOF', 'apiVersion: batch/v1', 'kind: CronJob', 'metadata:', '  name: backup', 'spec:', '  schedule: "*/1 * * * *"', '  jobTemplate:', '    spec:', '      template:', '        spec:', '          containers:', '          - name: backup', '            image: busybox', '          restartPolicy: Never', 'EOF', 'kubectl apply -f backup-cron.yaml', 'kubectl get cronjobs'],
  'k8s-scheduling': ['kubectl taint nodes node-2 gpu=true:NoSchedule', 'cat > gpu-app.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: gpu-app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: gpu-app', '  template:', '    metadata:', '      labels:', '        app: gpu-app', '    spec:', '      nodeSelector:', '        disktype: hdd', '      containers:', '      - name: gpu-app', '        image: nginx', 'EOF', 'kubectl apply -f gpu-app.yaml', 'cat > gpu-app-tol.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: gpu-app', 'spec:', '  replicas: 1', '  selector:', '    matchLabels:', '      app: gpu-app', '  template:', '    metadata:', '      labels:', '        app: gpu-app', '    spec:', '      nodeSelector:', '        disktype: hdd', '      tolerations:', '      - key: gpu', '        operator: Exists', '        effect: NoSchedule', '      containers:', '      - name: gpu-app', '        image: nginx', 'EOF', 'kubectl apply -f gpu-app-tol.yaml'],
  'k8s-inspect': ['kubectl get pods', 'kubectl describe pod <api-pod>', 'kubectl logs <api-pod>', 'kubectl exec <api-pod> -- env', 'kubectl get events', 'kubectl set image deployment/api api=api'],
  'k8s-app': ['kubectl create namespace prod', 'kubectl create configmap app-config --from-literal=APP_MODE=prod -n prod', 'kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123 -n prod', 'cat > web.yaml <<EOF', 'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web', '  namespace: prod', 'spec:', '  replicas: 3', '  selector:', '    matchLabels:', '      app: web', '  template:', '    metadata:', '      labels:', '        app: web', '    spec:', '      containers:', '      - name: web', '        image: nginx', '        ports:', '        - containerPort: 80', '        envFrom:', '        - configMapRef:', '            name: app-config', '        env:', '        - name: DB_PASSWORD', '          valueFrom:', '            secretKeyRef:', '              name: db-secret', '              key: DB_PASSWORD', '        resources:', '          requests:', '            cpu: 100m', '            memory: 256Mi', '          limits:', '            cpu: 500m', '            memory: 512Mi', '        readinessProbe:', '          httpGet:', '            path: /', '            port: 80', '        livenessProbe:', '          httpGet:', '            path: /', '            port: 80', '---', 'apiVersion: v1', 'kind: Service', 'metadata:', '  name: web', '  namespace: prod', 'spec:', '  selector:', '    app: web', '  ports:', '  - port: 80', '    targetPort: 80', 'EOF', 'kubectl apply -f web.yaml', 'kubectl set image deployment/web web=nginx:1.25 -n prod', 'kubectl rollout undo deployment/web -n prod', 'kubectl describe pod <prod-api-pod> -n prod', 'kubectl logs <prod-api-pod> -n prod', 'kubectl set image deployment/api api=api -n prod'],
  'k8s-crashloop': ['kubectl get pods', 'kubectl logs <pod>', 'kubectl describe pod <pod>', 'kubectl set image deployment/broken broken=nginx'],
}

function runSolution(labId: string): { session: ShellSession; lines: string[] } {
  const lab = LABS.find((l) => l.id === labId)!
  const session = new ShellSession(lab.build())
  const resolvePlaceholders = (line: string): string => {
    const find = (pred: (p: { owner: string | null; namespace: string }) => boolean, tag: string) => {
      const p = session.state.k8s.pods.find(pred)
      return p ? line.replace(tag, p.name) : line
    }
    if (line.includes('<pod>')) line = find((p) => p.owner === 'broken', '<pod>')
    if (line.includes('<nginx-pod>')) line = find((p) => p.owner === 'nginx', '<nginx-pod>')
    if (line.includes('<app-pod>')) line = find((p) => p.owner === 'app', '<app-pod>')
    if (line.includes('<api-pod>')) line = find((p) => p.owner === 'api' && p.namespace === 'default', '<api-pod>')
    if (line.includes('<prod-api-pod>')) line = find((p) => p.owner === 'api' && p.namespace === 'prod', '<prod-api-pod>')
    return line
  }
  const lines = SOLUTIONS[labId] ?? []
  for (const raw of lines) {
    const line = resolvePlaceholders(raw)
    const expectedFail = line.startsWith('? ')
    const cmd = expectedFail ? line.slice(2) : line
    const r = session.execute(cmd)
    if (expectedFail) {
      expect(r.exitCode, `${cmd} should fail`).not.toBe(0)
    } else {
      expect(r.exitCode, `${cmd} should succeed, got: ${r.stderr}`).toBe(0)
    }
  }
  return { session, lines }
}

describe('实验完成条件', () => {
  for (const lab of LABS) {
    it(`${lab.id}（${lab.title}）标准解法可以完成`, () => {
      const { session } = runSolution(lab.id)
      const result = evaluateLab(lab, session.state)
      expect(result.done, JSON.stringify(result.steps.filter((s) => !s.done).map((s) => s.label))).toBe(true)
    })

    it(`${lab.id}（${lab.title}）初始状态未完成`, () => {
      const session = new ShellSession(lab.build())
      const result = evaluateLab(lab, session.state)
      const stateSteps = lab.steps.filter((s) => s.id.startsWith('s'))
      void stateSteps
      expect(result.done).toBe(false)
    })

    it(`${lab.id}（${lab.title}）错误命令不破坏状态`, () => {
      const session = new ShellSession(lab.build())
      const core = () => {
        const { history, exitCodes, clock, ...rest } = JSON.parse(JSON.stringify(session.state))
        void history
        void exitCodes
        void clock
        return JSON.stringify(rest)
      }
      const before = core()
      session.execute('rm -rf /')
      session.execute('docker run --badflag nginx')
      session.execute('kubectl nonsense')
      expect(core()).toBe(before)
    })
  }

  it('docker 实验按状态而非命令字符串判定', () => {
    const lab = LABS.find((l) => l.id === 'docker-run-nginx')!
    const session = new ShellSession(lab.build())
    session.execute('docker images')
    session.execute('docker run -d --name web -p 8080:80 nginx')
    session.execute('docker ps')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
    const failed = new ShellSession(lab.build())
    failed.execute('docker images')
    failed.execute('docker run -d --name wrong -p 8080:80 nginx')
    failed.execute('docker ps')
    const failedResult = evaluateLab(lab, failed.state)
    expect(failedResult.done).toBe(false)
  })

  it('k8s 扩缩容实验按最终状态判定', () => {
    const lab = LABS.find((l) => l.id === 'k8s-deploy-scale')!
    const session = new ShellSession(lab.build())
    session.execute('kubectl create deployment web --image=nginx')
    session.execute('kubectl scale deployment web --replicas=3')
    session.execute('kubectl get pods')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
    const partial = new ShellSession(lab.build())
    partial.execute('kubectl create deployment web --image=nginx')
    expect(evaluateLab(lab, partial.state).done).toBe(false)
  })

  it('k8s-crashloop 通过 delete + 重建也能修复', () => {
    const lab = LABS.find((l) => l.id === 'k8s-crashloop')!
    const session = new ShellSession(lab.build())
    session.execute('kubectl get pods')
    const broken = session.state.k8s.pods.find((p) => p.owner === 'broken')!
    session.execute('kubectl logs ' + broken.name)
    session.execute('kubectl describe pod ' + broken.name)
    session.execute('kubectl delete deployment broken')
    session.execute('kubectl create deployment broken --image=nginx')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-redirect 追加任意内容也能完成（不限定 world）', () => {
    const lab = LABS.find((l) => l.id === 'linux-redirect')!
    const session = new ShellSession(lab.build())
    session.execute('echo hello > output.txt')
    session.execute('echo hello >> output.txt')
    session.execute('ls /nonexistent 2> error.txt')
    session.execute('cat /nonexistent 2>> error.txt')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-redirect 多次尝试（error.txt 超过两行）也能完成', () => {
    const lab = LABS.find((l) => l.id === 'linux-redirect')!
    const session = new ShellSession(lab.build())
    session.execute('echo hello > output.txt')
    session.execute('echo hello hee >> output.txt')
    session.execute('ls /nonexistent 2> error.txt')
    session.execute('ls /nonexistent 2>> error.txt')
    session.execute('cat /nonexistent 2>> error.txt')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-chmod 任意方式加执行权限都能完成', () => {
    const lab = LABS.find((l) => l.id === 'linux-chmod')!
    const session = new ShellSession(lab.build())
    session.execute('chmod 600 secrets.txt')
    session.execute('chmod 777 scripts/run.sh')
    session.execute('chown :student shared.txt')
    session.execute('ls -l')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-chmod 用 ll 别名也能完成 ls -l 验证步骤', () => {
    const lab = LABS.find((l) => l.id === 'linux-chmod')!
    const session = new ShellSession(lab.build())
    session.execute('chmod 600 secrets.txt')
    session.execute('chmod +x scripts/run.sh')
    session.execute('chown :student shared.txt')
    session.execute('ll')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-env 定义任意变量名都能完成', () => {
    const lab = LABS.find((l) => l.id === 'linux-env')!
    const session = new ShellSession(lab.build())
    session.execute('id')
    session.execute('env | grep PATH')
    session.execute('export APP_ENV=production')
    session.execute('echo $APP_ENV')
    session.execute('echo $PATH')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-archive 解包任意内容都能完成（不限定 file2.txt）', () => {
    const lab = LABS.find((l) => l.id === 'linux-archive')!
    const session = new ShellSession(lab.build())
    session.execute('gzip backup/file1.txt')
    session.execute('gunzip backup/file1.txt.gz')
    session.execute('tar -czf backup.tar.gz backup')
    session.execute('mkdir restore')
    session.execute('tar -xf backup.tar.gz -C restore')
    session.execute('ls -R restore')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })

  it('linux-troubleshoot 权限修复必须可读可写（333 不算修复）', () => {
    const lab = LABS.find((l) => l.id === 'linux-troubleshoot')!
    const session = new ShellSession(lab.build())
    session.execute('systemctl status webapp')
    session.execute('tail -5 /var/log/webapp/app.log')
    session.execute('ls -l')
    session.execute('chmod 333 /var/log/webapp/app.log')
    expect(evaluateLab(lab, session.state).steps.find((s) => s.id === 's4')!.done).toBe(false)
    session.execute('chmod 644 /var/log/webapp/app.log')
    const result = evaluateLab(lab, session.state)
    expect(result.steps.find((s) => s.id === 's4')!.done).toBe(true)
    expect(result.done).toBe(false) // 尚未启动服务
  })

  it('linux-grep 漏写文件（无输出）不能通过', () => {
    const lab = LABS.find((l) => l.id === 'linux-grep')!
    const session = new ShellSession(lab.build())
    session.execute('grep -n ERROR')
    session.execute('grep -i error')
    session.execute('grep -c ERROR')
    session.execute('grep -v INFO')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(false)
    expect(result.steps.every((s) => !s.done)).toBe(true)
  })

  it('linux-grep 带文件成功执行才能通过', () => {
    const lab = LABS.find((l) => l.id === 'linux-grep')!
    const session = new ShellSession(lab.build())
    session.execute('grep -n ERROR /var/log/app.log')
    session.execute('grep -i error /var/log/app.log')
    session.execute('grep -c ERROR /var/log/app.log')
    session.execute('grep -v INFO /var/log/app.log')
    const result = evaluateLab(lab, session.state)
    expect(result.done).toBe(true)
  })
})

describe('状态持久化往返', () => {
  it('JSON 序列化后状态一致', () => {
    const s = runLines(['mkdir lab', 'touch lab/a.txt'])
    const cloned = JSON.parse(JSON.stringify(s)) as SimState
    expect(cloned).toEqual(s)
    expect(cloned.fsRoot.children!['home']!.children!['student']!.children!['lab']!.children!['a.txt']!.kind).toBe('file')
  })
})
