import type { Lab } from './validate'

export interface ArgExplain {
  token: string
  meaning: string
  isPlaceholder: boolean
}

export interface CommandExplain {
  command: string
  mnemonic?: string
  args: ArgExplain[]
  reads?: string
  modifies?: string
  risk?: string
}

export interface TableField {
  field: string
  meaning: string
}

interface CommandDoc {
  mnemonic?: string
  flags: Record<string, string>
  valueFlags?: string[]
  positional: (i: number) => string | null
  reads?: string
  modifies?: string
  risk?: string
}

const PLACEHOLDER_RE = /^<.+>$/

function doc(command: string): CommandDoc | null {
  const d = COMMAND_DOCS[command]
  return d ?? null
}

const LINUX: Record<string, CommandDoc> = {
  pwd: { mnemonic: 'print working directory（打印工作目录）', flags: {}, positional: () => null },
  whoami: { mnemonic: 'who am I（我是谁）', flags: {}, positional: () => null },
  ls: {
    mnemonic: 'list（列出）',
    flags: {
      '-l': '长格式：显示权限、所有者、大小、修改时间',
      '-a': '包含隐藏文件（以 . 开头的文件）',
      '-h': '大小用人类可读格式显示（K/M/G），常与 -l 连用',
      '-R': '递归：把子目录里的内容也列出来',
      '-t': '按修改时间排序',
      '-r': '倒序排列',
    },
    positional: () => '目录：要查看哪个目录，省略则看当前目录',
  },
  cd: {
    mnemonic: 'change directory（切换目录）',
    flags: {},
    positional: (i) => (i === 0 ? '目标目录（必填）；特殊写法：~ 主目录、.. 上一级、/ 根目录' : null),
  },
  cat: {
    mnemonic: 'concatenate（连接并显示文件内容）',
    flags: { '-n': '显示行号' },
    positional: () => '文件：要查看内容的文件',
    reads: '读取指定文件的内容并打印到屏幕',
  },
  head: { mnemonic: 'head（头部）', flags: { '-n': '显示前 N 行，如 -n 5' }, valueFlags: ['-n'], positional: () => '文件：默认显示前 10 行' },
  tail: {
    mnemonic: 'tail（尾部）',
    flags: {
      '-n': '显示末尾 N 行',
      '-f': 'follow：持续跟随文件末尾新写入的内容（日志跟踪）',
    },
    valueFlags: ['-n'],
    positional: () => '文件：默认显示末尾 10 行',
  },
  grep: {
    mnemonic: 'global regular expression print（按正则打印匹配行）',
    flags: {
      '-n': '输出行号',
      '-i': '忽略大小写',
      '-c': '只输出匹配的行数',
      '-v': '反转：输出不匹配的行',
      '-r': '递归搜索目录',
    },
    positional: (i) => (i === 0 ? '模式：要找的文字/正则' : '文件：从哪个文件里找，省略则从标准输入读'),
  },
  find: {
    mnemonic: 'find（查找）',
    flags: {
      '-name': '按名字匹配（支持 * 通配符）',
      '-type': '按类型：f 文件、d 目录',
      '-maxdepth': '最多向下找几层目录',
    },
    valueFlags: ['-name', '-type', '-maxdepth'],
    positional: (i) => (i === 0 ? '起始目录（必填）' : '条件：如 -name "*.txt"'),
  },
  wc: { mnemonic: 'word count（字数统计）', flags: { '-l': '只统计行数' }, positional: () => '文件：要统计的文件' },
  sort: {
    mnemonic: 'sort（排序）',
    flags: { '-n': '按数值排序（默认按字母）', '-r': '倒序', '-t': '指定分隔符', '-k': '按第几列排' },
    valueFlags: ['-t', '-k'],
    positional: () => '文件：要排序的内容',
  },
  uniq: {
    mnemonic: 'unique（去重）',
    flags: { '-c': '统计每个值出现几次', '-d': '只显示重复行' },
    positional: () => '文件：注意通常先 sort 再 uniq 才有效',
  },
  cut: {
    mnemonic: 'cut（剪切）',
    flags: { '-d': '指定分隔符（如 -d ","）', '-f': '取第几列（如 -f 2）' },
    valueFlags: ['-d', '-f'],
    positional: () => '文件：要切列的内容',
  },
  mkdir: { mnemonic: 'make directory（创建目录）', flags: { '-p': '一次性创建多级目录，父目录不存在会自动建' }, positional: () => '目录名（必填）' },
  touch: { mnemonic: 'touch（触碰）', flags: {}, positional: () => '文件名（必填）：不存在则创建空文件，存在则更新修改时间' },
  cp: {
    mnemonic: 'copy（复制）',
    flags: { '-r': '递归：复制目录', '-i': '覆盖前询问' },
    positional: (i) => (i === 0 ? '源（必填）：要复制什么' : '目标（必填）：复制到哪里/叫什么名'),
  },
  mv: {
    mnemonic: 'move（移动/重命名）',
    flags: { '-i': '覆盖前询问' },
    positional: (i) => (i === 0 ? '源（必填）：要移动/重命名的对象' : '目标（必填）：新位置或新名字'),
    risk: '在同一目录内移动就是重命名；目标已存在时可能直接覆盖',
  },
  rm: {
    mnemonic: 'remove（删除）',
    flags: { '-r': '递归：删除目录及其内容', '-f': 'force：不存在的文件不报错' },
    positional: () => '目标（必填）：要删除的文件或目录',
    risk: '删除不可恢复，删除前先 ls 确认',
  },
  echo: { mnemonic: 'echo（回显）', flags: { '-n': '末尾不换行' }, positional: () => '文本：要输出的内容' },
  gzip: {
    mnemonic: 'GNU zip（压缩）',
    flags: { '-k': '保留原文件', '-d': '解压' },
    positional: () => '文件（必填）：压缩后原文件会消失，生成 .gz',
    risk: '默认删除原文件',
  },
  gunzip: { mnemonic: 'GNU unzip（解压）', flags: {}, positional: () => '.gz 文件（必填）：解压后 .gz 消失' },
  tar: {
    mnemonic: 'tape archive（磁带归档）',
    flags: {
      '-c': 'create：打包',
      '-x': 'extract：解包',
      '-z': '用 gzip 压缩/解压（.tar.gz）',
      '-f': '指定归档文件名（必带）',
      '-t': '列出归档内容',
      '-C': '解包到指定目录',
      '-v': '显示处理过程',
    },
    valueFlags: ['-f', '-C'],
    positional: (i) => (i === 0 ? '归档文件名（必填）' : '要打包/解包的路径'),
  },
  ps: {
    mnemonic: 'process status（进程状态）',
    flags: { '-e': '所有进程', '-f': '完整格式', '-aux': '全部用户的详细进程' },
    positional: () => null,
  },
  top: { mnemonic: 'top（顶部）', flags: {}, positional: () => null, reads: '实时刷新显示进程资源占用' },
  kill: {
    mnemonic: 'kill（终止）',
    flags: { '-9': '强制终止（KILL），无法被忽略' },
    positional: () => '进程号 PID（必填）：用 ps 查到',
    risk: '终止进程不可撤销',
  },
  ping: {
    mnemonic: 'ping（探测）',
    flags: { '-c': '发送几次就停（如 -c 3）' },
    valueFlags: ['-c'],
    positional: () => '目标地址（必填）：主机名或 IP',
  },
  curl: {
    mnemonic: 'client URL（URL 客户端）',
    flags: { '-s': '静默模式（不显示进度）', '-o': '输出保存到文件' },
    valueFlags: ['-o'],
    positional: () => 'URL（必填）：要访问的地址',
  },
  ss: {
    mnemonic: 'socket statistics（套接字统计）',
    flags: { '-t': '只显示 TCP', '-l': '只显示监听中的端口', '-n': '用数字显示地址和端口', '-p': '显示占用端口的进程' },
    positional: () => null,
  },
  systemctl: {
    mnemonic: 'system control（系统控制）',
    flags: {},
    positional: (i) =>
      i === 0 ? '动作（必填）：status 查看状态 / start 启动 / stop 停止 / restart 重启 / enable 开机自启' : '服务名（必填）',
    risk: 'start/stop/restart 会改变服务运行状态',
  },
  id: { mnemonic: 'identity（身份）', flags: {}, positional: () => null },
  env: { mnemonic: 'environment（环境变量）', flags: {}, positional: () => null },
  export: {
    mnemonic: 'export（导出）',
    flags: {},
    positional: (i) => (i === 0 ? '变量定义（必填）：如 MY_VAR=hello，之后用 $MY_VAR 取值' : null),
    modifies: '在当前会话中创建/修改环境变量',
  },
  history: { mnemonic: 'history（历史）', flags: {}, positional: () => null },
  clear: { mnemonic: 'clear（清屏）', flags: {}, positional: () => null },
}

