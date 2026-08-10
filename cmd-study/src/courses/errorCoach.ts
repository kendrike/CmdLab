import type { Lab } from './validate'
import type { SimState } from '../sim/types'
import { commandNames } from '../sim/shell/registry'

export type CoachKind =
  | 'command-not-found'
  | 'no-such-file'
  | 'permission-denied'
  | 'is-directory'
  | 'missing-operand'
  | 'bad-option'
  | 'port-conflict'
  | 'no-such-container'
  | 'container-stopped'
  | 'daemon-unreachable'
  | 'namespace-not-found'
  | 'resource-not-found'
  | 'name-conflict'
  | 'connection-refused'
  | 'log-permission'
  | 'unknown'

export interface CoachAdvice {
  kind: CoachKind
  summary: string
  keyword: string
  cause: string
  checkFirst: string[]
  nextStep: string
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

function similarCommand(word: string, lab: Lab): string | null {
  const pool = commandNames().filter((c) => {
    if (lab.mode === 'linux') return c !== 'docker' && c !== 'kubectl'
    return true
  })
  let best: string | null = null
  let bestDist = Infinity
  for (const c of pool) {
    const d = levenshtein(word, c)
    if (d < bestDist && d <= Math.max(2, Math.floor(word.length / 2))) {
      bestDist = d
      best = c
    }
  }
  return best
}

export interface CoachInput {
  line: string
  stdout: string
  stderr: string
  exitCode: number
}

export function coachError(lab: Lab, state: SimState, input: CoachInput): CoachAdvice | null {
  if (input.exitCode === 0) return null
  const err = input.stderr
  const firstWord = input.line.trim().split(/\s+/)[0] ?? ''
  const second = input.line.trim().split(/\s+/)[1] ?? ''
  const context = (input.line + ' ' + firstWord + ' ' + second + ' ' + lab.id).toLowerCase()

  if (/command not found/.test(err)) {
    const cand = similarCommand(firstWord, lab)
    const hint = cand ? `你输入的是 ${firstWord}，最接近的已知命令是 ${cand}。` : ''
    return {
      kind: 'command-not-found',
      summary: `系统不认识 ${firstWord} 这个命令。`,
      keyword: 'command not found',
      cause: '最常见的原因是命令名拼写错误，或该命令在这个系统里不存在。',
      checkFirst: ['对比任务提示中的命令名，检查是否有拼写错误（大小写、空格、连字符）', hint || '用 help 查看系统支持的命令清单'],
      nextStep: '修正拼写后重新输入。如果确认命令名正确，再看任务是否要求先安装或进入特定环境。',
    }
  }

  if (/No such file or directory/.test(err) || /no such file or directory/i.test(err)) {
    if (/cat\b/.test(context) || /head\b/.test(context) || /tail\b/.test(context) || /less\b/.test(context) || /grep\b/.test(context)) {
      return {
        kind: 'no-such-file',
        summary: '系统在当前目录（或你指定的路径）中没有找到要读取的文件。',
        keyword: 'No such file or directory',
        cause: '通常是三种情况之一：文件不在当前目录、文件名写错、当前所在目录不对。',
        checkFirst: ['先执行 pwd 确认自己当前在哪个目录', '再执行 ls 看看当前目录里到底有哪些文件', '对比 ls 的输出和你的命令，文件名是否一字不差（含扩展名）'],
        nextStep: '根据 ls 的结果修正路径再试。注意：系统不会自动帮你"找到"文件，必须先确认它在哪。',
      }
    }
    if (/cd\b/.test(context)) {
      return {
        kind: 'no-such-file',
        summary: '你要进入的目录不存在，或当前目录下没有这个名字的文件夹。',
        keyword: 'No such file or directory',
        cause: '目录名拼写错误、大小写不对，或目标目录在别的位置。',
        checkFirst: ['先 ls 看看当前位置有哪些目录', '用 pwd 确认你不在"以为的位置"'],
        nextStep: '对照 ls 的输出修正目录名；如果目录在别处，使用带路径的写法，如 cd 项目目录的上级目录再进入。',
      }
    }
    return {
      kind: 'no-such-file',
      summary: '命令要操作的文件或路径不存在。',
      keyword: 'No such file or directory',
      cause: '路径写错、文件名写错，或者你当前不在文件所在的目录。',
      checkFirst: ['pwd 确认当前位置', 'ls 查看当前目录内容，核对名字'],
      nextStep: '修正路径后重试。若确认路径没问题，检查是不是少了一层目录（如 ls -R 找文件到底在哪）。',
    }
  }

  if (/Failed to open log file|failed to open/.test(err) && /Permission denied|permission denied/i.test(err)) {
    return {
      kind: 'log-permission',
      summary: '服务因为写不了日志文件而启动失败。',
      keyword: 'Permission denied / Failed to open',
      cause: '日志文件权限不足（只读），服务进程无法写入。',
      checkFirst: ['ls -l <日志文件> 看权限位', 'tail 日志内容看具体报错'],
      nextStep: '用 chmod 给文件加上写权限（如 chmod 644 <文件>），再重新启动服务。',
    }
  }

  if (/Permission denied/.test(err)) {
    return {
      kind: 'permission-denied',
      summary: '当前用户没有权限执行这个操作。',
      keyword: 'Permission denied',
      cause: '文件或目录的权限位不允许当前用户读写执行，常见于 root 拥有的文件（如 /var/log 下）。',
      checkFirst: ['ls -l <文件> 看第一列权限位：r 读、w 写、x 执行', '确认所有者是谁（第三列是 uid）'],
      nextStep: '如果是自己的文件，用 chmod 加上缺失的权限位；如果是别人的文件，任务通常已经提示你该怎么改。',
    }
  }

  if (/Is a directory/.test(err)) {
    return {
      kind: 'is-directory',
      summary: '你试图用"读取文件"的方式打开一个目录。',
      keyword: 'Is a directory',
      cause: 'cat/head/tail 只能读文件，不能读目录。',
      checkFirst: ['这个路径确实是目录（ls 能列出它）'],
      nextStep: '查看目录内容应该用 ls，而不是 cat。',
    }
  }

  if (/missing operand/.test(err) || /requires an argument/.test(err)) {
    return {
      kind: 'missing-operand',
      summary: `命令 ${firstWord} 缺少了它必须的参数。`,
      keyword: 'missing operand',
      cause: '有的参数必填，漏写时命令无法执行。',
      checkFirst: ['man ' + firstWord + ' 或 ' + firstWord + ' --help 看语法', '任务描述里通常提到了要操作的目标'],
      nextStep: '补上必填的目标（文件、目录、名称等）再执行。',
    }
  }

  if (/invalid option|illegal option|unknown option|Unknown flag|unknown flag|unrecognized option|unexpected/.test(err)) {
    return {
      kind: 'bad-option',
      summary: `命令不认识你给出的某个选项（通常以 - 开头）。`,
      keyword: 'invalid/unknown option',
      cause: '选项拼写错误，或这个选项不在命令的支持列表里。',
      checkFirst: ['man ' + firstWord + ' 查看该命令支持的选项', '确认选项字母大小写正确'],
      nextStep: '修正选项后重试。注意短选项（-r）和长选项（--recursive）的写法不同。',
    }
  }

  if (/port is already allocated|bind: address already in use/.test(err)) {
    return {
      kind: 'port-conflict',
      summary: '这个端口已经被别的容器占用了。',
      keyword: 'port is already allocated',
      cause: '同一台机器上同一时刻，一个端口只能被一个容器监听。',
      checkFirst: ['docker ps 看哪些容器在跑，它们的端口是多少'],
      nextStep: '换一个未被占用的宿主机端口（如 8081），或先停掉占用 8080 的容器再启动新的。',
    }
  }

  if (/No such container|no such container/i.test(err)) {
    return {
      kind: 'no-such-container',
      summary: 'Docker 找不到你指定的容器。',
      keyword: 'No such container',
      cause: '容器名写错，或者容器已经被删除。注意：容器退出后仍然存在（ps -a 可见），删除了才彻底没有。',
      checkFirst: ['docker ps -a 列出所有容器（包括已退出的），核对名字'],
      nextStep: '用 docker ps -a 里看到的真实名字重新执行；如果确实不存在，需要先 docker run 创建它。',
    }
  }

  if (/is not running|cannot start a stopped container/.test(err)) {
    return {
      kind: 'container-stopped',
      summary: '这个容器已经停止了，当前状态不允许这个操作。',
      keyword: 'is not running',
      cause: 'exec/logs 等操作要求容器处于运行状态；容器可能因为启动失败或手动 stop 而停止。',
      checkFirst: ['docker ps -a 确认容器的 STATUS（Exited 表示已停止）', 'docker logs <容器名> 看它为什么退出'],
      nextStep: '用 docker start <容器名> 重新启动；如果容器反复退出，先看日志找出原因。',
    }
  }

  if (/cannot connect to the Docker daemon|Is the docker daemon running/.test(err)) {
    return {
      kind: 'daemon-unreachable',
      summary: '客户端无法连接 Docker 守护进程。',
      keyword: 'cannot connect to the Docker daemon',
      cause: 'Docker 服务没有运行或环境异常。',
      checkFirst: ['docker version 看 Server 部分是否有版本信息'],
      nextStep: '如果 Server 一直连不上，先执行 docker info 确认环境状态；模拟器中可检查环境是否被重置。',
    }
  }

  if (/namespaces? "([^"]+)" not found/.test(err)) {
    const m = /namespaces? "([^"]+)" not found/.exec(err)
    return {
      kind: 'namespace-not-found',
      summary: `命名空间 ${m ? m[1] : ''} 不存在。`,
      keyword: 'not found',
      cause: '资源可能还没创建，或 -n 后面写错了名字/大小写。',
      checkFirst: ['kubectl get namespaces 看有哪些命名空间'],
      nextStep: '如果命名空间不存在：kubectl create namespace <名字> 创建它；如果存在：检查 -n 后的名字是否一字不差。',
    }
  }

  if (/Error from server \(NotFound\)|not found/.test(err)) {
    return {
      kind: 'resource-not-found',
      summary: '集群里找不到你指定的资源。',
      keyword: 'not found',
      cause: '资源还没创建、名字写错，或资源在别的命名空间（漏了 -n）。',
      checkFirst: ['kubectl get <资源类型> 看有哪些同类型的资源', 'kubectl get <资源类型> -n <命名空间> 检查是否在别的楼栋'],
      nextStep: '对照 get 输出的真实名字重新执行；确认命名空间正确。',
    }
  }

  if (/already exists|already in use/.test(err)) {
    return {
      kind: 'name-conflict',
      summary: '这个名称已经被使用了。',
      keyword: 'already exists',
      cause: '同一命名空间（或同类型资源）里名字必须唯一。',
      checkFirst: ['列出同类型资源，确认哪个已占用该名字'],
      nextStep: '换一个名字，或先删除已存在的同名资源再创建。',
    }
  }

  if (/Connection refused/.test(err)) {
    return {
      kind: 'connection-refused',
      summary: '目标端口没有服务在监听，连接被拒绝。',
      keyword: 'Connection refused',
      cause: '服务没启动、端口号写错，或服务还没监听该端口。',
      checkFirst: ['ss -tlnp 看端口上有没有程序在监听', '确认服务是否处于运行状态'],
      nextStep: '先启动/修复服务，再重试访问。顺序是：确认服务活着 → 确认端口正确 → 再访问。',
    }
  }

  if (/Failed to open log file|failed to open/.test(err)) {
    return {
      kind: 'log-permission',
      summary: '服务因为写不了日志文件而启动失败。',
      keyword: 'Permission denied / Failed to open',
      cause: '日志文件权限不足（只读），服务进程无法写入。',
      checkFirst: ['ls -l <日志文件> 看权限位', 'tail 日志内容看具体报错'],
      nextStep: '用 chmod 给文件加上写权限（如 chmod 644 <文件>），再重新启动服务。',
    }
  }

  return {
    kind: 'unknown',
    summary: '这条命令执行出错了。',
    keyword: err.trim().split(/\s+/).slice(0, 3).join(' '),
    cause: '错误信息里通常已经指明原因，先读一遍 stderr 里的关键词。',
    checkFirst: ['用 man <命令> 或 <命令> --help 确认语法', '对照任务步骤，确认要操作的目标名（文件/容器/资源）是否正确'],
    nextStep: '修正后重试。如果反复失败，请求右侧提示逐级展开，检查是否漏了前置步骤。',
  }
}