const DOCKER: Record<string, CommandDoc> = {
  docker: { mnemonic: 'Docker 客户端', flags: {}, positional: (i) => (i === 0 ? '子命令（必填）：如 run/ps/logs，输入 docker --help 查看全部' : null) },
  version: { mnemonic: '版本', flags: {}, positional: () => null },
  info: { mnemonic: '系统信息', flags: {}, positional: () => null },
  images: { mnemonic: '镜像列表', flags: {}, positional: () => null },
  pull: {
    mnemonic: '拉取镜像',
    flags: {},
    positional: (i) => (i === 0 ? '镜像名（必填）：如 redis、postgres:15（:后是版本标签）' : null),
    modifies: '从仓库下载镜像到本地',
  },
  ps: {
    mnemonic: 'process status（进程状态）',
    flags: { '-a': '包含已停止的容器', '-q': '只输出容器 ID' },
    positional: () => null,
  },
  run: {
    mnemonic: '运行',
    flags: {
      '-d': 'detach：后台运行，不占用终端',
      '--name': '给容器起名字（后面跟名字）',
      '-p': '端口映射：宿主机端口:容器端口，如 8080:80',
      '-e': '注入环境变量：如 -e APP_MODE=prod',
      '-v': '挂载卷/目录：如 -v appdata:/data',
      '--network': '把容器接入指定网络',
      '--rm': '容器停止时自动删除',
      '--memory': '内存上限，如 --memory 128m',
      '--cpus': 'CPU 上限，如 --cpus 0.5',
      '--restart': '重启策略，如 always',
      '--health-cmd': '健康检查命令',
    },
    valueFlags: ['--name', '-p', '-e', '-v', '--network', '--memory', '--cpus', '--restart', '--health-cmd'],
    positional: (i) => (i === 0 ? '镜像名（必填）：最后的参数是要运行的镜像' : null),
    modifies: '创建并启动新容器',
  },
  start: { mnemonic: '启动已停止的容器', flags: {}, positional: () => '容器名/ID（必填）' },
  stop: { mnemonic: '停止容器', flags: {}, positional: () => '容器名/ID（必填）', risk: '停止容器服务' },
  restart: { mnemonic: '重启容器', flags: {}, positional: () => '容器名/ID（必填）' },
  rm: {
    mnemonic: 'remove：删除容器',
    flags: { '-f': '强制删除运行中的容器' },
    positional: () => '容器名/ID（必填）',
    risk: '删除后容器及其文件系统丢失（卷里的数据不丢）',
  },
  rmi: {
    mnemonic: 'remove image：删除镜像',
    flags: { '-f': '强制删除' },
    positional: () => '镜像名（必填）',
    risk: '删除镜像不可恢复，需要重新 pull',
  },
  logs: {
    mnemonic: '日志',
    flags: { '-f': 'follow：持续跟随新日志', '-t': '显示时间戳', '--tail': '只看末尾 N 行' },
    valueFlags: ['--tail'],
    positional: () => '容器名/ID（必填）',
  },
  exec: {
    mnemonic: 'execute：在容器里执行命令',
    flags: { '-it': '交互模式（可输入）' },
    positional: (i) => (i === 0 ? '容器名（必填）' : '要执行的命令（必填），如 ls /app'),
  },
  inspect: { mnemonic: '检查：查看对象的详细信息（JSON 格式）', flags: {}, positional: () => '容器名/镜像名（必填）' },
  network: {
    mnemonic: '网络子命令',
    flags: {},
    positional: (i) => (i === 0 ? '动作（必填）：create 创建 / ls 列表 / inspect 详情' : '网络名'),
  },
  volume: {
    mnemonic: '卷子命令',
    flags: {},
    positional: (i) => (i === 0 ? '动作（必填）：create 创建 / ls 列表 / inspect 详情' : '卷名'),
  },
  build: {
    mnemonic: '构建镜像',
    flags: { '-t': '给镜像命名：名字:标签，如 myapp:v1' },
    positional: (i) => (i === 0 ? '构建上下文（必填）：通常是 . 表示当前目录' : null),
    reads: '读取当前目录的 Dockerfile',
    modifies: '按 Dockerfile 生成新镜像',
  },
  tag: { mnemonic: '给镜像打标签（改名/加版本）', flags: {}, positional: (i) => (i === 0 ? '原镜像名（必填）' : '新标签（必填），如 myapp:latest') },
  history: { mnemonic: '查看镜像的构建历史（每一层做了什么）', flags: {}, positional: () => '镜像名（必填）' },
  compose: {
    mnemonic: 'Compose：按 compose.yaml 批量管理多容器',
    flags: {},
    positional: (i) => (i === 0 ? '动作（必填）：up 启动 / ps 查看 / logs 日志 / stop 停止 / down 停止并清理' : null),
  },
}

const KUBECTL: Record<string, CommandDoc> = {
  kubectl: { mnemonic: 'Kubernetes 控制客户端', flags: {}, positional: (i) => (i === 0 ? '子命令（必填）：如 get/apply/logs' : null) },
  version: { mnemonic: '客户端与服务端版本', flags: { '-o': '输出格式' }, positional: () => null },
  'cluster-info': { mnemonic: '集群信息（控制面地址）', flags: {}, positional: () => null },
  get: {
    mnemonic: 'get（获取资源列表）',
    flags: {
      '-n': '指定命名空间，如 -n kube-system（省略默认 default）',
      '-A': 'all namespaces：所有命名空间',
      '-l': '按标签筛选，如 -l tier=frontend',
      '-o': '输出格式：wide 更多列 / yaml 完整定义 / name 只输出名字',
    },
    valueFlags: ['-n', '-o', '-l'],
    positional: (i) => (i === 0 ? '资源类型（必填）：pods/deployments/services/configmaps/...' : '资源名：可选，指定则只看它'),
  },
  describe: {
    mnemonic: 'describe（描述详情）',
    flags: { '-n': '指定命名空间' },
    positional: (i) => (i === 0 ? '资源类型（必填）：pod/deployment/...' : '资源名（必填）'),
    reads: '显示资源的详细状态和 Events 事件',
  },
  logs: {
    mnemonic: '日志',
    flags: { '-n': '指定命名空间', '-f': '持续跟随', '--tail': '只看末尾 N 行' },
    positional: () => 'Pod 名（必填）',
  },
  create: {
    mnemonic: 'create（创建）',
    flags: {
      '--image': '指定镜像（配合 deployment 使用）',
      '--from-literal': '直接提供键值对（配合 configmap/secret generic 使用）',
      '-n': '指定命名空间',
    },
    valueFlags: ['--image', '--from-literal', '-n'],
    positional: (i) => (i === 0 ? '资源类型（必填）：deployment/namespace/configmap/secret generic/job' : '资源名（必填）'),
    modifies: '创建新资源',
  },
  apply: {
    mnemonic: 'apply（应用声明）',
    flags: { '-f': '指定 YAML 文件（必填）', '-n': '指定命名空间' },
    valueFlags: ['-f', '-n'],
    positional: () => null,
    reads: '读取 YAML 图纸文件',
    modifies: '按图纸创建或更新资源（幂等，可重复执行）',
  },
  expose: {
    mnemonic: 'expose（暴露服务）',
    flags: { '--port': '服务端口（必填）', '--target-port': '转发到 Pod 的哪个端口', '--type': 'ClusterIP/NodePort/LoadBalancer' },
    valueFlags: ['--port', '--target-port', '--type', '-n'],
    positional: (i) => (i === 0 ? '资源类型与名（必填）：如 deployment web' : null),
    modifies: '创建 Service',
  },
  scale: {
    mnemonic: 'scale（缩放副本）',
    flags: { '--replicas': '目标副本数量（必填）' },
    valueFlags: ['--replicas'],
    positional: () => 'deployment <名称>（必填）',
    modifies: '改变副本数量',
  },
  set: {
    mnemonic: 'set（设置）',
    flags: { '-n': '指定命名空间' },
    valueFlags: ['-n'],
    positional: (i) => (i === 0 ? '子命令（必填）：image 修改镜像' : '对象与镜像，如 deployment/web web=nginx:1.25'),
    modifies: '更新部署配置（会触发滚动更新）',
  },
  rollout: {
    mnemonic: 'rollout（发布控制）',
    flags: { '--to-revision': '回滚到指定版本号' },
    valueFlags: ['--to-revision'],
    positional: (i) => (i === 0 ? '动作（必填）：status 发布状态 / history 版本历史 / undo 回滚 / restart 重启' : 'deployment <名称>（必填）'),
    modifies: 'status/history 只读；undo/restart 会触发更新',
  },
  delete: {
    mnemonic: 'delete（删除）',
    flags: { '-n': '指定命名空间', '-f': '按文件删除' },
    valueFlags: ['-n', '-f'],
    positional: () => '资源类型与名（必填）：如 pod hello',
    risk: '删除不可恢复；Deployment 删了 Pod 会自动重建，必须删 Deployment',
  },
  exec: {
    mnemonic: 'execute：进入 Pod 执行命令',
    flags: { '-it': '交互模式', '-n': '指定命名空间' },
    valueFlags: ['-n'],
    positional: (i) => (i === 0 ? 'Pod 名（必填）' : '要执行的命令（必填），-- 后跟命令'),
  },
  config: {
    mnemonic: 'config（kubectl 配置）',
    flags: {},
    positional: (i) => (i === 0 ? '动作（必填）：current-context 当前上下文 / get-contexts 列表 / use-context 切换 / view 查看' : null),
  },
  top: {
    mnemonic: 'top（资源占用）',
    flags: {},
    positional: (i) => (i === 0 ? '资源类型（必填）：node 节点 / pod Pod' : null),
  },
  taint: {
    mnemonic: 'taint（节点标记/门禁）',
    flags: {},
    positional: (i) =>
      i === 0 ? '节点名（必填）' : '标记（必填）：如 gpu=true:NoSchedule；结尾加 - 表示去除',
    modifies: '修改节点的调度门禁',
  },
  edit: { mnemonic: 'edit（编辑）', flags: {}, positional: (i) => (i === 0 ? '资源类型（必填）' : '资源名（必填）') },
  label: {
    mnemonic: 'label（打标签）',
    flags: { '--overwrite': '覆盖已有同名标签' },
    positional: (i) => (i === 0 ? '资源类型与名（必填）：如 pod web-xxx' : '标签（必填）：key=value；key- 表示删除'),
  },
  annotate: {
    mnemonic: 'annotate（加注解）',
    flags: { '--overwrite': '覆盖已有注解' },
    positional: (i) => (i === 0 ? '资源类型与名（必填）' : '注解（必填）：key=value'),
  },
}

const COMMAND_DOCS: Record<string, CommandDoc> = {
  ...LINUX,
  ...DOCKER,
  ...KUBECTL,
}

interface DocLookup {
  d: CommandDoc | null
  argStart: number
}

function lookupDoc(tokens: string[]): DocLookup {
  const root = tokens[0]
  if (root === 'docker') {
    const sub = tokens[1] ? DOCKER[tokens[1]] : undefined
    if (sub) {
      return {
        d: { mnemonic: 'docker ' + tokens[1] + '：' + sub.mnemonic, flags: sub.flags, valueFlags: sub.valueFlags, positional: sub.positional, reads: sub.reads, modifies: sub.modifies, risk: sub.risk },
        argStart: 2,
      }
    }
    return { d: DOCKER['docker'], argStart: 1 }
  }
  if (root === 'kubectl') {
    const sub = tokens[1] ? KUBECTL[tokens[1]] : undefined
    if (sub) {
      return {
        d: { mnemonic: 'kubectl ' + tokens[1] + '：' + sub.mnemonic, flags: sub.flags, valueFlags: sub.valueFlags, positional: sub.positional, reads: sub.reads, modifies: sub.modifies, risk: sub.risk },
        argStart: 2,
      }
    }
    return { d: KUBECTL['kubectl'], argStart: 1 }
  }
  return { d: LINUX[root] ?? null, argStart: 1 }
}

export function explainCommand(line: string): CommandExplain | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const tokens = trimmed.split(/\s+/)
  const name = tokens[0]
  const lookup = lookupDoc(tokens)
  const d = lookup.d
  const explain: CommandExplain = {
    command: name,
    mnemonic: d?.mnemonic,
    args: [],
    reads: d?.reads,
    modifies: d?.modifies,
    risk: d?.risk,
  }
  if (!d) {
    if (name.includes('.')) {
      explain.mnemonic = '文件名/脚本（以 . 开头通常表示相对路径中的可执行文件）'
    } else {
      return null
    }
  }
  let positionalIndex = 0
  for (let i = lookup.argStart; i < tokens.length; i++) {
    const t = tokens[i]
    if (PLACEHOLDER_RE.test(t)) {
      explain.args.push({ token: t, meaning: '占位符：< > 里的内容要替换成任务给出的真实值，不能照抄', isPlaceholder: true })
      continue
    }
    const flagMean = d?.flags[t]
    if (t.startsWith('-') && flagMean) {
      explain.args.push({ token: t, meaning: flagMean, isPlaceholder: false })
      if (d?.valueFlags?.includes(t) && i + 1 < tokens.length) {
        explain.args.push({ token: tokens[i + 1], meaning: `是选项 ${t} 的值（要替换成实际内容）`, isPlaceholder: false })
        i += 1
      }
      continue
    }
    if (t.startsWith('-') && t.length > 2 && !t.startsWith('--')) {
      const shorts = t.slice(1).split('').map((c) => '-' + c)
      const joined = shorts.map((s) => d?.flags[s] ?? `短选项 ${s}：改变命令行为（man ${name} 可查）`).join('；')
      explain.args.push({ token: t, meaning: '合并的短选项：' + joined, isPlaceholder: false })
      continue
    }
    if (t.startsWith('-')) {
      explain.args.push({ token: t, meaning: `选项：改变命令行为（man ${name} 查看支持列表）`, isPlaceholder: false })
      continue
    }
    const pos = d ? d.positional(positionalIndex) : '值：需要替换的内容'
    explain.args.push({ token: t, meaning: pos ?? '值：需要替换的内容', isPlaceholder: false })
    positionalIndex += 1
  }
  return explain
}

const TABLE_LAYOUTS: { match: RegExp; title: string; fields: TableField[] }[] = [
  {
    match: /docker ps/,
    title: 'docker ps 输出',
    fields: [
      { field: 'CONTAINER ID', meaning: '容器 ID（唯一编号，前几位即可）' },
      { field: 'IMAGE', meaning: '容器基于哪个镜像' },
      { field: 'COMMAND', meaning: '容器启动时执行的命令' },
      { field: 'CREATED', meaning: '创建时间' },
      { field: 'STATUS', meaning: '运行状态：Up 运行中 / Exited 已退出 / Restarting 反复重启' },
      { field: 'PORTS', meaning: '端口映射：8080->80 表示宿主机 8080 转发到容器 80' },
      { field: 'NAMES', meaning: '容器名（操作时用这个名字）' },
    ],
  },
  {
    match: /kubectl get pods/,
    title: 'kubectl get pods 输出',
    fields: [
      { field: 'NAME', meaning: 'Pod 名：xxx-xxxx-1，含所属资源名和编号' },
      { field: 'READY', meaning: '就绪数/总数：如 1/1 表示容器全部就绪可接流量；0/1 表示探针未通过' },
      { field: 'STATUS', meaning: '状态：Running 运行 / Pending 排队中 / CrashLoopBackOff 反复崩溃 / OOMKilled 内存被杀 / Completed 任务完成' },
      { field: 'RESTARTS', meaning: '容器重启次数（异常时该值会涨）' },
      { field: 'AGE', meaning: '已存在的时间' },
    ],
  },
  {
    match: /kubectl get deployments/,
    title: 'kubectl get deployments 输出',
    fields: [
      { field: 'NAME', meaning: 'Deployment 名' },
      { field: 'READY', meaning: '当前可用副本/期望副本' },
      { field: 'UP-TO-DATE', meaning: '已更新到最新版本的副本数' },
      { field: 'AVAILABLE', meaning: '对外可用的副本数' },
      { field: 'AGE', meaning: '已存在时间' },
    ],
  },
  {
    match: /kubectl get services/,
    title: 'kubectl get services 输出',
    fields: [
      { field: 'NAME', meaning: 'Service 名' },
      { field: 'TYPE', meaning: '类型：ClusterIP 集群内访问 / NodePort 可通过节点端口访问' },
      { field: 'CLUSTER-IP', meaning: '集群内部虚拟 IP' },
      { field: 'EXTERNAL-IP', meaning: '外部 IP（None 表示没有）' },
      { field: 'PORT(S)', meaning: '端口映射：如 80:3xxxx/TCP，前者服务端口，后者节点暴露端口' },
      { field: 'AGE', meaning: '已存在时间' },
    ],
  },
  {
    match: /kubectl get nodes/,
    title: 'kubectl get nodes 输出',
    fields: [
      { field: 'NAME', meaning: '节点名（机器名）' },
      { field: 'STATUS', meaning: 'Ready 健康 / NotReady 异常' },
      { field: 'ROLES', meaning: '节点角色' },
      { field: 'AGE', meaning: '加入集群时间' },
      { field: 'VERSION', meaning: 'kubelet 版本' },
    ],
  },
  {
    match: /kubectl get namespaces/,
    title: 'kubectl get namespaces 输出',
    fields: [
      { field: 'NAME', meaning: '命名空间名' },
      { field: 'STATUS', meaning: 'Active 可用 / Terminating 删除中' },
      { field: 'AGE', meaning: '存在时间' },
    ],
  },
  {
    match: /kubectl get (pvc|persistentvolumeclaim)/,
    title: 'kubectl get pvc 输出',
    fields: [
      { field: 'NAME', meaning: 'PVC 名（领料单）' },
      { field: 'STATUS', meaning: 'Bound 已绑定仓库 / Pending 未匹配到 PV / Lost' },
      { field: 'CAPACITY', meaning: '申请到的容量' },
      { field: 'ACCESS MODES', meaning: '访问模式（RWO 单节点读写等）' },
      { field: 'STORAGECLASS', meaning: '存储类' },
      { field: 'VOLUME', meaning: '绑定的 PV 名' },
    ],
  },
  {
    match: /kubectl get (rs|replicaset)/,
    title: 'kubectl get rs 输出',
    fields: [
      { field: 'NAME', meaning: 'ReplicaSet 名（含版本号）' },
      { field: 'DESIRED', meaning: '期望副本数' },
      { field: 'CURRENT', meaning: '当前副本数' },
      { field: 'READY', meaning: '就绪副本数' },
      { field: 'AGE', meaning: '存在时间' },
    ],
  },
  {
    match: /kubectl get jobs/,
    title: 'kubectl get jobs 输出',
    fields: [
      { field: 'NAME', meaning: 'Job 名' },
      { field: 'STATUS', meaning: '状态' },
      { field: 'COMPLETIONS', meaning: '完成数/总数：1/1 表示任务成功完成' },
      { field: 'DURATION', meaning: '耗时' },
      { field: 'AGE', meaning: '存在时间' },
    ],
  },
  {
    match: /kubectl get cronjobs/,
    title: 'kubectl get cronjobs 输出',
    fields: [
      { field: 'NAME', meaning: 'CronJob 名' },
      { field: 'SCHEDULE', meaning: '定时表达式，如 */1 * * * * 表示每分钟' },
      { field: 'SUSPEND', meaning: '是否暂停' },
      { field: 'ACTIVE', meaning: '正在运行的 Job 数' },
      { field: 'LAST SCHEDULE', meaning: '上次调度时间' },
    ],
  },
  {
    match: /kubectl get endpoints/,
    title: 'kubectl get endpoints 输出',
    fields: [
      { field: 'NAME', meaning: 'Service 名' },
      { field: 'ENDPOINTS', meaning: '背后的 Pod 地址列表；为空说明 selector 没匹配到任何 Pod' },
      { field: 'AGE', meaning: '存在时间' },
    ],
  },
  {
    match: /^ *PID|^ *USER *PID/,
    title: 'ps 输出',
    fields: [
      { field: 'USER', meaning: '进程所属用户' },
      { field: 'PID', meaning: '进程号（kill 时用）' },
      { field: '%CPU / %MEM', meaning: 'CPU/内存占用百分比' },
      { field: 'STAT', meaning: '进程状态字母（S 睡眠 / R 运行 / Z 僵尸等）' },
      { field: 'COMMAND / CMD', meaning: '启动进程的命令' },
    ],
  },
]

export function explainOutput(line: string, stdout: string): TableField[] | null {
  for (const layout of TABLE_LAYOUTS) {
    if (layout.match.test(line.trim())) return layout.fields
  }
  const head = stdout.split('\n')[0] ?? ''
  if (head.includes('USER') && head.includes('PID')) {
    return TABLE_LAYOUTS[TABLE_LAYOUTS.length - 1].fields
  }
  return null
}
