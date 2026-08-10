import type { SimState } from '../sim/types'
import { addRunningContainer, addDeploymentPreset, createInitialState } from '../sim/state/build'
import { pushEvent } from '../sim/kubernetes/state'
import { addService } from '../sim/linux/services'
import { cloneNode, IMAGE_CATALOG, buildImageFs, containerId } from '../sim/docker/state'
import { getParent, walk } from '../sim/vfs/paths'
import {
  fsContent,
  fsExists,
  fsIsDir,
  fsIsFile,
  fsMode,
  fsOwner,
  fsReadWritableByStudent,
  historyHas,
  historyRan,
  historyRanAny,
  historyFailed,
  serviceStatus,
  type Lab,
} from './validate'

export const CATEGORIES = [
  '终端与路径',
  '文件操作',
  '文本处理',
  '权限与进程',
  '网络与服务',
  'Docker 基础',
  'Docker 镜像与容器',
  'Docker 网络与存储',
  'Docker 构建与编排',
  'Docker 进阶与排障',
  'Kubernetes 基础',
  'Pod 与 Deployment',
  '配置与存储',
  '调度与任务',
  'Service 与排障',
]

type K8sPodT = SimState['k8s']['pods'][number]
type K8sDepT = SimState['k8s']['deployments'][number]
type K8sSvcT = SimState['k8s']['services'][number]
type K8sNodeT = SimState['k8s']['nodes'][number]

function k8sNamespace(s: SimState, name: string): boolean {
  return s.k8s.namespaces.includes(name)
}

function k8sPod(s: SimState, name: string, ns = 'default', pred?: (p: K8sPodT) => boolean): boolean {
  const p = s.k8s.pods.find((x) => x.name === name && x.namespace === ns)
  return !!p && (pred ? pred(p) : true)
}

function k8sDeployment(s: SimState, name: string, ns = 'default', pred?: (d: K8sDepT) => boolean): boolean {
  const d = s.k8s.deployments.find((x) => x.name === name && x.namespace === ns)
  return !!d && (pred ? pred(d) : true)
}

function k8sService(s: SimState, name: string, ns = 'default', pred?: (x: K8sSvcT) => boolean): boolean {
  const x = s.k8s.services.find((v) => v.name === name && v.namespace === ns)
  return !!x && (pred ? pred(x) : true)
}

function k8sConfigMap(s: SimState, name: string, ns = 'default', pred?: (x: SimState['k8s']['configmaps'][number]) => boolean): boolean {
  const x = s.k8s.configmaps.find((v) => v.name === name && v.namespace === ns)
  return !!x && (pred ? pred(x) : true)
}

function k8sSecret(s: SimState, name: string, ns = 'default', pred?: (x: SimState['k8s']['secrets'][number]) => boolean): boolean {
  const x = s.k8s.secrets.find((v) => v.name === name && v.namespace === ns)
  return !!x && (pred ? pred(x) : true)
}

function k8sJob(s: SimState, name: string, ns = 'default', pred?: (x: SimState['k8s']['jobs'][number]) => boolean): boolean {
  const x = s.k8s.jobs.find((v) => v.name === name && v.namespace === ns)
  return !!x && (pred ? pred(x) : true)
}

function k8sCronJob(s: SimState, name: string, ns = 'default', pred?: (x: SimState['k8s']['cronjobs'][number]) => boolean): boolean {
  const x = s.k8s.cronjobs.find((v) => v.name === name && v.namespace === ns)
  return !!x && (pred ? pred(x) : true)
}

function k8sPVC(s: SimState, name: string, ns = 'default', pred?: (x: SimState['k8s']['pvcs'][number]) => boolean): boolean {
  const x = s.k8s.pvcs.find((v) => v.name === name && v.namespace === ns)
  return !!x && (pred ? pred(x) : true)
}

function k8sPV(s: SimState, name: string, pred?: (x: SimState['k8s']['pvs'][number]) => boolean): boolean {
  const x = s.k8s.pvs.find((v) => v.name === name)
  return !!x && (pred ? pred(x) : true)
}

function k8sNode(s: SimState, name: string, pred?: (n: K8sNodeT) => boolean): boolean {
  const n = s.k8s.nodes.find((x) => x.name === name)
  return !!n && (pred ? pred(n) : true)
}

function k8sDepPods(s: SimState, name: string, ns = 'default'): K8sPodT[] {
  return s.k8s.pods.filter((p) => p.owner === name && p.namespace === ns)
}

function putFile(state: SimState, abs: string, content: string, mode = 0o644, uid = 1000, gid = 1000): void {
  const par = getParent(state.fsRoot, abs)
  if (!par) return
  par.parent.children![par.name] = { kind: 'file', name: par.name, content, mode, uid, gid, mtime: state.clock }
}

function putDir(state: SimState, abs: string, mode = 0o755): void {
  const par = getParent(state.fsRoot, abs)
  if (!par || walk(state.fsRoot, abs)) return
  par.parent.children![par.name] = { kind: 'dir', name: par.name, content: '', mode, uid: 1000, gid: 1000, mtime: state.clock, children: {} }
}

function setMode(state: SimState, abs: string, mode: number): void {
  const node = walk(state.fsRoot, abs)
  if (node) node.mode = mode
}

function setOwner(state: SimState, abs: string, uid: number, gid: number): void {
  const node = walk(state.fsRoot, abs)
  if (node) {
    node.uid = uid
    node.gid = gid
  }
}

function hasPipeGrepWc(s: SimState): boolean {
  return s.history.some((l, i) => /\|/.test(l) && /grep/.test(l) && /wc/.test(l) && s.exitCodes?.[i] === 0)
}

function ranLsL(s: SimState): boolean {
  return historyRan(s, /^ls\b.*-l/) || historyRan(s, /^ll\b/)
}

function dockerImageExists(s: SimState, repo: string, tag = 'latest'): boolean {
  return s.docker.images.some((i) => i.repository === repo && i.tag === tag)
}

function dockerContainer(s: SimState, name: string, pred?: (c: SimState['docker']['containers'][number]) => boolean): boolean {
  const ctr = s.docker.containers.find((c) => c.name === name)
  return !!ctr && (pred ? pred(ctr) : true)
}

function dockerNetworkExists(s: SimState, name: string): boolean {
  return s.docker.networks.some((n) => n.name === name)
}

function dockerVolumeExists(s: SimState, name: string): boolean {
  return s.docker.volumes.some((v) => v.name === name)
}

function fileContains(s: SimState, path: string, re: RegExp): boolean {
  const node = walk(s.fsRoot, path)
  return !!node && node.kind === 'file' && re.test(node.content)
}

export const LABS: Lab[] = [
  {
    id: 'linux-pwd',
    mode: 'linux',
    category: '终端与路径',
    title: '认识终端：whoami / pwd / history',
    difficulty: '入门',
    estimatedMinutes: 5,
    prerequisites: [],
    summary:
      '终端就像 Linux 的"对讲机"：你敲一行命令，系统立刻回话。提示符（prompt）会告诉你"我是谁、我在哪"。whoami 回答"我是谁"（当前用户），pwd 回答"我在哪"（当前目录），ls 回答"这里有什么"（目录内容），history 回看敲过的命令，clear 把屏幕擦干净。',
    initialEnv: '你已登录到 CmdLab Linux，当前目录是 /home/student（简写为 ~）。家目录下有一些练习文件和目录。',
    description: '第一次打开终端：先确认自己的身份和位置，再看看目录里有什么。',
    goals: ['认识终端提示符', 'whoami 查看当前用户', 'pwd 查看当前目录', 'ls 查看目录内容', 'history 与 clear'],
    steps: [
      { id: 's1', label: '用 whoami 查看当前登录用户', check: (s) => historyRan(s, /^whoami\b/) },
      { id: 's2', label: '用 pwd 查看当前所在目录', check: (s) => historyRan(s, /^pwd\b/) },
      { id: 's3', label: '用 ls 查看当前目录的内容', check: (s) => historyRan(s, /^ls\b/) },
      { id: 's4', label: '用 history 查看刚才执行过的命令', check: (s) => historyRan(s, /^history\b/) },
      { id: 's5', label: '用 clear 清空屏幕', check: (s) => historyRan(s, /^clear\b/) },
    ],
    hints: [
      ['提示 1：每个命令都是输入命令名后按回车执行，就像按下对讲机的通话键。', '提示 2：依次输入 whoami、pwd、ls、history、clear，观察每个命令回话的内容。'],
      ['提示 3：history 会列出所有执行过的命令；clear 会清空屏幕内容（提示符会重新出现）。'],
    ],
    commonErrors: [
      { cmd: 'pwd /home/student', explanation: 'pwd 不需要参数，它只显示当前目录。', hint: '直接输入 pwd。' },
      { cmd: 'dir', explanation: 'Linux 中查看目录内容用的是 ls，不是 Windows 的 dir。', hint: '输入 ls。' },
      { cmd: 'whoami student', explanation: 'whoami 不接受参数，直接执行即可。', hint: '输入 whoami。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-ls',
    mode: 'linux',
    category: '终端与路径',
    title: 'ls：查看文件列表',
    difficulty: '入门',
    estimatedMinutes: 8,
    prerequisites: ['linux-pwd'],
    summary:
      'ls 是"照相机"，帮你看清目录里到底有什么。直接 ls 只看普通内容；ls -a 连以点开头的隐藏文件也显示（如 .bashrc）；ls -l 显示文件的"身份证"（权限、所有者、大小、时间）；ls -lh 把大小换算成 K/M 等单位，人类一眼可读。',
    initialEnv:
      '当前目录 /home/student 下有 projects、data、backup、logs 等目录，以及 .bashrc、.profile 两个隐藏文件；/var/log 下有日志文件。',
    description: '学会用 ls 的各种选项，看清目录里的文件和它们的详细信息。',
    goals: ['ls 基础用法', 'ls -a 显示隐藏文件', 'ls -l 长格式', 'ls -lh 人类可读大小'],
    steps: [
      { id: 's1', label: '用 ls 查看当前目录内容', check: (s) => historyRan(s, /^ls\b/) },
      { id: 's2', label: '用 ls -a 显示包括隐藏文件在内的所有条目', check: (s) => historyRan(s, /^ls\b.*-a/) },
      { id: 's3', label: '用 ls -l 查看长格式（权限、所有者、大小）', check: ranLsL },
      { id: 's4', label: '用 ls -lh /var/log 查看日志目录（人类可读大小）', check: (s) => historyRan(s, /^ls\b.*-lh/) },
    ],
    hints: [
      ['提示 1：隐藏文件以点开头，普通 ls 不会显示它们，就像默认"隐身"。', '提示 2：ls -a 会显示 .bashrc 这样的隐藏文件；ls -l 显示权限和大小等详情。'],
      ['提示 3：ls -lh /var/log 中 -h 需要配合 -l 使用，把字节数换算成 K/M；日志目录里有 big.log 等文件。'],
    ],
    commonErrors: [
      { cmd: 'ls -h', explanation: '-h 单独使用没有意义，它必须和 -l 搭配（-lh）才能把大小换算为 K/M。', hint: '用 ls -lh 或 ls -l -h。' },
      { cmd: 'dir', explanation: 'Linux 中查看目录内容用 ls。', hint: '输入 ls。' },
      { cmd: 'ls -a /nonexistent', explanation: '目录不存在会报错，先确认路径正确。', hint: '直接 ls -a 查看当前目录。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-cd',
    mode: 'linux',
    category: '终端与路径',
    title: 'cd 与路径：绝对路径和相对路径',
    difficulty: '入门',
    estimatedMinutes: 10,
    prerequisites: ['linux-ls'],
    summary:
      '路径就是文件在目录树里的"门牌号"。绝对路径以 / 开头、从根目录写起（如 /var/log），任何位置都能直接找到；相对路径从当前位置出发，写起来更短。cd 负责"移动"：cd projects 走进子目录；. 表示当前目录，.. 是上一级（相当于"返回"），~ 是你家目录的快捷方式（/home/student）。',
    initialEnv:
      '当前目录是 /home/student，其中有 projects、data 等目录；系统根目录下有 /var/log、/etc 等目录。',
    description: '掌握 cd 与路径知识，在目录树中自由穿梭。',
    goals: ['cd 切换目录', '绝对路径与相对路径', '. 和 ..', '~ 家目录'],
    steps: [
      { id: 's1', label: '用相对路径 cd 进入 projects 目录', check: (s) => historyRan(s, /^cd\s+projects(\s|$)/) },
      { id: 's2', label: '用绝对路径 cd 到 /var/log', check: (s) => historyRan(s, /^cd\s+\/var\/log(\s|$)/) },
      { id: 's3', label: '用 cd .. 返回上一级目录', check: (s) => historyRan(s, /^cd\s+\.\.(\s|$)/) },
      { id: 's4', label: '用 cd ~ 回到家目录', check: (s) => s.cwd === '/home/student' },
    ],
    hints: [
      ['提示 1：cd 后跟要去的目录，如 cd projects（相对路径，从当前位置出发）。', '提示 2：绝对路径以 / 开头：cd /var/log 从根目录一路找过去；.. 表示上一级：cd .. 相当于"返回上一层"。'],
      ['提示 3：cd ~ 回到家目录（等价于 cd /home/student）；用 pwd 随时确认当前位置。'],
    ],
    commonErrors: [
      { cmd: 'cd notes.txt', explanation: 'notes.txt 是文件不是目录，cd 会报 Not a directory。', hint: 'cd 只能进入目录。' },
      { cmd: 'cd /home/student/project', explanation: '目录名拼写错误（少了一个 s）。', hint: '目录是 projects。' },
      { cmd: 'cd', explanation: '直接 cd 会回到家目录，但本步骤要求相对路径进入 projects。', hint: '输入 cd projects。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-touch-mkdir',
    mode: 'linux',
    category: '文件操作',
    title: '创建目录与文件：mkdir / touch',
    difficulty: '入门',
    estimatedMinutes: 10,
    prerequisites: ['linux-cd'],
    summary:
      'mkdir 是"盖文件夹"：mkdir 名字 创建目录；mkdir -p a/b/c 能一次盖好几层，中间目录不存在也会自动补齐（像全自动施工队）。touch 是"造文件"：文件不存在就创建空文件，已存在则只更新时间戳（相当于按了一下"刷新"）。',
    initialEnv: '当前目录是 /home/student，目前没有名为 work 的目录。',
    description: '创建自己的练习目录和文件，为后面的课程做准备。',
    goals: ['mkdir 创建目录', 'mkdir -p 创建多级目录', 'touch 创建空文件'],
    steps: [
      { id: 's1', label: '创建 work 目录', check: (s) => fsIsDir(s, '/home/student/work') },
      { id: 's2', label: '用 mkdir -p 一次性创建多级目录 work/projects/web', check: (s) => fsIsDir(s, '/home/student/work/projects/web') },
      { id: 's3', label: '在 work 目录创建 notes.txt', check: (s) => fsIsFile(s, '/home/student/work/notes.txt') },
      { id: 's4', label: '在 web 目录创建 app.js', check: (s) => fsIsFile(s, '/home/student/work/projects/web/app.js') },
    ],
    hints: [
      ['提示 1：mkdir 目录名 创建目录；touch 文件名 创建空文件（已存在则只更新时间戳）。', '提示 2：mkdir -p work/projects/web 会一次创建所有中间目录，省去逐层创建。'],
      ['提示 3：用相对路径即可：touch work/notes.txt 和 touch work/projects/web/app.js；用 ls 或 ls -R 验证。'],
    ],
    commonErrors: [
      { cmd: 'mkdir work/projects/web', explanation: '父目录 work 和 work/projects 还不存在，会报 No such file or directory。', hint: '加 -p：mkdir -p work/projects/web。' },
      { cmd: 'touch work', explanation: 'work 已经存在（目录），touch 只是更新它的时间戳。', hint: 'touch work/notes.txt。' },
      { cmd: 'mkdir /root/test', explanation: '/root 是 root 用户的家目录，student 没有权限创建。', hint: '在你的家目录下创建。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-cp-mv',
    mode: 'linux',
    category: '文件操作',
    title: '复制与移动：cp / mv',
    difficulty: '基础',
    estimatedMinutes: 10,
    prerequisites: ['linux-touch-mkdir'],
    summary:
      'cp 是"复印机"，mv 是"搬运工"。cp 源文件 目标 复制出副本；目录里内容多，必须加 -r 才能整棵复制（否则系统嫌太重，报 omitting directory）。mv 源 目标 把文件搬走，如果目标就在同一个目录里，就相当于换了个名字——移动和重命名其实是同一个命令。',
    initialEnv: '家目录下有 projects 目录，里面有 readme.md、todo.txt 和 src 子目录。',
    description: '练习复制文件、复制整个目录，以及移动和重命名文件。',
    goals: ['cp 复制文件', 'cp -r 复制目录', 'mv 移动文件', 'mv 重命名'],
    steps: [
      { id: 's1', label: '复制 readme.md 为 readme-copy.md', check: (s) => fsIsFile(s, '/home/student/projects/readme-copy.md') && fsIsFile(s, '/home/student/projects/readme.md') },
      { id: 's2', label: '复制整个 projects 目录为 projects-backup', check: (s) => fsIsDir(s, '/home/student/projects-backup') && fsIsFile(s, '/home/student/projects-backup/src/main.py') },
      { id: 's3', label: '把 todo.txt 从 projects 移到 home 目录', check: (s) => !fsExists(s, '/home/student/projects/todo.txt') },
      { id: 's4', label: '把 todo.txt 重命名为 todo-final.txt', check: (s) => fsIsFile(s, '/home/student/todo-final.txt') && !fsExists(s, '/home/student/todo.txt') },
    ],
    hints: [
      ['提示 1：cp 源文件 目标文件；复制目录要加 -r（目录里内容多，需要递归整棵复制）。', '提示 2：cp -r projects projects-backup 把整个目录复制一份；mv projects/todo.txt todo.txt 把文件从 projects 搬到家目录。'],
      ['提示 3：同一个目录内 mv a.txt b.txt 就是重命名。用 ls -R projects-backup 验证复制成功。'],
    ],
    commonErrors: [
      { cmd: 'cp projects projects-backup', explanation: '复制目录必须加 -r，否则报 omitting directory。', hint: 'cp -r projects projects-backup。' },
      { cmd: 'mv todo.txt projects', explanation: 'todo.txt 在 projects 里，要先写对源路径。', hint: 'mv projects/todo.txt todo.txt。' },
      { cmd: 'cp -r projects', explanation: '复制必须同时指定源和目标。', hint: 'cp -r projects projects-backup。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-rm',
    mode: 'linux',
    category: '文件操作',
    title: '删除：rm / rm -r / rm -f',
    difficulty: '基础',
    estimatedMinutes: 8,
    prerequisites: ['linux-cp-mv'],
    summary:
      'rm 是"碎纸机"：删掉的文件不会进回收站，删了就没了。rm 文件名 删除文件；目录里东西多，必须加 -r 才能连目录一起删；-f 表示"不废话"——文件不存在也不报错、不询问。rm -rf / 这类危险命令会被模拟器拦截，真实系统同样保护根目录。',
    initialEnv: '家目录下有一个 trash 目录（内有 junk1.txt、junk2.txt）和一个 scratch.txt 文件。',
    description: '学会安全地删除文件与目录，并理解 -f 的作用。',
    goals: ['rm 删除文件', 'rm -r 删除目录', 'rm -f 强制删除'],
    steps: [
      { id: 's1', label: '删除 scratch.txt', check: (s) => !fsExists(s, '/home/student/scratch.txt') },
      { id: 's2', label: '删除 trash 目录里的 junk1.txt', check: (s) => !fsExists(s, '/home/student/trash/junk1.txt') },
      { id: 's3', label: '删除整个 trash 目录', check: (s) => !fsExists(s, '/home/student/trash') },
      { id: 's4', label: '用 rm -f 删除不存在的文件（不报错）', check: (s) => historyHas(s, /^rm\b.*-f/) },
    ],
    hints: [
      ['提示 1：rm 文件名 删除文件（删除不可恢复，先确认再删）；直接 rm 目录会报 Is a directory。', '提示 2：删除目录加 -r：rm -r trash 连目录带里面的文件一起删掉。'],
      ['提示 3：rm -f 对不存在的文件不会报错：rm -f ghost.txt，试试不存在的名字。'],
    ],
    commonErrors: [
      { cmd: 'rm trash', explanation: 'trash 是目录，不加 -r 会报 Is a directory。', hint: 'rm -r trash。' },
      { cmd: 'rm -f /', explanation: '模拟器会拦截对根目录的危险删除操作（real Linux 也有同样保护）。', hint: '学习到 -f 的作用即可，不要删除系统目录。' },
      { cmd: 'rm -r junk1.txt', explanation: 'junk1.txt 是文件不是目录，-r 没有必要。', hint: '直接 rm trash/junk1.txt。' },
    ],
    build: () => {
      const s = createInitialState()
      putDir(s, '/home/student/trash')
      putFile(s, '/home/student/trash/junk1.txt', 'junk one\n')
      putFile(s, '/home/student/trash/junk2.txt', 'junk two\n')
      putFile(s, '/home/student/scratch.txt', 'temporary file\n')
      return s
    },
  },
  {
    id: 'linux-archive',
    mode: 'linux',
    category: '文件操作',
    title: '打包压缩：tar 与 gzip',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['linux-cp-mv'],
    summary:
      'gzip 压缩**单个文件**：gzip 文件名 生成 .gz 并删除原文件（-k 保留原文件）；gunzip 文件名.gz（或 gzip -d）解压恢复。tar 把**多个文件/目录**打包成一个归档：tar -czf 包名.tar.gz 目录 打包并压缩；tar -tf 查看包内容；tar -xf 包名 -C 目录 解包到指定目录。gzip 管单个文件，tar 管目录，两者常组合使用。',
    initialEnv: '家目录下有 backup 目录，包含 file1.txt、file2.txt 和 notes.md。',
    description: '按顺序完成：压缩单个文件 → 解压恢复 → 打包整个目录 → 解包验证。',
    goals: ['gzip 压缩单个文件', 'gunzip 解压恢复', 'tar -czf 打包压缩目录', 'tar -xf 解包'],
    steps: [
      { id: 's1', label: '用 gzip 压缩 backup/file1.txt', check: (s) => historyRan(s, /^gzip\b.*file1\.txt/) },
      { id: 's2', label: '用 gunzip 恢复 file1.txt', check: (s) => historyRan(s, /^gunzip\b.*file1\.txt/) },
      { id: 's3', label: '用 tar -czf 把 backup 目录打包压缩', check: (s) => fsIsFile(s, '/home/student/backup.tar.gz') },
      { id: 's4', label: '创建 restore 目录（用于解包）', check: (s) => fsIsDir(s, '/home/student/restore') },
      { id: 's5', label: '解包到 restore 目录并确认内容', check: (s) => {
        const node = walk(s.fsRoot, '/home/student/restore/backup')
        const hasContent = !!node && node.kind === 'dir' && !!node.children && Object.keys(node.children).length > 0
        return hasContent && historyRan(s, /^tar\b.*-x/) && historyRan(s, /^ls\b.*restore/)
      } },
    ],
    hints: [
      ['第 1 步：gzip backup/file1.txt → 生成 backup/file1.txt.gz，原文件消失（这是 gzip 默认行为，正常现象）。', '第 2 步：gunzip backup/file1.txt.gz → file1.txt 恢复，.gz 消失。'],
      ['第 3 步：tar -czf backup.tar.gz backup → 把整个 backup 目录打包压缩成一个文件（注意：备份目录后没有 /）。', '第 4 步：mkdir restore 创建解包目标目录。'],
      ['第 5 步：tar -xf backup.tar.gz -C restore → 解包到 restore；用 ls -R restore 应看到 restore/backup/file1.txt 等。', '验证：cat backup.tar.gz 会看到乱码（归档是二进制格式），用 tar -tf backup.tar.gz 查看包内清单。'],
    ],
    commonErrors: [
      { cmd: 'gzip backup', explanation: 'gzip 只能压缩单个文件，不能压缩目录（目录会报 Is a directory）。', hint: '目录用 tar 打包：tar -czf backup.tar.gz backup。' },
      { cmd: 'tar -xf backup.tar.gz -C restore', explanation: 'restore 目录不存在时会报 Cannot open。', hint: '先 mkdir restore 再解包。' },
      { cmd: 'gunzip backup.tar.gz', explanation: 'backup.tar.gz 是 tar 打包的归档，不是单个文件的 gzip。', hint: '归档用 tar -xf 解包，gzip 只处理单文件。' },
      { cmd: 'tar -czf backup.tar.gz backup/ 或带其他多余参数', explanation: '打包路径写 backup（不带结尾斜杠）即可；参数太多或写法不对会报错。', hint: '完整写法：tar -czf backup.tar.gz backup。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-text-view',
    mode: 'linux',
    category: '文本处理',
    title: '查看文件内容：cat / head / tail',
    difficulty: '基础',
    estimatedMinutes: 10,
    prerequisites: ['linux-rm'],
    summary:
      'cat、head、tail 是"看文件"三兄弟：cat 把整个文件从头到尾打印出来（适合小文件）；head 只看开头（默认前 10 行），像翻开书只看第一页；tail 只看末尾（默认 10 行），像先看故事的结局；tail -f 是"直播模式"，新写入的行会持续刷出来，真实系统里盯日志就用它（Ctrl+C 退出）。',
    initialEnv: '/var/log/app.log 是一份应用日志，包含 INFO、WARN、ERROR 等不同类型的内容，共 16 行。',
    description: '用不同的方式查看日志文件的内容。',
    goals: ['cat 查看整个文件', 'head -n 查看开头', 'tail -n 查看末尾', 'tail -f 跟随模式'],
    steps: [
      { id: 's1', label: '用 cat 查看 /var/log/app.log 全部内容', check: (s) => historyRan(s, /^cat\b.*app\.log/) },
      { id: 's2', label: '用 head -5 查看前 5 行', check: (s) => historyRan(s, /^head\b.*app\.log/) },
      { id: 's3', label: '用 tail -5 查看末尾 5 行', check: (s) => historyRan(s, /^tail\b.*app\.log/) },
      { id: 's4', label: '用 tail -f 体验跟随日志', check: (s) => historyRan(s, /^tail\b.*-f/) },
    ],
    hints: [
      ['提示 1：文件在 /var/log 下，不在家目录，先 ls /var/log 确认。', '提示 2：head -5 /var/log/app.log 显示前 5 行；tail -5 显示末尾 5 行（不带 -5 时默认 10 行）。'],
      ['提示 3：tail -f 会持续显示新写入的行，适合"盯"日志；本模拟器会显示说明文字（真实系统按 Ctrl+C 退出）。'],
    ],
    commonErrors: [
      { cmd: 'cat /var/log', explanation: '/var/log 是目录，cat 会报 Is a directory。', hint: 'cat 目标要是文件：cat /var/log/app.log。' },
      { cmd: 'head /var/log/app.log -5', explanation: '参数顺序不对，-5 要放在文件前面或写成 head -n 5。', hint: 'head -5 /var/log/app.log。' },
      { cmd: 'tail -f', explanation: 'tail -f 必须指定文件。', hint: 'tail -f /var/log/app.log。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-redirect',
    mode: 'linux',
    category: '文本处理',
    title: '重定向：> / >> / 2>',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['linux-text-view'],
    summary:
      '命令的输出默认打在屏幕上，重定向就是"改道"：> 把输出存进文件（覆盖旧内容，像擦掉重写）；>> 追加到文件末尾（保留旧内容，像接着往下写）；2> 专门接住错误信息。命令其实有 stdout 和 stderr 两个"管道"：好消息走 stdout，报错走 stderr，2> 就是给 stderr 开的岔路。',
    initialEnv: '当前目录是 /home/student，还没有 output.txt 等练习文件。',
    description: '学会把命令的输出保存到文件中，并区分标准输出与标准错误。',
    goals: ['> 覆盖写入', '>> 追加写入', '2> 重定向错误输出', '理解 stdout 与 stderr'],
    steps: [
      { id: 's1', label: 'echo hello > output.txt 写入文件', check: (s) => (fsContent(s, '/home/student/output.txt') ?? '').startsWith('hello\n') },
      {
        id: 's2',
        label: '用 >> 追加内容（内容变为两行）',
        check: (s) => {
          const c = fsContent(s, '/home/student/output.txt')
          return c !== null && c.startsWith('hello\n') && c.trim().split('\n').length >= 2
        },
      },
      { id: 's3', label: '把错误输出写入 error.txt（ls 不存在的目录）', check: (s) => (fsContent(s, '/home/student/error.txt') ?? '').includes('No such file') },
      { id: 's4', label: '用 2>> 追加第二条错误信息', check: (s) => (fsContent(s, '/home/student/error.txt') ?? '').trim().split('\n').length >= 2 },
    ],
    hints: [
      ['提示 1：echo hello > output.txt 会创建文件并写入 hello；再次用 > 会覆盖旧内容。', '提示 2：追加用 >>：echo world >> output.txt，内容变为两行。'],
      ['提示 3：ls /nonexistent 2> error.txt 把错误信息存进文件（报错走 stderr，要用 2>）；再执行 cat /nonexistent 2>> error.txt 追加第二条；最后 cat error.txt 查看两行内容。'],
    ],
    commonErrors: [
      { cmd: 'echo hello 2> output.txt', explanation: '2> 重定向的是错误输出，echo 的输出是标准输出，文件会是空的。', hint: '标准输出用 >：echo hello > output.txt。' },
      { cmd: 'echo hello 2>> error.txt', explanation: 'echo 不会产生错误输出，2>> 追加不到任何内容，error.txt 不会变两行。', hint: '用会报错的命令追加，如 cat /nonexistent 2>> error.txt。' },
      { cmd: 'ls /nonexistent > error.txt', explanation: '错误信息走 stderr，用 > 只重定向 stdout，错误仍会显示在终端。', hint: '要写 2> 才能捕获错误输出。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-pipe',
    mode: 'linux',
    category: '文本处理',
    title: '管道：组合命令',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['linux-redirect'],
    summary:
      '管道 | 是"流水线"：把前一个命令的输出直接喂给后一个命令当输入，像工厂流水线上两道工序接起来。grep 负责筛选、wc -l 负责计数，cat file | grep 模式 | wc -l 一次完成"找出匹配的行再数有多少"。head、tail 也能挂在管道末尾做截取。',
    initialEnv: '/var/log/app.log 是应用日志，含多个 INFO 与 ERROR 行。',
    description: '用管道把多个命令串起来，一次完成"过滤 + 统计"。',
    goals: ['理解 | 管道', 'cat | grep | wc 组合', '管道与 head 配合'],
    steps: [
      { id: 's1', label: '统计 app.log 中 ERROR 的行数（管道 + wc -l）', check: hasPipeGrepWc },
      { id: 's2', label: '统计 app.log 中 INFO 的行数', check: (s) => s.history.some((l, i) => /\|/.test(l) && /INFO/.test(l) && /wc/.test(l) && s.exitCodes?.[i] === 0) },
      { id: 's3', label: '用管道把前 3 行取出来（cat | head）', check: (s) => s.history.some((l, i) => /\|/.test(l) && /head/.test(l) && s.exitCodes?.[i] === 0) },
    ],
    hints: [
      ['提示 1：grep 筛选出的行通过 | 传给 wc -l 统计行数，就像流水线上的两道工序。', '提示 2：cat /var/log/app.log | grep ERROR | wc -l；统计 INFO 同理，把 ERROR 换成 INFO。'],
      ['提示 3：cat /var/log/app.log | head -3 只显示前 3 行。'],
    ],
    commonErrors: [
      { cmd: 'wc -l /var/log/app.log', explanation: '这只统计了整个文件的行数，没有先过滤 ERROR。', hint: '先用 grep 过滤再 wc：cat ... | grep ERROR | wc -l。' },
      { cmd: 'grep -c ERROR /var/log/app.log', explanation: '-c 也能数次数，但本课程要练习管道。', hint: '用 | 管道把 grep 的输出传给 wc -l。' },
      { cmd: 'cat /var/log/app.log grep ERROR', explanation: '没有 | 符号，grep 变成了 cat 的参数。', hint: '命令之间用 | 连接。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-grep',
    mode: 'linux',
    category: '文本处理',
    title: 'grep 常用参数',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['linux-pipe'],
    summary:
      'grep 就像"在书里找关键词"：一行行扫过文件，只把包含匹配内容的行挑出来。-n 顺便标出行号（像书页页码）；-i 忽略大小写（ERROR 和 error 都算）；-c 只报匹配了几行（像"共找到 3 处"）；-v 反过来，显示所有不含匹配内容的行。没有匹配时命令返回退出码 1。',
    initialEnv: '/var/log/app.log 是应用日志，包含 ERROR、INFO、WARN 等行。',
    description: '熟练掌握 grep 的常用参数，快速从日志中提取信息。',
    goals: ['grep -n 显示行号', 'grep -i 忽略大小写', 'grep -c 统计行数', 'grep -v 反向匹配'],
    steps: [
      { id: 's1', label: '用 grep -n ERROR 查看带行号的匹配', check: (s) => historyRan(s, /^grep\b.*-n/) },
      { id: 's2', label: '用 grep -i error 忽略大小写搜索', check: (s) => historyRan(s, /^grep\b.*-i/) },
      { id: 's3', label: '用 grep -c ERROR 统计匹配行数', check: (s) => historyRan(s, /^grep\b.*-c/) },
      { id: 's4', label: '用 grep -v INFO 查看所有非 INFO 的行', check: (s) => historyRan(s, /^grep\b.*-v/) },
    ],
    hints: [
      ['提示 1：格式是 grep 参数 模式 文件——先写要搜的关键词，再写文件。', '提示 2：grep -n ERROR /var/log/app.log 带行号显示；-i 忽略大小写：grep -i error /var/log/app.log。'],
      ['提示 3：grep -c ERROR /var/log/app.log 只输出匹配行数的数字；grep -v INFO /var/log/app.log 排除 INFO 行，只看其余。'],
    ],
    commonErrors: [
      { cmd: 'grep /var/log/app.log ERROR', explanation: 'grep 先写模式（搜索内容），再写文件。', hint: 'grep ERROR /var/log/app.log。' },
      { cmd: 'grep -c -n ERROR file', explanation: '-c 和 -n 同时使用会冲突（-c 优先）。', hint: '分开练习：先 -n 再看 -c。' },
      { cmd: 'grep ERROR', explanation: '没有指定文件，grep 会等待 stdin 输入。', hint: '加上文件：grep ERROR /var/log/app.log。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-find',
    mode: 'linux',
    category: '文本处理',
    title: 'find：按名称和类型查找',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['linux-grep'],
    summary:
      'find 是"按名字找文件"的搜索器，和 grep（找文件里的内容）分工不同。用法：find 起始目录 条件。find . -name "*.txt" 从当前目录往下找所有 .txt 文件（* 表示任意字符，建议加引号防 shell 提前展开）；-type f 只找普通文件，-type d 只找目录。',
    initialEnv: '家目录下有 projects、data、backup、logs 等多个目录和文件；/var/log 下有日志文件。',
    description: '用 find 快速定位文件和目录。',
    goals: ['find -name 按名称查找', 'find -type f 查找文件', 'find -type d 查找目录'],
    steps: [
      { id: 's1', label: '在家目录查找所有 .txt 文件', check: (s) => historyRan(s, /^find\b.*-name/) },
      { id: 's2', label: '在 /var/log 下查找所有普通文件', check: (s) => historyRan(s, /^find\b.*-type\s+f/) },
      { id: 's3', label: '查找当前目录下所有目录', check: (s) => historyRan(s, /^find\b.*-type\s+d/) },
    ],
    hints: [
      ['提示 1：find 起始路径 条件；-name 模式建议用引号包住，防止 shell 提前把 * 展开。', '提示 2：find . -name "*.txt" 从当前目录开始往下找；find /var/log -type f 只找普通文件。'],
      ['提示 3：-type d 只显示目录，-type f 只显示文件。'],
    ],
    commonErrors: [
      { cmd: 'find -name *.txt', explanation: '没有写起始路径，而且 * 会被 shell 先展开。', hint: 'find . -name "*.txt"（加引号）。' },
      { cmd: 'find / -name "*.txt"', explanation: '从根目录搜索会扫过整个系统（真实环境非常慢）。', hint: '从家目录或 /var/log 开始搜索。' },
      { cmd: 'find . -type x', explanation: '-type 只支持 f（文件）和 d（目录）。', hint: '用 -type f 或 -type d。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-text-tools',
    mode: 'linux',
    category: '文本处理',
    title: '文本工具：wc / sort / uniq / cut',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['linux-pipe'],
    summary:
      '这节是"文本加工车间"：wc -l 数行数；sort 排队（-n 按数字大小排，否则 10 会排在 2 前面）；uniq 去掉紧挨着的重复行，所以要先 sort 让相同的排在一起、uniq 才去得干净；cut -d 分隔符 -f 字段 按分隔符切列取指定列，像在表格里抽出一栏。',
    initialEnv: 'data 目录下有 names.txt（有重复的名字）、scores.txt（CSV 格式）、ip.txt（IP 列表）。',
    description: '组合使用文本工具，完成统计、排序、去重和取列。',
    goals: ['wc -l 统计行数', 'sort 排序', 'sort | uniq -c 统计重复', 'cut -d -f 提取列'],
    steps: [
      { id: 's1', label: '统计 names.txt 的行数', check: (s) => historyRan(s, /^wc\b.*names\.txt/) },
      { id: 's2', label: '用 sort | uniq -c 统计每个名字出现次数', check: (s) => s.history.some((l, i) => /\|/.test(l) && /sort/.test(l) && /uniq/.test(l) && s.exitCodes?.[i] === 0) },
      { id: 's3', label: '用 sort -n 对 ip.txt 做数字排序', check: (s) => historyRan(s, /sort\b.*-n/) },
      { id: 's4', label: '用 cut 提取 scores.txt 的分数列（第 2 列）', check: (s) => historyRan(s, /^cut\b/) },
    ],
    hints: [
      ['提示 1：数据文件在 data 目录下，先 ls data 看看有哪些文件。', '提示 2：sort data/names.txt | uniq -c 先排序让相同名字相邻，uniq 才能合并并统计出每个名字的次数。'],
      ['提示 3：sort -n data/ip.txt 按数值排序（默认字典序会把 10.0.0.10 排在 10.0.0.2 前面）；cut -d "," -f 2 data/scores.txt 取第 2 列。'],
    ],
    commonErrors: [
      { cmd: 'uniq -c data/names.txt', explanation: 'uniq 只去除相邻的重复行，names.txt 里相同名字不连续，必须先 sort。', hint: 'sort data/names.txt | uniq -c。' },
      { cmd: 'cut -d, -f2 data/scores.txt', explanation: '这样写可以（连写），但如果分隔符是特殊字符要用引号。', hint: 'cut -d "," -f 2 data/scores.txt。' },
      { cmd: 'sort data/ip.txt', explanation: '默认按字典序，10.0.0.10 会排在 10.0.0.2 前面。', hint: '加 -n 按数值排序。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-chmod',
    mode: 'linux',
    category: '权限与进程',
    title: '权限：chmod 与 chown',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['linux-text-tools'],
    summary:
      'Linux 里每个文件都有权限位 rwx：r 读、w 写、x 执行，像三把不同的钥匙。数字法把权限换算成数字：r=4、w=2、x=1，如 600 表示"只有自己能读写"。chmod 修改权限（chmod 600 文件 或符号方式 chmod +x）；chown 修改文件的主人/组，普通用户只能改组、不能改主人。',
    initialEnv:
      '家目录下有 secrets.txt（0644）和 scripts/run.sh（0644）；shared.txt 属于 root 用户，组为 root。',
    description: '收紧私密文件的权限，赋予脚本执行权限，并学会修改文件所属组。',
    goals: ['理解 rwx 与数字权限', 'chmod 八进制用法', 'chmod 符号用法（+x）', 'chown 修改文件组'],
    steps: [
      { id: 's1', label: '把 secrets.txt 权限改为 600（仅自己可读写）', check: (s) => fsMode(s, '/home/student/secrets.txt') === 0o600 },
      { id: 's2', label: '给 scripts/run.sh 添加执行权限', check: (s) => ((fsMode(s, '/home/student/scripts/run.sh') ?? 0) & 0o111) !== 0 },
      { id: 's3', label: '把 shared.txt 的组改为 student', check: (s) => fsOwner(s, '/home/student/shared.txt')?.gid === 1000 },
      { id: 's4', label: '用 ls -l 验证权限变化', check: ranLsL },
    ],
    hints: [
      ['提示 1：chmod 权限 文件，顺序是"先权限后文件"；600 表示 rw-------（仅自己可读写）。', '提示 2：符号方式：chmod +x scripts/run.sh 给脚本加上执行权限（在 home 目录下执行）。'],
      ['提示 3：shared.txt 属于 root 组，把组改成自己的：chown :student shared.txt（冒号前留空表示只改组）。'],
    ],
    commonErrors: [
      { cmd: 'chmod secrets.txt 600', explanation: 'chmod 先写权限，再写文件。', hint: 'chmod 600 secrets.txt。' },
      { cmd: 'chown student:student shared.txt', explanation: '普通用户不能把文件所有者改成自己（真实 Linux 会报 Operation not permitted）。', hint: '只改组：chown :student shared.txt。' },
      { cmd: 'chmod 700 secrets.txt', explanation: '700 是 rwx------，包含执行权限，本课程要求 600。', hint: 'chmod 600 secrets.txt。' },
    ],
    build: (): SimState => {
      const s = createInitialState()
      putFile(s, '/home/student/shared.txt', 'shared file owned by student, group root\n', 0o640, 1000, 0)
      return s
    },
  },
  {
    id: 'linux-env',
    mode: 'linux',
    category: '权限与进程',
    title: '用户与环境变量：id / env / export',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['linux-chmod'],
    summary:
      '环境变量是系统里的"全局便签"，程序和 shell 都能读到。id 显示你是哪个用户（uid、gid）；env 列出所有环境变量；export MY_VAR=hello 写下便签，echo $MY_VAR 读出来——引用变量时必须带 $，否则只是普通文字。PATH 则是"命令的通讯录"，shell 靠它找到命令在哪里。',
    initialEnv: '当前用户是 student（uid=1000），属于 student 和 sudo 组。',
    description: '了解当前用户身份，学会定义和使用环境变量。',
    goals: ['id 查看用户与组', 'env 查看环境变量', 'export 定义变量', 'echo $VAR 引用变量'],
    steps: [
      { id: 's1', label: '用 id 查看当前用户和组', check: (s) => historyRan(s, /^id\b/) },
      { id: 's2', label: '用 env 查看环境变量（可配合管道筛选）', check: (s) => historyRan(s, /^env\b/) },
      { id: 's3', label: 'export 定义一个变量并用 echo $VAR 读取', check: (s) => Object.keys(s.env).some((k) => !['HOME', 'USER', 'SHELL', 'PATH', 'PWD', 'TERM', 'LANG', 'OLDPWD'].includes(k)) },
      { id: 's4', label: '查看 PATH 变量的值', check: (s) => historyRan(s, /PATH/) && historyRanAny(s, [/^echo\b/, /^env\b/]) },
    ],
    hints: [
      ['提示 1：id 直接执行即可；env | grep PATH 从一长串变量里筛选出 PATH。', '提示 2：export MY_VAR="hello" 定义变量，echo $MY_VAR 读取——$ 是"取变量值"的意思，不能少。'],
      ['提示 3：echo $PATH 查看命令搜索路径，多个目录用 : 分隔。'],
    ],
    commonErrors: [
      { cmd: 'echo MY_VAR', explanation: '没有写 $，echo 输出的只是字符串 MY_VAR。', hint: '要读取变量必须加 $：echo $MY_VAR。' },
      { cmd: 'MY_VAR=hello', explanation: '只这样赋值不 export，变量不会进入环境，echo $MY_VAR 会是空的。', hint: '用 export MY_VAR=hello。' },
      { cmd: 'env PATH', explanation: 'env 的用法是 env 或 env | grep PATH。', hint: '直接 env 或用管道过滤。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-procs',
    mode: 'linux',
    category: '权限与进程',
    title: '进程：ps / top / kill',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['linux-env'],
    summary:
      '进程就是"正在运行的程序"，每个进程都有唯一编号 PID，像工号一样。ps 给当前进程拍一张快照（列出 PID 和命令）；top 显示实时刷新的进程视图（模拟器为静态快照）；kill PID 向进程发结束信号（默认 TERM），就像给进程打电话说"下班了"。',
    initialEnv: '系统里有 systemd(1)、sshd(789)、bash(1234) 和一个 sleep 3600(2345) 后台进程。',
    description: '查看进程列表，并结束一个多余的进程。',
    goals: ['ps 查看进程', 'top 动态视图', 'kill 结束进程', 'kill 后 ps 验证'],
    steps: [
      { id: 's1', label: '用 ps 查看进程列表', check: (s) => historyRan(s, /^ps\b/) },
      { id: 's2', label: '用 top 查看进程视图', check: (s) => historyRan(s, /^top\b/) },
      { id: 's3', label: '用 kill 结束 sleep 进程（PID 2345）', check: (s) => !s.procs.some((p) => p.pid === 2345) },
      { id: 's4', label: '再用 ps 确认进程已消失', check: (s) => historyRan(s, /^ps\b/) && !s.procs.some((p) => p.pid === 2345) },
    ],
    hints: [
      ['提示 1：ps 查看所有进程，注意 PID（进程编号）和 CMD（是什么程序）两列。', '提示 2：先 ps 找到 sleep 3600 的 PID（2345）；kill 跟的是数字编号不是进程名：kill 2345。'],
      ['提示 3：kill 后再次 ps，确认 sleep 进程已经不在了。'],
    ],
    commonErrors: [
      { cmd: 'kill sleep', explanation: 'kill 需要数字 PID，不是进程名。', hint: '先 ps 找到 PID，再 kill 2345。' },
      { cmd: 'kill 9999', explanation: '这个 PID 不存在，会报 No such process。', hint: 'kill 2345。' },
      { cmd: 'kill 1234', explanation: '1234 是当前 shell（bash），模拟器会拒绝，就像真实系统对关键进程的保护。', hint: '结束 sleep 进程：kill 2345。' },
    ],
    build: createInitialState,
  },
  {
    id: 'linux-network',
    mode: 'linux',
    category: '网络与服务',
    title: '网络排错：ping / curl / ss / systemctl',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['linux-procs'],
    summary:
      '排查网络按"通不通 → 通到哪 → 服务起没起"的思路走：ping 测连通性（-c 3 只发 3 次请求，不加会一直发）；curl 发起 HTTP 请求，能拿到网页说明服务在工作；ss -tlnp 查看端口有没有被监听，像查"门牌号有没有人值守"；systemctl start/status 管理 systemd 服务。',
    initialEnv:
      '本机有一个 webapp 服务（监听 8080 端口）但尚未启动；example.com 可从模拟网络访问。',
    description: '按"连通性 → 端口 → 服务"的思路排查 Web 服务为什么访问不了。',
    goals: ['ping -c 测试连通性', 'curl 访问 HTTP 服务', 'ss -tlnp 查看端口', 'systemctl 启动服务'],
    steps: [
      { id: 's1', label: '用 ping -c 3 测试 example.com 连通性', check: (s) => historyRan(s, /^ping\b.*-c/) },
      { id: 's2', label: '用 curl 访问 example.com', check: (s) => historyRan(s, /^curl\b.*example\.com/) },
      { id: 's3', label: '尝试访问本机 8080 端口（会失败）', check: (s) => historyHas(s, /^curl\b.*(localhost|127\.0\.0\.1)[^\s]*8080/) },
      { id: 's4', label: '用 ss -tlnp 查看 8080 端口没有监听', check: (s) => historyRan(s, /^ss\b/) },
      { id: 's5', label: '用 systemctl start 启动 webapp 服务', check: (s) => serviceStatus(s, 'webapp') === 'active' },
      { id: 's6', label: '再次 curl 本机 8080 端口验证成功', check: (s) => historyRan(s, /^curl\b.*(localhost|127\.0\.0\.1)[^\s]*8080/) },
    ],
    hints: [
      ['提示 1：ping -c 3 example.com 发 3 次请求测网络通不通（不加 -c 会无限 ping）。', '提示 2：curl http://localhost:8080/ 失败说明服务没起来；ss -tlnp 看端口监听情况，确认 8080 没被监听。'],
      ['提示 3：systemctl start webapp 启动服务，再 curl http://localhost:8080/ 就应该有响应了。'],
    ],
    commonErrors: [
      { cmd: 'ping example.com', explanation: '不加 -c 会无限 ping（真实系统要 Ctrl+C 停止）。', hint: '用 ping -c 3 example.com。' },
      { cmd: 'systemctl status webapp', explanation: 'status 只是查看，不会启动服务。', hint: '启动用 systemctl start webapp。' },
      { cmd: 'curl localhost:8080', explanation: 'URL 必须带协议头（http://）。', hint: 'curl http://localhost:8080/。' },
    ],
    build: (): SimState => {
      const s = createInitialState()
      setMode(s, '/var/log/webapp/app.log', 0o644)
      addService(s, 'webapp', 'inactive', [
        `${s.clock}: webapp.service: Unit webapp.service has begun starting up.`,
        `${s.clock}: webapp.service: Scheduled restart job, restart counter is at 1.`,
        `${s.clock}: webapp.service: Stopped CmdLab web application server.`,
      ])
      return s
    },
  },
  {
    id: 'linux-troubleshoot',
    mode: 'linux',
    category: '网络与服务',
    title: '综合排障：服务无法启动',
    difficulty: '挑战',
    estimatedMinutes: 20,
    prerequisites: ['linux-network', 'linux-chmod'],
    summary:
      '综合实战：webapp 服务启动失败，像真正的运维一样按五步走——systemctl status 看服务状态与失败原因，tail/grep 翻日志找具体报错，ls -l 查日志文件的权限，chmod 修复权限，最后 curl 验证服务恢复。排错的核心是"先定位、再动手"。',
    initialEnv:
      'webapp 服务处于 failed 状态。它需要把日志写入 /var/log/webapp/app.log，但该文件目前只有读权限（-r--r--r--），服务无法写入日志。',
    description: '像运维工程师一样，用学过的命令一步步定位并修复服务故障。',
    goals: ['systemctl status 定位失败', 'tail/grep 分析日志', 'ls -l 检查权限', 'chmod 修复权限', '启动并验证服务'],
    steps: [
      { id: 's1', label: '用 systemctl status 查看服务为何失败', check: (s) => historyRan(s, /^systemctl\s+status\b/) },
      { id: 's2', label: '查看服务日志文件找到报错信息', check: (s) => historyRanAny(s, [/^tail\b.*webapp/, /^grep\b.*webapp/, /^cat\b.*webapp/]) },
      { id: 's3', label: '用 ls -l 检查日志文件的权限', check: ranLsL },
      { id: 's4', label: '修复日志文件的权限（student 可读可写）', check: (s) => fsReadWritableByStudent(s, '/var/log/webapp/app.log') },
      { id: 's5', label: '启动 webapp 服务', check: (s) => serviceStatus(s, 'webapp') === 'active' },
      { id: 's6', label: '用 curl 或 ss 验证服务已恢复', check: (s) => historyRan(s, /^curl\b/) || historyRan(s, /^ss\b/) },
    ],
    hints: [
      ['提示 1：systemctl status webapp 显示 failed，日志提到 Permission denied——问题出在日志文件。', '提示 2：tail -5 /var/log/webapp/app.log 看到 "Failed to open log file ... Permission denied"。'],
      ['提示 3：ls -l /var/log/webapp/app.log 显示 -r--r--r--，只有读权限，服务无法写入。修复：chmod 644 /var/log/webapp/app.log 加上写权限，然后 systemctl start webapp。'],
      ['提示 4：验证：curl http://localhost:8080/ 有响应，或 ss -tlnp 里看到 8080 在监听。'],
    ],
    commonErrors: [
      { cmd: 'systemctl restart webapp', explanation: 'restart 会先停再启，权限问题没解决前照样失败。', hint: '先修复日志文件权限，再 start（或 restart）。' },
      { cmd: 'kill 3106', explanation: '服务根本没启动，没有进程可杀（Main PID 不存在）。', hint: '问题不是进程，是日志文件权限。' },
      { cmd: 'chmod 644 /opt/webapp/app', explanation: '/opt/webapp/app 本来就是可执行的，问题不在这里。', hint: '检查服务日志路径 /var/log/webapp/app.log 的权限。' },
      { cmd: 'chown :student /var/log/webapp/app.log', explanation: '文件本来就是 student 的，关键是权限位没有写权限（-r--r--r--）。', hint: '用 chmod 给日志文件加写权限，如 chmod 644。' },
    ],
    build: (): SimState => {
      const s = createInitialState()
      addService(s, 'webapp', 'failed', [
        `${s.clock}: webapp.service: Failed to open log file /var/log/webapp/app.log: Permission denied`,
        `${s.clock}: webapp.service: Failed with result 'exit-code'.`,
        `${s.clock}: systemd[1]: Failed to start CmdLab web application server.`,
      ])
      return s
    },
  },
  {
    id: 'docker-arch',
    mode: 'docker',
    category: 'Docker 基础',
    title: 'Docker 架构',
    difficulty: '入门',
    estimatedMinutes: 5,
    prerequisites: ['linux-procs'],
    summary: 'Docker 采用客户端/服务器架构：你敲的 docker CLI 只是"遥控器"，真正干活的是后台的 dockerd 守护进程（像"管家"），两者通过 API 对话。docker version 同时显示客户端和服务端版本，能确认两边是否正常；docker info 展示这台机器的整体概况，比如镜像数、容器数、存储驱动和网络。记住这个分工：你只负责发指令，管家负责执行。',
    initialEnv: '本地已预置 nginx、alpine、node、postgres 等镜像，还没有任何容器。',
    description: '认识 Docker 的客户端/服务器架构，用 version 和 info 摸清运行环境。',
    goals: ['理解 C/S 架构', 'docker version', 'docker info'],
    steps: [
      { id: 's1', label: '用 docker version 查看客户端与服务端版本', check: (s) => historyRan(s, /^docker\s+version\b/) },
      { id: 's2', label: '用 docker info 查看系统信息', check: (s) => historyRan(s, /^docker\s+info\b/) },
      { id: 's3', label: '用 docker images 查看本地镜像', check: (s) => historyRan(s, /^docker\s+images\b/) },
    ],
    hints: [
      ['提示 1：运行 docker version，确认输出里同时有 Client 和 Server 两段版本。', '提示 2：运行 docker info，找到 Containers / Images / Networks 的统计数字。'],
      ['提示 3：docker images 列出本地镜像，重点关注 IMAGE ID 和 SIZE 两列。'],
    ],
    commonErrors: [
      { cmd: 'docker version --json', explanation: '模拟器不支持该参数。', hint: '直接 docker version。' },
      { cmd: 'docker info | grep Images', explanation: '管道可用，但本实验直接 docker info 即可。', hint: 'docker info。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-images',
    mode: 'docker',
    category: 'Docker 基础',
    title: '镜像管理：pull / images / inspect / rmi',
    difficulty: '基础',
    estimatedMinutes: 10,
    prerequisites: ['docker-arch'],
    summary: '镜像像"菜谱"：它只描述内容、本身不变，容器才是按菜谱做出来的一道菜。镜像可以随意拉取和删除：docker pull 从镜像仓库把"菜谱"拿到本地（模拟器只更新本地状态，不真实下载）；docker images 查看本地已有镜像；docker inspect 看镜像的详细信息；docker rmi 删除不要的镜像。拉取、查看、检查、删除，就是镜像的完整一生。',
    initialEnv: '本地预置了 nginx 和 alpine 镜像。',
    description: '拉取一个 redis 镜像，查看、检查再删除它，走一遍镜像的完整生命周期。',
    goals: ['docker pull 拉取镜像', 'docker images 查看', 'docker inspect 检查', 'docker rmi 删除'],
    steps: [
      { id: 's1', label: '用 docker images 查看本地镜像', check: (s) => historyRan(s, /^docker\s+images\b/) },
      { id: 's2', label: '用 docker pull 拉取 redis 镜像', check: (s) => historyRan(s, /^docker\s+pull\s+redis\b/) },
      { id: 's3', label: '用 docker inspect 查看 redis 镜像信息', check: (s) => historyRan(s, /^docker\s+inspect\s+redis\b/) },
      { id: 's4', label: '用 docker rmi 删除 redis 镜像', check: (s) => !dockerImageExists(s, 'redis') },
    ],
    hints: [
      ['提示 1：docker pull redis 模拟从仓库拉取，输出类似"下载层"的进度信息。', '提示 2：docker inspect redis 输出一大段 JSON 详情。'],
      ['提示 3：docker rmi redis 删除镜像，再用 docker images 确认它已消失。'],
    ],
    commonErrors: [
      { cmd: 'docker rmi redis', explanation: 'redis 还没拉取，会报 No such image。', hint: '先 docker pull redis。' },
      { cmd: 'docker delete redis', explanation: 'Docker 的删除命令是 rmi（image）和 rm（container）。', hint: '用 docker rmi redis。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-run-nginx',
    mode: 'docker',
    category: 'Docker 基础',
    title: '启动 nginx 容器',
    difficulty: '基础',
    estimatedMinutes: 8,
    prerequisites: ['docker-images'],
    summary: 'docker run 是最常用的命令：拿着镜像这张"菜谱"，做出一道菜（容器）并端上桌。今天这道菜是 nginx，还要加三个"佐料"：-d 让容器在后台运行（不占住终端）、--name 给它起名字方便以后叫它、-p 8080:80 把宿主机 8080 端口"接根管子"通向容器里的 80 端口，这样外面才能访问到它。',
    initialEnv: '本地有 nginx 镜像，还没有任何容器。',
    description: '用 nginx 镜像后台运行一个名为 web 的容器，映射 8080 端口。',
    goals: ['docker run 参数', '-d 后台运行', '--name 与 -p 端口映射'],
    steps: [
      { id: 's1', label: '查看本地有哪些镜像', check: (s) => historyRan(s, /^docker\s+images\b/) },
      {
        id: 's2',
        label: '后台运行名为 web 的 nginx 容器（8080->80）',
        check: (s) => {
          const ctr = s.docker.containers.find((c) => c.name === 'web')
          return !!ctr && ctr.status === 'running' && ctr.image.startsWith('nginx') && ctr.ports.some((p) => p.host === 8080 && p.container === 80)
        },
      },
      { id: 's3', label: '用 docker ps 确认容器在运行', check: (s) => historyRan(s, /^docker\s+ps\b/) },
    ],
    hints: [
      ['提示 1：认识三个参数：-d 后台运行、--name 起名字、-p 8080:80 做端口映射。', '提示 2：docker run -d --name web -p 8080:80 nginx 一条命令启动容器。'],
      ['提示 3：运行后 docker ps 查看，STATUS 列应为 Up。'],
    ],
    commonErrors: [
      { cmd: 'docker run nginx', explanation: '没有 -d 会占用终端（模拟器直接返回），而且没有 --name 和端口映射。', hint: 'docker run -d --name web -p 8080:80 nginx。' },
      { cmd: 'docker run -d --name web nginx', explanation: '容器运行了但没有 -p 端口映射，不满足要求。', hint: '加上 -p 8080:80。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-lifecycle',
    mode: 'docker',
    category: 'Docker 镜像与容器',
    title: '容器生命周期：ps / start / stop / restart / rm',
    difficulty: '基础',
    estimatedMinutes: 10,
    prerequisites: ['docker-run-nginx'],
    summary: '容器有自己的"生老病死"：created（刚创建）→ running（运行中）→ exited（已停止），删除后彻底消失。docker ps 只看运行中的容器，docker ps -a 才能看到全部（包括已停止的）；docker stop 停止、docker start 重新启动、docker restart 重启。特别注意：运行中的容器不能直接 docker rm，要先停止再删除。',
    initialEnv: '本地有 nginx 镜像，还没有任何容器。',
    description: '创建容器后走完停止、启动、重启、删除的完整生命周期。',
    goals: ['ps 与 ps -a', 'docker stop / start / restart', 'docker rm 删除'],
    steps: [
      { id: 's1', label: '创建名为 web 的 nginx 容器（映射 8080）', check: (s) => historyRan(s, /^docker\s+run\b.*\bweb\b/) && historyRan(s, /^docker\s+run\b.*8080/) },
      { id: 's2', label: '停止 web 容器并用 ps -a 确认', check: (s) => historyRan(s, /^docker\s+stop\b.*\bweb\b/) && historyRan(s, /^docker\s+ps\b.*-a/) },
      { id: 's3', label: '重新启动 web 容器', check: (s) => historyRan(s, /^docker\s+start\b/) },
      { id: 's4', label: '重启 web 容器', check: (s) => historyRan(s, /^docker\s+restart\b/) },
      { id: 's5', label: '停止并删除 web 容器', check: (s) => !dockerContainer(s, 'web') && historyRan(s, /^docker\s+rm\b/) },
    ],
    hints: [
      ['提示 1：docker stop web 停止容器，docker ps -a 能看到它变成 Exited 状态。', '提示 2：docker start web 重新启动，docker restart web 执行"重启"。'],
      ['提示 3：先 docker stop web 再 docker rm web——运行中的容器不能被删除。'],
    ],
    commonErrors: [
      { cmd: 'docker rm web', explanation: 'web 还在运行，会报 You cannot remove a running container。', hint: '先 docker stop web。' },
      { cmd: 'docker restart web', explanation: '容器已经运行中也可以 restart（先停再启）。', hint: '本步骤就用 docker restart web。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-logs-stop',
    mode: 'docker',
    category: 'Docker 镜像与容器',
    title: '日志、exec 与 inspect',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['docker-lifecycle'],
    summary: '容器像一个"黑箱"，想了解它里面发生了什么要靠日志：docker logs 查看容器输出（-f 跟随新日志、--tail 只看末尾几行）。docker exec 可以"钻"进运行中的容器执行命令，注意容器有自己独立的文件系统，相当于进了一个单独的小房间。docker inspect 输出容器最详细的 JSON 档案（状态、配置、网络等），是排障的利器。',
    initialEnv: 'web 容器（nginx，8080->80）正在运行。',
    description: '用日志、exec 和 inspect 深入了解运行中的容器。',
    goals: ['docker logs 与 logs -f', 'docker exec 进入容器', 'docker inspect 查看细节'],
    steps: [
      { id: 's1', label: '确认 web 容器正在运行', check: (s) => historyRan(s, /^docker\s+ps\b/) },
      { id: 's2', label: '查看 web 容器的日志', check: (s) => historyRan(s, /^docker\s+logs\b/) },
      { id: 's3', label: '用 docker exec 查看容器内的文件', check: (s) => historyRan(s, /^docker\s+exec\b/) },
      { id: 's4', label: '用 docker inspect 查看容器 JSON 详情', check: (s) => historyRan(s, /^docker\s+inspect\b/) },
    ],
    hints: [
      ['提示 1：docker logs web 查看日志，试试加 -f 跟随实时输出。', '提示 2：docker exec web ls /usr/share/nginx/html 在容器里执行 ls，看到的是容器自己的文件。'],
      ['提示 3：docker inspect web 输出完整 JSON，找 State / Config / NetworkSettings 字段。'],
    ],
    commonErrors: [
      { cmd: 'docker exec web rm -rf /', explanation: '模拟器会拒绝危险操作（安全边界：容器内同样不允许）。', hint: 'exec 用于查看，如 ls / cat。' },
      { cmd: 'docker exec web touch', explanation: 'exec 至少要指定容器和命令。', hint: 'docker exec web ls /etc/nginx/conf.d。' },
    ],
    build: () => {
      const s = createInitialState()
      addRunningContainer(s, 'web', 'nginx:latest', 8080, 80)
      return s
    },
  },
  {
    id: 'docker-ports',
    mode: 'docker',
    category: 'Docker 镜像与容器',
    title: '端口映射与端口冲突',
    difficulty: '进阶',
    estimatedMinutes: 10,
    prerequisites: ['docker-run-nginx'],
    summary: '-p 8080:80 的格式是"宿主机端口:容器端口"：相当于把容器里的服务"接根水管"通到宿主机，别人就能通过宿主机访问到容器。宿主机端口像楼下快递柜的格口——同一格口同一时刻只能放一家快递，两个容器抢同一个宿主机端口时，第二个会报 port is already allocated（端口已被占用）。本课用 curl 模拟浏览器访问容器，并故意制造一次端口冲突看报错。',
    initialEnv: '本地有 nginx 镜像，还没有任何容器。',
    description: '启动带端口映射的容器并用 curl 验证，再体验端口冲突。',
    goals: ['-p 端口映射', 'curl 访问容器服务', '理解端口冲突'],
    steps: [
      { id: 's1', label: '启动 web 容器（8080->80）', check: (s) => dockerContainer(s, 'web', (c) => c.status === 'running' && c.ports.some((p) => p.host === 8080)) },
      { id: 's2', label: '用 curl 访问 http://localhost:8080/', check: (s) => historyRan(s, /^curl\b.*8080/) },
      { id: 's3', label: '尝试再启动一个占用 8080 的容器（会失败）', check: (s) => historyFailed(s, /^docker\s+run\b.*8080/) },
      { id: 's4', label: '确认 8080 端口仍只被 web 占用', check: (s) => historyFailed(s, /^docker\s+run\b.*8080/) && s.docker.containers.filter((c) => c.status === 'running' && c.ports.some((p) => p.host === 8080)).length === 1 },
    ],
    hints: [
      ['提示 1：docker run -d --name web -p 8080:80 nginx 启动并映射端口。', '提示 2：curl http://localhost:8080/ 会返回 nginx 欢迎页面。'],
      ['提示 3：再启动一个也占用 8080 的容器（docker run -d --name web2 -p 8080:80 nginx）会报 port is already allocated。'],
    ],
    commonErrors: [
      { cmd: 'docker run -d --name web2 -p 8080:80 nginx', explanation: '宿主机 8080 已被 web 占用，端口冲突。', hint: '换个端口（如 8081）或先停掉 web。' },
      { cmd: 'curl localhost:8080', explanation: 'URL 需要协议头 http://。', hint: 'curl http://localhost:8080/。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-env',
    mode: 'docker',
    category: 'Docker 镜像与容器',
    title: '容器环境变量：-e',
    difficulty: '进阶',
    estimatedMinutes: 8,
    prerequisites: ['docker-logs-stop'],
    summary: '环境变量是"贴在容器身上的配置纸条"，程序启动时读它来决定行为（比如当前是生产还是测试环境）。-e KEY=value 在创建容器时把纸条塞进去，可以连用多个 -e；同名的会覆盖镜像里预设的值。本课用 docker exec app env 查看容器内的所有环境变量，docker inspect 也能在 Config.Env 里看到。',
    initialEnv: '本地有 nginx 镜像，还没有任何容器。',
    description: '用 -e 给容器注入环境变量并验证。',
    goals: ['-e 注入环境变量', 'exec env 验证', 'inspect 查看 Env'],
    steps: [
      { id: 's1', label: '启动带环境变量的容器（APP_MODE=prod、APP_REGION=cn）', check: (s) => s.docker.containers.some((c) => c.env['APP_MODE'] === 'prod' && c.env['APP_REGION'] === 'cn') },
      { id: 's2', label: '用 docker exec env 查看容器内的环境变量', check: (s) => historyRan(s, /^docker\s+exec\b.*env/) },
      { id: 's3', label: '用 docker inspect 查看 Env 配置', check: (s) => historyRan(s, /^docker\s+inspect\b/) },
    ],
    hints: [
      ['提示 1：docker run -d --name app -e APP_MODE=prod -e APP_REGION=cn nginx 注入两个变量。', '提示 2：docker exec app env 列出容器内全部环境变量，找到 APP_MODE。'],
      ['提示 3：docker inspect app 的 Config.Env 数组里也能看到。'],
    ],
    commonErrors: [
      { cmd: 'docker run -d --name app -e APP_MODE prod nginx', explanation: '-e 的值必须用 = 连接（KEY=value），空格分隔是下一个参数。', hint: '-e APP_MODE=prod。' },
      { cmd: 'docker exec app echo $APP_MODE', explanation: '$APP_MODE 会在宿主机 shell 里先展开。', hint: '用 docker exec app env 查看。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-volumes',
    mode: 'docker',
    category: 'Docker 网络与存储',
    title: '数据卷：volume 与 -v',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['docker-env'],
    summary: '容器一删除，里面写的文件就全没了——容器是"一次性的"。数据卷（volume）像"共享冰箱"：创建一次、挂到容器上，即使容器（餐厅）关门，冰箱里的食材还在。用 -v 卷名:容器路径 把卷挂进容器；docker volume create / ls / inspect / rm 管理卷。本课先往卷里写个文件，再删掉容器用同一个卷重建，验证"冰箱里的东西还在"。',
    initialEnv: '本地有 nginx 和 alpine 镜像。',
    description: '创建卷、挂载到容器、写入数据，然后重建容器验证数据持久化。',
    goals: ['docker volume create / ls / inspect', 'docker run -v 挂载卷', '数据持久化验证'],
    steps: [
      { id: 's1', label: '创建数据卷 appdata', check: (s) => dockerVolumeExists(s, 'appdata') },
      { id: 's2', label: '挂载卷启动容器（appdata:/data）', check: (s) => historyRan(s, /^docker\s+run\b.*appdata:/) },
      { id: 's3', label: '在容器内往 /data 写入文件', check: (s) => s.docker.volumes.find((v) => v.name === 'appdata')?.tree != null },
      { id: 's4', label: '删除容器并用同一卷重建', check: (s) => historyRan(s, /^docker\s+rm\b/) && s.docker.containers.some((c) => c.status === 'running' && c.mounts.some((m) => m.startsWith('appdata:'))) },
      { id: 's5', label: '验证新容器里数据还在', check: (s) => {
        const ctr = s.docker.containers.find((c) => c.mounts.some((m) => m.startsWith('appdata:')))
        if (!ctr) return false
        const data = walk(ctr.fsRoot, '/data')
        return !!data && data.kind === 'dir' && !!data.children && Object.keys(data.children).length > 0
      } },
    ],
    hints: [
      ['提示 1：docker volume create appdata 创建卷，docker volume ls 查看。', '提示 2：docker run -d --name app -v appdata:/data nginx 把卷挂到 /data，再 docker exec app touch /data/hello.txt 写入文件。'],
      ['提示 3：docker stop app && docker rm app 删掉旧容器，再用同一个卷启动新容器（-v appdata:/data），进去看 /data 里 hello.txt 还在——这就是持久化。'],
    ],
    commonErrors: [
      { cmd: 'docker run -v /tmp/data:/data nginx', explanation: '这是绑定挂载（宿主机目录），模拟器仅支持命名卷。', hint: '用命名卷：-v appdata:/data。' },
      { cmd: 'docker volume rm appdata', explanation: '卷正在被容器使用，会报 volume is in use。', hint: '先删除容器再删卷。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-networks',
    mode: 'docker',
    category: 'Docker 网络与存储',
    title: '容器网络：network 与容器通信',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['docker-ports'],
    summary: '容器住在一个"小区"里（默认叫 bridge 网络），彼此只能靠 IP 地址"串门"，而 IP 每次重启都可能变，很不方便。创建自定义网络就像单独划一个"楼栋"，同一栋里的容器可以直接用对方的名字（容器名）互访，不用记 IP。docker network create / ls / inspect / connect 管理网络。本课把两个 nginx 容器接入同一个网络，为后面的综合排障打基础。',
    initialEnv: '本地有 nginx 和 alpine 镜像。',
    description: '创建自定义网络，把两个容器接入，验证容器名互访。',
    goals: ['docker network create / ls / inspect', 'docker run --network', '容器名互相访问'],
    steps: [
      { id: 's1', label: '创建自定义网络 webnet', check: (s) => dockerNetworkExists(s, 'webnet') },
      { id: 's2', label: '把 app1 容器接入 webnet', check: (s) => dockerContainer(s, 'app1', (c) => c.network === 'webnet') },
      { id: 's3', label: '把 app2 容器接入 webnet', check: (s) => dockerContainer(s, 'app2', (c) => c.network === 'webnet') },
      { id: 's4', label: '用 docker network inspect 查看网络成员', check: (s) => historyRan(s, /^docker\s+network\s+inspect\b/) },
    ],
    hints: [
      ['提示 1：docker network create webnet 创建网络，docker network ls 查看。', '提示 2：docker run -d --name app1 --network webnet nginx 把 app1 接入，app2 同理。'],
      ['提示 3：docker network inspect webnet，在 Containers 字段里能看到 app1 和 app2。'],
    ],
    commonErrors: [
      { cmd: 'docker network create webnet', explanation: '重复创建会报 network with name webnet already exists。', hint: '只创建一次。' },
      { cmd: 'docker run --network nope nginx', explanation: '网络不存在会报 network nope not found。', hint: '先 docker network create webnet。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-dockerfile',
    mode: 'docker',
    category: 'Docker 构建与编排',
    title: '编写 Dockerfile',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['docker-images'],
    summary: 'Dockerfile 是"菜谱的配方单"：用一行行指令告诉 Docker 怎么做出一道菜（镜像）。FROM 选基础底料，WORKDIR 定工作目录，COPY 把文件放进去，RUN 执行命令，EXPOSE 声明要开的端口，CMD 定义容器启动时运行的命令。本课在代码编辑器里写一个把 index.html 装进 nginx 的 Dockerfile，为下一课 docker build 做准备。',
    initialEnv: '当前目录有 index.html 文件，代码编辑器中还没有 Dockerfile。',
    description: '在代码编辑器里编写一个完整的 Dockerfile。',
    goals: ['FROM / WORKDIR', 'COPY / RUN', 'EXPOSE / CMD'],
    steps: [
      { id: 's1', label: '编写 Dockerfile 并包含 FROM 和 WORKDIR', check: (s) => fileContains(s, '/home/student/Dockerfile', /^FROM\s+/m) && fileContains(s, '/home/student/Dockerfile', /^WORKDIR\s+/m) },
      { id: 's2', label: '包含 COPY 和 RUN 指令', check: (s) => fileContains(s, '/home/student/Dockerfile', /^COPY\s+/m) && fileContains(s, '/home/student/Dockerfile', /^RUN\s+/m) },
      { id: 's3', label: '包含 EXPOSE 指令', check: (s) => fileContains(s, '/home/student/Dockerfile', /^EXPOSE\s+\d+/m) },
      { id: 's4', label: '包含 CMD 指令', check: (s) => fileContains(s, '/home/student/Dockerfile', /^CMD\s+/m) },
    ],
    hints: [
      ['提示 1：切换到"编辑器"标签页编写 Dockerfile，写完后点保存。', '提示 2：参考结构：FROM nginx；WORKDIR /usr/share/nginx/html；COPY index.html /usr/share/nginx/html/；RUN echo done > /build.log；EXPOSE 80；CMD ["nginx", "-g", "daemon off;"]。'],
      ['提示 3：保存后可用 cat Dockerfile 确认内容完整。'],
    ],
    commonErrors: [
      { cmd: 'FROM nginx\nADD index.html /', explanation: 'ADD 指令不被模拟器支持，会明确报错。', hint: '用 COPY。' },
      { cmd: 'docker build 不保存直接执行', explanation: 'build 前必须先在编辑器保存 Dockerfile。', hint: '点"保存"按钮。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(s, '/home/student/index.html', '<!DOCTYPE html>\n<html><head><title>my app</title></head>\n<body><h1>Hello from container</h1></body></html>\n')
      return s
    },
  },
  {
    id: 'docker-build',
    mode: 'docker',
    category: 'Docker 构建与编排',
    title: '构建镜像：build / tag / history',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['docker-dockerfile'],
    summary: 'docker build 是"照着配方单做饭"：读取 Dockerfile 一步步执行指令，最终产出一个新镜像。docker build -t 名称:标签 . 中，-t 给镜像起名打标签，结尾的 . 表示把当前目录作为构建上下文（材料都在这里）。docker tag 给同一镜像加个别名（比如 latest 表示"最新版"）；docker history 像"查看做饭记录"，逐行显示每个构建步骤。',
    initialEnv: '当前目录已有 Dockerfile（上一步编写）和 index.html。',
    description: '构建自定义镜像、打标签并查看构建历史。',
    goals: ['docker build -t 构建', 'docker tag 打标签', 'docker history 查看历史'],
    steps: [
      { id: 's1', label: '用 docker build -t myapp:v1 构建镜像', check: (s) => dockerImageExists(s, 'myapp', 'v1') },
      { id: 's2', label: '用 docker tag 添加 myapp:latest 标签', check: (s) => dockerImageExists(s, 'myapp', 'latest') },
      { id: 's3', label: '用 docker history 查看构建步骤', check: (s) => historyRan(s, /^docker\s+history\b/) },
      { id: 's4', label: '用构建的镜像启动容器', check: (s) => s.docker.containers.some((c) => c.status === 'running' && c.image.startsWith('myapp:')) },
    ],
    hints: [
      ['提示 1：docker build -t myapp:v1 . 构建镜像（-t 和结尾的 . 都不能少）。', '提示 2：docker tag myapp:v1 myapp:latest 加一个 latest 标签。'],
      ['提示 3：docker history myapp:v1 逐行显示 FROM/COPY/CMD 等构建步骤。'],
    ],
    commonErrors: [
      { cmd: 'docker build myapp:v1 .', explanation: '标签必须用 -t 指定。', hint: 'docker build -t myapp:v1 .。' },
      { cmd: 'docker history myapp', explanation: '镜像默认 latest 标签；myapp:latest 已存在也可以。', hint: 'docker history myapp:v1。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(s, '/home/student/index.html', '<!DOCTYPE html>\n<html><head><title>my app</title></head>\n<body><h1>Hello from container</h1></body></html>\n')
      putFile(
        s,
        '/home/student/Dockerfile',
        'FROM nginx\nWORKDIR /usr/share/nginx/html\nCOPY index.html /usr/share/nginx/html/\nRUN echo built > /build.log\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n',
      )
      return s
    },
  },
  {
    id: 'docker-compose',
    mode: 'docker',
    category: 'Docker 构建与编排',
    title: 'Compose：多容器编排',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['docker-build'],
    summary: '真实应用通常不止一个容器（比如前端 + 后端 + 数据库），一个个 docker run 太啰嗦。docker compose 像"一键启动剧本"：把多个服务一次性写进 compose.yaml，一条 docker compose up 全部启动。配套命令：ps 看状态、logs 看日志、stop 停止、down 停止并删除（保留数据卷）。本课编写包含 web 和 api 两个服务的 compose.yaml 并练习整套管理命令。',
    initialEnv: '本地有 web 和 api 镜像。',
    description: '编写 compose.yaml 定义 web 和 api 两个服务，并用 compose 管理它们。',
    goals: ['编写 compose.yaml', 'docker compose up / ps / logs', 'docker compose stop / down'],
    steps: [
      { id: 's1', label: '编写 compose.yaml 包含两个服务', check: (s) => fileContains(s, '/home/student/compose.yaml', /^services:/m) && fileContains(s, '/home/student/compose.yaml', /^\s{2}\w+:/m) },
      { id: 's2', label: '用 docker compose up 启动服务', check: (s) => historyRan(s, /^docker\s+compose\s+up\b/) },
      { id: 's3', label: '用 docker compose ps 查看状态', check: (s) => historyRan(s, /^docker\s+compose\s+ps\b/) },
      { id: 's4', label: '用 docker compose stop 停止服务', check: (s) => historyRan(s, /^docker\s+compose\s+stop\b/) },
      { id: 's5', label: '用 docker compose down 清理', check: (s) => !dockerContainer(s, 'compose-web-1') && historyRan(s, /^docker\s+compose\s+down\b/) },
    ],
    hints: [
      ['提示 1：compose.yaml 结构：version: "3"，services 下定义 web（image: web，ports: 8080:80）和 api（image: api，ports: 3000:3000）。', '提示 2：编辑器里写好保存，然后 docker compose up 一次性启动。'],
      ['提示 3：依次练习 ps / logs / stop / down（down 停止并删除容器、保留卷）。'],
    ],
    commonErrors: [
      { cmd: 'docker compose down 直接执行', explanation: '需要先 up 创建服务。', hint: '先 docker compose up。' },
      { cmd: 'compose.yaml 里用 deploy 字段', explanation: 'deploy 不被模拟器支持，会明确报错。', hint: '用 image/ports/environment 等基础字段。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-limits',
    mode: 'docker',
    category: 'Docker 进阶与排障',
    title: '健康检查与资源限制',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['docker-env'],
    summary: '容器跑起来后需要三道"保险"：一是 --health-cmd 健康检查，让 Docker 定时探测容器是否活着，结果显示在 docker ps 的 HEALTH 列；二是 --memory / --cpus 资源限制，给容器"定量配给"内存和 CPU，防止某个容器把机器吃垮；三是 --restart 重启策略，规定容器挂了之后怎么办（always 表示自动拉起）。本课创建三个容器分别演示，并用 docker inspect 验证配置。',
    initialEnv: '本地有 nginx 和 alpine 镜像。',
    description: '创建带健康检查、资源限制和重启策略的容器，并用 inspect 验证。',
    goals: ['--health-cmd 健康检查', '--memory / --cpus 资源限制', '--restart 重启策略'],
    steps: [
      { id: 's1', label: '启动带健康检查的容器', check: (s) => s.docker.containers.some((c) => c.health === 'healthy' && c.healthcheck !== null) },
      { id: 's2', label: '启动带内存与 CPU 限制的容器', check: (s) => s.docker.containers.some((c) => c.limits.memory !== undefined && c.limits.cpus !== undefined) },
      { id: 's3', label: '启动带重启策略的容器', check: (s) => s.docker.containers.some((c) => c.restartPolicy === 'always') },
      { id: 's4', label: '用 docker inspect 查看健康与限制配置', check: (s) => historyRan(s, /^docker\s+inspect\b/) },
    ],
    hints: [
      ['提示 1：docker run -d --name app --health-cmd "curl -f http://localhost:80/" nginx，docker ps 里看 HEALTH 列变 healthy。', '提示 2：docker run -d --name limited --memory 128m --cpus 0.5 nginx 限制内存与 CPU。'],
      ['提示 3：docker run -d --name auto --restart always nginx，再用 docker inspect 查看 State.Health 和 HostConfig。'],
    ],
    commonErrors: [
      { cmd: '--health-cmd curl ...', explanation: 'health-cmd 需要引号包住带空格的命令。', hint: '--health-cmd "curl -f http://localhost:80/"。' },
      { cmd: '--memory 128MB', explanation: '单位用小写：128m / 1g。', hint: '--memory 128m。' },
    ],
    build: createInitialState,
  },
  {
    id: 'docker-troubleshoot',
    mode: 'docker',
    category: 'Docker 进阶与排障',
    title: '综合排障：三层应用部署',
    difficulty: '挑战',
    estimatedMinutes: 20,
    prerequisites: ['docker-volumes', 'docker-networks', 'docker-build'],
    summary: '最后一关是"实战演习"：部署 Web / API / 数据库 三层应用，但预先埋了一个故障——API 容器连数据库时用了错误的地址 wronghost，一直处于 unhealthy。排障要讲顺序：先 docker ps -a 看谁不对劲，再 docker logs 看失败原因，接着搭好网络和数据库，用正确的环境变量重建 API，最后启动 Web 并用 curl 验证整条链路。就像修车：先看仪表盘，再看故障码，最后动手修。',
    initialEnv: '已有一个故障的 api 容器（unhealthy，日志显示连接 wronghost 失败）；本地有 postgres、web、api、api-broken 镜像。',
    description: '像运维一样：排查 API 故障，搭建数据库，修复 API，启动 Web，完成三层应用部署。',
    goals: ['docker ps -a 与 logs 排查', '网络与数据卷', '修复 API 容器', '验证 Web 可访问'],
    steps: [
      { id: 's1', label: '用 docker ps -a 发现 api 容器异常', check: (s) => historyRan(s, /^docker\s+ps\b/) },
      { id: 's2', label: '用 docker logs 查看 api 失败原因', check: (s) => historyRan(s, /^docker\s+logs\b/) },
      { id: 's3', label: '创建网络 webnet', check: (s) => dockerNetworkExists(s, 'webnet') },
      { id: 's4', label: '创建数据卷 pgdata', check: (s) => dockerVolumeExists(s, 'pgdata') },
      { id: 's5', label: '启动数据库容器 db（挂载 pgdata，连接 webnet）', check: (s) => dockerContainer(s, 'db', (c) => c.status === 'running' && c.network === 'webnet' && c.image.startsWith('postgres')) },
      { id: 's6', label: '修复并启动 api 容器（DB_HOST=db、健康、3000 端口、连 webnet）', check: (s) => dockerContainer(s, 'api', (c) => c.status === 'running' && c.health === 'healthy' && c.env['DB_HOST'] === 'db' && c.network === 'webnet' && c.ports.some((p) => p.host === 3000)) },
      { id: 's7', label: '启动 web 容器（8080->80，连 webnet）', check: (s) => dockerContainer(s, 'web', (c) => c.status === 'running' && c.network === 'webnet' && c.ports.some((p) => p.host === 8080)) },
      { id: 's8', label: '用 curl 验证 Web 服务可访问', check: (s) => historyRan(s, /^curl\b.*8080/) },
    ],
    hints: [
      ['提示 1：docker ps -a 发现 api 是 unhealthy；docker logs api 显示 ERROR: could not connect to wronghost。', '提示 2：先建基础设施：docker network create webnet；docker volume create pgdata。'],
      ['提示 3：删掉坏的 api 容器（docker stop api && docker rm api），再启动数据库：docker run -d --name db --network webnet -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:15。'],
      ['提示 4：修复 api：docker run -d --name api --network webnet -e DB_HOST=db -p 3000:3000 --health-cmd "curl -f http://localhost:3000/health" api-broken；再启动 web：docker run -d --name web --network webnet -p 8080:80 web，最后 curl http://localhost:8080/ 验证。'],
    ],
    commonErrors: [
      { cmd: 'docker restart api', explanation: '重启不会改变 DB_HOST=wronghost，还是连不上。', hint: '问题在环境变量，删掉重建（--rm 或 stop+rm 再 run）。' },
      { cmd: 'docker run -d --name api ... 未加 --network webnet', explanation: 'API 要和 db 在同一个网络才能用容器名通信。', hint: '加上 --network webnet。' },
      { cmd: 'docker run db 不加 -v pgdata', explanation: '数据库数据会随容器删除而丢失。', hint: '挂载卷：-v pgdata:/var/lib/postgresql/data。' },
    ],
    build: () => {
      const s = createInitialState()
      const spec = IMAGE_CATALOG['api-broken']
      s.docker.containers.push({
        id: containerId(s.docker.seq),
        name: 'api',
        image: 'api-broken:latest',
        imageId: spec.id,
        command: 'node app.js',
        created: s.clock - 20,
        status: 'running',
        exitCode: null,
        ports: [{ host: 3000, container: 3000, proto: 'tcp' }],
        mounts: [],
        network: 'bridge',
        rmOnExit: false,
        restartPolicy: 'no',
        logLines: [
          'api starting on port 3000',
          'connecting to database at wronghost:5432',
          'ERROR: getaddrinfo ENOTFOUND wronghost',
          'api crashed: could not connect to database',
          'supervisor: restarting api (attempt 1/5)',
        ],
        startTick: s.clock - 20,
        stopTick: null,
        fsRoot: cloneNode(buildImageFs(spec)),
        env: { DB_HOST: 'wronghost', DB_PORT: '5432' },
        workdir: '/app',
        exposedPorts: [3000],
        health: 'unhealthy',
        healthcheck: 'curl -f http://localhost:3000/health',
        limits: {},
        ip: '172.17.0.2',
      })
      s.docker.seq += 1
      return s
    },
  },
  {
    id: 'k8s-intro',
    mode: 'kubernetes',
    category: 'Kubernetes 基础',
    title: '集群初识：cluster-info 与 Namespace',
    difficulty: '入门',
    estimatedMinutes: 8,
    prerequisites: [],
    summary:
      'kubectl 是操作 Kubernetes 集群的"遥控器"，所有命令都从它开始。cluster-info 告诉你集群的"总控制中心"（控制平面）在哪；current-context 显示你现在连的是哪个集群（防止搞错环境）；get namespaces 列出所有"楼栋"——命名空间就像小区里的一栋栋楼，把资源彼此隔离开，default 就是你默认所在的 1 号楼。',
    initialEnv: '你有一个 2 节点的 Kubernetes 集群（v1.29.3），default 命名空间还没有任何用户资源。',
    description: '认识集群：查看控制中心地址、当前上下文，并看看有哪些命名空间。',
    goals: ['kubectl cluster-info', 'kubectl config current-context', 'kubectl get namespaces'],
    steps: [
      { id: 's1', label: '用 cluster-info 查看集群信息', check: (s) => historyRan(s, /^kubectl\s+cluster-info\b/) },
      { id: 's2', label: '查看当前使用的上下文', check: (s) => historyRan(s, /^kubectl\s+config\s+current-context\b/) },
      { id: 's3', label: '查看所有命名空间', check: (s) => historyRan(s, /^kubectl\s+get\s+namespaces?\b/) },
    ],
    hints: [
      ['提示 1：kubectl cluster-info 输出里应看到 https://127.0.0.1:6443 等地址——说明集群连上了。', '提示 2：kubectl config current-context 显示当前上下文名——确认自己操作的是哪个集群。'],
      ['提示 3：kubectl get namespaces 会看到 default、kube-node-lease、kube-public、kube-system——kube-system 是系统组件住的楼，平时别去动它。'],
    ],
    commonErrors: [
      { cmd: 'kubectl cluster-info dump', explanation: 'dump 输出量很大，本实验只需要 cluster-info。', hint: '直接 kubectl cluster-info。' },
      { cmd: 'kubectl get namespace', explanation: '可以只查看一个，但查看全部用 kubectl get namespaces。', hint: 'kubectl get namespaces。' },
    ],
    build: createInitialState,
  },
  {
    id: 'k8s-pods',
    mode: 'kubernetes',
    category: 'Kubernetes 基础',
    title: 'Pod 基础：查看 / describe / 创建 / 删除',
    difficulty: '入门',
    estimatedMinutes: 12,
    prerequisites: ['k8s-intro'],
    summary:
      'Pod 是 Kubernetes 最小的运行单元，可以想象成一个"盒子"，里面装着你的应用进程（容器）。kubectl get pods 查看所有盒子；kubectl describe pod <名称> 查看某个盒子的详情和状态事件（相当于体检报告）；用 YAML 文件把盒子画成"图纸"，再 kubectl apply -f 按图纸创建；kubectl delete pod <名称> 拆掉盒子。',
    initialEnv: '集群里已经运行了一个 nginx Deployment（2 个副本），default 命名空间没有独立 Pod。',
    description: '先观察现有 Pod，再亲手用 YAML 创建、查看、删除一个独立 Pod。',
    goals: ['kubectl get pods', 'kubectl describe pod', 'kubectl apply -f 创建 Pod', 'kubectl delete pod'],
    steps: [
      { id: 's1', label: '查看 default 命名空间的 Pod', check: (s) => historyHas(s, /^kubectl\s+get\s+pods?\b/) },
      { id: 's2', label: '查看 Deployment 列表', check: (s) => historyHas(s, /^kubectl\s+get\s+(deployments?|deploy)\b/) },
      { id: 's3', label: '查看 kube-system 命名空间的 Pod', check: (s) => historyHas(s, /^kubectl\s+get\s+pods?\b.*(-n\s+kube-system|--namespace\s+kube-system)/) },
      { id: 's4', label: '用 YAML 创建名为 hello 的 Pod（nginx 镜像）', check: (s) => historyRan(s, /^kubectl\s+apply\s+-f\b/) },
      { id: 's5', label: '用 describe 查看 hello Pod 的详情', check: (s) => historyRan(s, /^kubectl\s+describe\s+pod\s+hello\b/) },
      { id: 's6', label: '删除 hello Pod', check: (s) => !k8sPod(s, 'hello') && historyRan(s, /^kubectl\s+delete\s+pod\s+hello\b/) },
    ],
    hints: [
      ['提示 1：kubectl get pods 查看 Pod；kubectl get deployments 查看 Deployment——先看清集群里有什么再动手。', '提示 2：加 -n 指定楼栋：kubectl get pods -n kube-system 看系统组件的 Pod。'],
      ['提示 3：课程已预置好示例文件 ~/pod.yaml（cat pod.yaml 可查看图纸内容），直接 kubectl apply -f pod.yaml 创建。', '提示 4：kubectl describe pod hello 查看详情；kubectl delete pod hello 删除。'],
    ],
    commonErrors: [
      { cmd: 'docker ps', explanation: '这是 Docker 的命令，Kubernetes 用 kubectl。', hint: '用 kubectl get pods。' },
      { cmd: 'kubectl delete pod nginx-xxx', explanation: '那是 Deployment 管理的 Pod，删除后会被自动重建。', hint: '删除自己创建的 hello Pod。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'nginx', 'nginx:latest', 2)
      putFile(
        s,
        '/home/student/pod.yaml',
        'apiVersion: v1\nkind: Pod\nmetadata:\n  name: hello\nspec:\n  containers:\n  - name: hello\n    image: nginx\n',
      )
      return s
    },
  },
  {
    id: 'k8s-apply',
    mode: 'kubernetes',
    category: 'Kubernetes 基础',
    title: '声明式管理：apply -f 与多文档 YAML',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['k8s-pods'],
    summary:
      '声明式管理就像把"期望状态"画成图纸（YAML）交给集群照着执行，你只管定目标，不用操心实现过程。一个文件里可以用 --- 分隔多个文档，一次声明多个资源；kubectl apply -f 第一次执行创建资源（输出 created），再执行同样的命令是幂等的，只会提示 configured（已是最新配置），不会重复创建也不会报错；kubectl get <资源> -o yaml 可以查看资源当前完整定义，核对图纸有没有改对。',
    initialEnv: 'default 命名空间没有 web 应用。',
    description: '用多文档 YAML 一次性声明 Deployment 和 Service，重复 apply 体验幂等，并查看 YAML 输出。',
    goals: ['多文档 YAML', 'kubectl apply -f 幂等更新', 'kubectl get -o yaml'],
    steps: [
      { id: 's1', label: '用 apply -f 应用多文档 YAML（web Deployment）', check: (s) => k8sDeployment(s, 'web', 'default', (d) => d.image.startsWith('nginx') && d.replicas === 2) && historyRan(s, /^kubectl\s+apply\s+-f\b/) },
      { id: 's2', label: '再次 apply（幂等，输出 configured）', check: (s) => {
        const applies = s.history.filter((l, i) => /^kubectl\s+apply\s+-f/.test(l.trim()) && s.exitCodes?.[i] === 0)
        return applies.length >= 2 && k8sDeployment(s, 'web')
      } },
      { id: 's3', label: '用 -o yaml 查看 web Deployment 的定义', check: (s) => historyRan(s, /^kubectl\s+get\s+(deployments?|deploy)\b.*-o\s+yaml/) },
      { id: 's4', label: '确认 Service 也被一起创建', check: (s) => k8sService(s, 'web', 'default') },
    ],
    hints: [
      ['提示 1：web-app.yaml 用 --- 分隔 Deployment 和 Service 两个文档——一份图纸声明两个资源，apply 一次全部创建（不用分两条命令）。', '提示 2：kubectl apply -f web-app.yaml 第一次输出 created；再执行一次输出 configured（幂等）——声明式的意义：你只描述"最终想要的样子"，重复执行结果不变，集群自己收敛到目标状态。'],
      ['提示 3：kubectl get deployment web -o yaml 查看完整定义，看看集群里的实际状态和图纸是否一致。'],
    ],
    commonErrors: [
      { cmd: 'kubectl create -f web-app.yaml', explanation: 'create 已存在的资源会报 AlreadyExists；声明式管理用 apply。', hint: '用 kubectl apply -f。' },
      { cmd: 'web-app.yaml 缩进错误', explanation: 'apply 会报 YAML 解析错误。', hint: '注意 containers 在 spec.template.spec 下，每一级缩进两个空格。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/web-app.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  labels:\n    app: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx\n        ports:\n        - containerPort: 80\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    app: web\n  ports:\n  - port: 80\n    targetPort: 80\n',
      )
      return s
    },
  },
  {
    id: 'k8s-labels',
    mode: 'kubernetes',
    category: 'Kubernetes 基础',
    title: '标签与选择器：label / selector / annotation',
    difficulty: '基础',
    estimatedMinutes: 12,
    prerequisites: ['k8s-apply'],
    summary:
      '标签（label）是挂在资源上的键值对，选择器（-l）用标签筛选资源；annotation 存放非检索性元数据。kubectl label 增删改标签（覆盖需要 --overwrite），kubectl annotate 管理注解。',
    initialEnv: 'nginx Deployment（2 个副本）正在运行，每个 Pod 带 app=nginx 标签。',
    description: '给 Pod 打标签、用选择器筛选、添加注解，再清理标签。',
    goals: ['kubectl label 打标签', 'kubectl get -l 筛选', 'kubectl annotate', 'kubectl label 删除'],
    steps: [
      { id: 's1', label: '给一个 Pod 打上 tier=frontend 标签', check: (s) => historyRan(s, /^kubectl\s+label\b.*tier=frontend/) },
      { id: 's2', label: '用 -l 选择器筛选 Pod', check: (s) => historyRan(s, /^kubectl\s+get\s+pods?\b.*-l/) },
      { id: 's3', label: '给 Pod 添加注解（如 note=example）', check: (s) => s.k8s.pods.some((p) => p.annotations && Object.keys(p.annotations).length > 0) && historyRan(s, /^kubectl\s+annotate\b/) },
      { id: 's4', label: '删除刚才打的标签（tier-）', check: (s) => !s.k8s.pods.some((p) => p.labels['tier'] === 'frontend') && historyRan(s, /^kubectl\s+label\b.*tier-/) },
    ],
    hints: [
      ['提示 1：先 kubectl get pods 看有哪些 Pod，记下一个 Pod 名。', '提示 2：kubectl label pod <名称> tier=frontend——给 Pod 贴"快递标签"；kubectl get pods -l tier=frontend 按标签筛选（标签的意义：批量选择资源，Service 也是靠标签选 Pod 的）。'],
      ['提示 3：kubectl annotate pod <名称> note=example——注解是给人看的备注（如版本说明），不能用于筛选；删除标签：kubectl label pod <名称> tier-。'],
    ],
    commonErrors: [
      { cmd: 'kubectl label pod xxx app=web', explanation: 'nginx Pod 已有 app 标签（键已存在会报 Conflict，需要 --overwrite）。', hint: '用新键 tier=frontend，删除用 tier-。' },
      { cmd: 'kubectl get pods -l app frontend', explanation: '选择器用 = 连接：-l app=frontend。', hint: 'kubectl get pods -l tier=frontend。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'nginx', 'nginx:latest', 2)
      return s
    },
  },
  {
    id: 'k8s-deploy-scale',
    mode: 'kubernetes',
    category: 'Pod 与 Deployment',
    title: '创建并扩容 Deployment',
    difficulty: '基础',
    estimatedMinutes: 10,
    prerequisites: ['k8s-pods'],
    summary:
      'Deployment 是"包工头"：你告诉它"我要 N 个工人"（副本），它负责保证任何时候都有 N 个人在岗，有人倒下就立刻补上。kubectl create deployment <名称> --image=<镜像> 一句话就能招工（创建 Deployment）；kubectl scale deployment <名称> --replicas=N 随时调整工人数量，扩容就加人、缩容就裁人。',
    initialEnv: '集群是空的（default 命名空间没有 Deployment）。',
    description: '创建一个 nginx Deployment，再把它扩容到 3 个副本。',
    goals: ['kubectl create deployment', 'kubectl scale deployment', '观察 Pod 数量变化'],
    steps: [
      {
        id: 's1',
        label: '创建名为 web 的 nginx Deployment',
        check: (s) => {
          const dep = s.k8s.deployments.find((d) => d.name === 'web')
          return !!dep && dep.image.startsWith('nginx')
        },
      },
      {
        id: 's2',
        label: '扩容到 3 个副本',
        check: (s) => {
          const dep = s.k8s.deployments.find((d) => d.name === 'web')
          if (!dep || dep.replicas !== 3) return false
          const pods = s.k8s.pods.filter((p) => p.owner === 'web')
          return pods.length === 3 && pods.every((p) => p.status === 'Running')
        },
      },
      { id: 's3', label: '用 kubectl get pods 确认 3 个 Pod', check: (s) => historyHas(s, /^kubectl\s+get\s+pods?\b/) },
    ],
    hints: [
      ['提示 1：kubectl create deployment web --image=nginx——包工头 web 带着 1 个工人上岗。', '提示 2：kubectl scale deployment web --replicas=3——把工人数量从 1 调到 3。'],
      ['提示 3：kubectl get pods 应看到 3 个 web 开头的 Pod——包工头按约定招满了人。'],
    ],
    commonErrors: [
      { cmd: 'kubectl create deployment web', explanation: '缺少 --image 参数会报错 required flag(s) "image" not set。', hint: 'kubectl create deployment web --image=nginx。' },
      { cmd: 'kubectl scale deployment web', explanation: '缺少 --replicas 参数。', hint: 'kubectl scale deployment web --replicas=3。' },
    ],
    build: createInitialState,
  },
  {
    id: 'k8s-scale',
    mode: 'kubernetes',
    category: 'Pod 与 Deployment',
    title: '扩缩容：scale 与 ReplicaSet',
    difficulty: '基础',
    estimatedMinutes: 10,
    prerequisites: ['k8s-deploy-scale'],
    summary:
      '上一课的"包工头"Deployment 手下还有一张"考勤表"——ReplicaSet，它的职责就是盯着"必须有 N 个工人"这条纪律：有人请假（Pod 挂掉）就立刻补招一个。kubectl scale 就是改写考勤表上的数字 N，扩容加人、缩容裁人。kubectl get rs 可以看到这张考勤表（名字带一串随机数字，是版本号，不用管它）。',
    initialEnv: 'web Deployment（nginx，3 个副本）正在运行。',
    description: '把 web 扩容到 5 个副本，再缩回 2 个，并用 ReplicaSet 观察幕后变化。',
    goals: ['kubectl scale 扩容', 'kubectl scale 缩容', 'kubectl get rs'],
    steps: [
      { id: 's1', label: '扩容到 5 个副本', check: (s) => historyRan(s, /^kubectl\s+scale\b.*--replicas=5/) },
      { id: 's2', label: '缩容到 2 个副本', check: (s) => k8sDeployment(s, 'web', 'default', (d) => d.replicas === 2 && d.available === 2) },
      { id: 's3', label: '用 kubectl get rs 查看 ReplicaSet', check: (s) => historyRan(s, /^kubectl\s+get\s+(replicasets|rs)\b/) },
      { id: 's4', label: '确认最终只有 2 个 Pod 在运行', check: (s) => k8sDepPods(s, 'web').filter((p) => p.status === 'Running').length === 2 },
    ],
    hints: [
      ['提示 1：kubectl scale deployment web --replicas=5——考勤表上的数字改成 5，包工头立刻补招。', '提示 2：kubectl scale deployment web --replicas=2——再缩到 2。'],
      ['提示 3：kubectl get rs 看到 web 的 ReplicaSet；kubectl get pods 确认 Pod 数量跟着变化——考勤表和实际人数始终一致。'],
    ],
    commonErrors: [
      { cmd: 'kubectl scale deployment web', explanation: '缺少 --replicas 参数会报错。', hint: 'kubectl scale deployment web --replicas=5。' },
      { cmd: 'kubectl delete pod web-xxx', explanation: '删除 Pod 会被 ReplicaSet 立即重建，应该用 scale 调整副本数。', hint: '用 kubectl scale 缩容。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'web', 'nginx:latest', 3)
      return s
    },
  },
  {
    id: 'k8s-rollout',
    mode: 'kubernetes',
    category: 'Pod 与 Deployment',
    title: '发布与回滚：rollout status / history / undo',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['k8s-scale'],
    summary:
      '给 Deployment 更新镜像等于触发一次"新版本发布"：包工头会先招几个新人试用，确认没问题再逐步替换老员工，整个过程服务不断线。kubectl set image 指定新镜像发起发布；kubectl rollout status 查看发布进度（滚动到哪一步了）；kubectl rollout history 查看历史版本列表（每次发布是一条记录）；kubectl rollout undo 一键回滚到上一个版本，像时光倒流一样撤销刚才的改动。',
    initialEnv: 'web Deployment（nginx 镜像，3 个副本）正在运行。',
    description: '升级到新镜像、查看发布状态与历史，然后回滚到旧版本。',
    goals: ['kubectl set image 更新', 'kubectl rollout status', 'kubectl rollout history', 'kubectl rollout undo'],
    steps: [
      { id: 's1', label: '把 web 的镜像更新为 nginx:1.25', check: (s) => historyRan(s, /^kubectl\s+set\s+image\b.*nginx:1\.25/) },
      { id: 's2', label: '用 rollout status 确认发布完成', check: (s) => historyRan(s, /^kubectl\s+rollout\s+status\b/) },
      { id: 's3', label: '用 rollout history 查看发布历史（至少 2 个版本）', check: (s) => k8sDeployment(s, 'web', 'default', (d) => d.revisions.length >= 2) && historyRan(s, /^kubectl\s+rollout\s+history\b/) },
      { id: 's4', label: '用 rollout undo 回滚到上一个版本', check: (s) => k8sDeployment(s, 'web', 'default', (d) => d.image !== 'nginx:1.25' && d.revisions.length >= 3 && d.available === 3) && historyRan(s, /^kubectl\s+rollout\s+undo\b/) },
    ],
    hints: [
      ['提示 1：kubectl set image deployment/web web=nginx:1.25——发起一次新发布。', '提示 2：kubectl rollout status deployment/web 显示 successfully rolled out 表示发布完成。'],
      ['提示 3：kubectl rollout history deployment/web 查看版本列表；kubectl rollout undo deployment/web 回滚到上一个版本。'],
    ],
    commonErrors: [
      { cmd: 'kubectl rollout undo 无历史', explanation: '刚创建只有一个版本时无法回滚，会报 no rollout history found。', hint: '先 set image 升级，再 undo。' },
      { cmd: 'kubectl rollout status 后直接 undo', explanation: '可以，undo 会回到 set image 之前的版本。', hint: '直接 kubectl rollout undo deployment/web。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'web', 'nginx:latest', 3)
      return s
    },
  },
  {
    id: 'k8s-configmap',
    mode: 'kubernetes',
    category: '配置与存储',
    title: 'ConfigMap：配置注入',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['k8s-service'],
    summary:
      'ConfigMap 像"配置文件夹"：把配置（键值对）从镜像里抽出来单独存放，改配置不用重新打包镜像。kubectl create configmap --from-literal 创建；Deployment 里用 envFrom 把整个文件夹的内容倒进环境变量，或 env.valueFrom.configMapKeyRef 只取其中某一个键。容器内通过环境变量读取配置，改配置只需更新 ConfigMap 再重启。',
    initialEnv: 'default 命名空间是空的。',
    description: '创建 ConfigMap，把它注入 Deployment，并在容器内验证配置生效。',
    goals: ['kubectl create configmap', 'Deployment 注入 ConfigMap', 'exec 验证环境变量'],
    steps: [
      { id: 's1', label: '创建 ConfigMap app-config（APP_MODE=prod）', check: (s) => k8sConfigMap(s, 'app-config', 'default', (c) => c.data['APP_MODE'] === 'prod') },
      { id: 's2', label: '创建引用该 ConfigMap 的 Deployment（envFrom）', check: (s) => k8sDeployment(s, 'app', 'default', (d) => d.envFrom.some((e) => e.configMapRef === 'app-config')) && k8sDepPods(s, 'app').every((p) => p.status === 'Running') },
      { id: 's3', label: '用 exec 验证容器内环境变量', check: (s) => k8sDepPods(s, 'app').some((p) => p.env['APP_MODE'] === 'prod') && historyRan(s, /^kubectl\s+exec\b.*env/) },
      { id: 's4', label: '用 describe 查看 ConfigMap', check: (s) => historyRan(s, /^kubectl\s+describe\s+configmaps?\b/) },
    ],
    hints: [
      ['提示 1：kubectl create configmap app-config --from-literal=APP_MODE=prod——创建配置文件夹。', '提示 2：课程已预置示例文件 ~/app-deploy.yaml（cat 查看内容），kubectl apply -f app-deploy.yaml 创建 Deployment——它的 envFrom 会把配置整份注入环境变量。'],
      ['提示 3：kubectl exec <pod名> -- env 应看到 APP_MODE=prod；kubectl describe configmap app-config 查看配置内容。'],
    ],
    commonErrors: [
      { cmd: 'kubectl create configmap app-config --from-literal APP_MODE=prod', explanation: '--from-literal 用 = 连接键值。', hint: '--from-literal=APP_MODE=prod。' },
      { cmd: 'Deployment 引用不存在的 ConfigMap', explanation: '模拟器不会注入任何值。', hint: '先创建 ConfigMap 再 apply Deployment。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/app-deploy.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: app\n  template:\n    metadata:\n      labels:\n        app: app\n    spec:\n      containers:\n      - name: app\n        image: nginx\n        envFrom:\n        - configMapRef:\n            name: app-config\n',
      )
      return s
    },
  },
  {
    id: 'k8s-secret',
    mode: 'kubernetes',
    category: '配置与存储',
    title: 'Secret：敏感信息与 Base64',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['k8s-configmap'],
    summary:
      'Secret 是存放密码、令牌等敏感信息的"保险箱"，用法和 ConfigMap 一样，但值在 YAML 里以 Base64 编码保存——注意这只是编码（像把纸条折起来），不是加密（真正加密另有机制）。kubectl create secret generic --from-literal 创建；注入方式与 ConfigMap 相同（envFrom / secretKeyRef），容器里自动拿到解码后的真实值。',
    initialEnv: 'default 命名空间是空的。',
    description: '创建 Secret、查看其 Base64 编码，注入 Deployment 并验证解码后的真实值。',
    goals: ['kubectl create secret generic', 'Base64 编码查看', 'Secret 注入与验证'],
    steps: [
      { id: 's1', label: '创建 Secret db-secret（DB_PASSWORD=secret123）', check: (s) => k8sSecret(s, 'db-secret', 'default', (c) => c.type === 'Opaque' && c.data['DB_PASSWORD'] === 'c2VjcmV0MTIz') },
      { id: 's2', label: '用 -o yaml 查看编码后的值', check: (s) => historyRan(s, /^kubectl\s+get\s+secrets?\b.*-o\s+yaml/) },
      { id: 's3', label: '创建引用 Secret 的 Deployment（secretKeyRef）', check: (s) => k8sDeployment(s, 'app', 'default', (d) => d.env.some((e) => e.secretKeyRef?.name === 'db-secret')) && k8sDepPods(s, 'app').every((p) => p.status === 'Running') },
      { id: 's4', label: '用 exec 验证容器内得到解码后的值', check: (s) => k8sDepPods(s, 'app').some((p) => p.env['DB_PASSWORD'] === 'secret123') && historyRan(s, /^kubectl\s+exec\b.*env/) },
    ],
    hints: [
      ['提示 1：kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123——创建保险箱。', '提示 2：kubectl get secret db-secret -o yaml 看到的是 c2VjcmV0MTIz 这样的 Base64 编码（secret123 的编码）；课程已预置示例文件 ~/app-deploy.yaml。'],
      ['提示 3：kubectl apply -f app-deploy.yaml 创建引用 Secret 的 Deployment；kubectl exec <pod名> -- env 验证 DB_PASSWORD=secret123（容器里已自动解码）。'],
    ],
    commonErrors: [
      { cmd: 'kubectl create secret db-secret --from-literal=...', explanation: '创建 Secret 需要 generic 子命令。', hint: 'kubectl create secret generic db-secret ...。' },
      { cmd: '期望 secret 里的值是明文', explanation: 'Secret 的 data 字段是 base64 编码的。', hint: '用 -o yaml 查看编码，注入后容器里得到的是解码值。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/app-deploy.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: app\n  template:\n    metadata:\n      labels:\n        app: app\n    spec:\n      containers:\n      - name: app\n        image: nginx\n        env:\n        - name: DB_PASSWORD\n          valueFrom:\n            secretKeyRef:\n              name: db-secret\n              key: DB_PASSWORD\n',
      )
      return s
    },
  },
  {
    id: 'k8s-storage',
    mode: 'kubernetes',
    category: '配置与存储',
    title: '存储：PV / PVC 与数据持久化',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['k8s-secret'],
    summary:
      'Pod 是"临时工"：被删除或重启后，里面的数据就没了，要持久化就得用外部存储。PersistentVolume（PV）是集群管理员准备好的"仓库"（一块真实存在的存储）；PersistentVolumeClaim（PVC）是你填写的"领料单"（要多大容量、什么访问模式）。领料单与仓库的容量和访问模式匹配上就会绑定（Bound），之后 Pod 通过 volumeMounts 把 PVC 挂载成容器里的目录（如 /data），写进去的数据就能留住。',
    initialEnv: 'default 命名空间是空的，没有任何 PV。',
    description: '创建 PV 和 PVC 让它们绑定，再让 Pod 挂载 PVC 使用数据卷。',
    goals: ['kubectl apply PV / PVC', 'PVC 绑定 PV', 'Pod 挂载 PVC'],
    steps: [
      { id: 's1', label: '创建 PV（1Gi，ReadWriteOnce）', check: (s) => k8sPV(s, 'data-pv', (v) => v.capacity === '1Gi' && v.status === 'Bound') },
      { id: 's2', label: '创建 PVC 申请 500Mi 并确认绑定', check: (s) => k8sPVC(s, 'data-pvc', 'default', (c) => c.status === 'Bound' && c.volumeName === 'data-pv') },
      { id: 's3', label: '创建挂载 PVC 的 Deployment', check: (s) => k8sDeployment(s, 'app', 'default', (d) => d.volumeMounts.some((m) => m.mountPath === '/data')) && k8sDepPods(s, 'app').every((p) => p.status === 'Running') },
      { id: 's4', label: '用 kubectl get pv / pvc 查看存储状态', check: (s) => historyRan(s, /^kubectl\s+get\s+(persistentvolumes|pv)\b/) && historyRan(s, /^kubectl\s+get\s+(persistentvolumeclaims|pvc)\b/) },
    ],
    hints: [
      ['提示 1：为什么用 PV/PVC——存储和 Pod 解耦：PV（PersistentVolume）是管理员准备的"仓库"（集群级资源），PVC（PersistentVolumeClaim）是用户写的"领料单"（申请存储）。Pod 只认 PVC，不关心背后是哪块盘。', '提示 2：课程已预置示例文件 ~/storage.yaml（PV + PVC 两个文档）和 ~/app-deploy.yaml（挂载 PVC 的 Deployment），cat 查看内容——仓库和领料单长什么样。'],
      ['提示 2：kubectl apply -f storage.yaml；kubectl get pvc 看到 STATUS 为 Bound——领料单匹配到了仓库。', '提示 3：kubectl apply -f app-deploy.yaml；kubectl get pv / kubectl get pvc 查看存储状态。'],
    ],
    commonErrors: [
      { cmd: 'PVC 申请超过 PV 容量', explanation: 'PV 容量不足以满足 PVC 时无法绑定（status 保持 Pending）。', hint: '示例里 PV 1Gi 满足 500Mi。' },
      { cmd: 'Pod 挂载未绑定的 PVC', explanation: 'PVC Pending 时 Pod 也会一直 Pending（PersistentVolumeClaim is not bound）。', hint: '先确认 pvc 状态为 Bound 再创建 Deployment。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/storage.yaml',
        'apiVersion: v1\nkind: PersistentVolume\nmetadata:\n  name: data-pv\nspec:\n  capacity:\n    storage: 1Gi\n  accessModes:\n    - ReadWriteOnce\n  persistentVolumeReclaimPolicy: Retain\n---\napiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: data-pvc\nspec:\n  accessModes:\n    - ReadWriteOnce\n  resources:\n    requests:\n      storage: 500Mi\n',
      )
      putFile(
        s,
        '/home/student/app-deploy.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: app\n  template:\n    metadata:\n      labels:\n        app: app\n    spec:\n      containers:\n      - name: app\n        image: nginx\n        volumeMounts:\n        - name: data\n          mountPath: /data\n      volumes:\n      - name: data\n        persistentVolumeClaim:\n          claimName: data-pvc\n',
      )
      return s
    },
  },
  {
    id: 'k8s-probes',
    mode: 'kubernetes',
    category: '配置与存储',
    title: '健康检查：readiness / liveness / startup',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['k8s-storage'],
    summary:
      '探针（probe）就像给容器做的"体检"，决定它算不算健康。readinessProbe 是"门口体检"：不合格的 Pod 虽然还活着（Running），但会显示 Ready 0/1，也不会被 Service 选中收流量；livenessProbe 是"定期复查"：连续不合格就认为容器已经死透，直接重启；startupProbe 是"入职体检"：没通过连 Running 都进不去（用于启动很慢的应用）。',
    initialEnv: 'default 命名空间是空的。',
    description: '创建带探针的 Deployment，再体验镜像不健康时 Pod 无法就绪，最后修复它。',
    goals: ['readinessProbe / livenessProbe / startupProbe', '探针失败 → Ready 0/1', 'describe 查看探针状态'],
    steps: [
      { id: 's1', label: '创建带 readiness+liveness 探针的 Deployment（web，nginx）', check: (s) => k8sDeployment(s, 'web', 'default', (d) => !!d.probes.readiness && !!d.probes.liveness) && k8sDepPods(s, 'web').every((p) => p.status === 'Running' && p.ready === '1/1') },
      { id: 's2', label: '创建带探针但镜像不健康的 Deployment（api，api-broken）', check: (s) => k8sDeployment(s, 'api', 'default', (d) => !!d.probes.readiness) && historyRan(s, /^kubectl\s+apply\s+-f\b/) },
      { id: 's3', label: '用 describe 查看探针失败原因', check: (s) => historyRan(s, /^kubectl\s+describe\s+pod/) },
      { id: 's4', label: '修复：把 api 镜像换成 api', check: (s) => k8sDeployment(s, 'api', 'default', (d) => d.image === 'api' || d.image.startsWith('api:')) && k8sDepPods(s, 'api').every((p) => p.status === 'Running' && p.ready === '1/1') },
    ],
    hints: [
      ['提示 1：探针的意义——让集群自动判断"Pod 是否健康可用"：readinessProbe（就绪探针）= 能不能接流量；livenessProbe（存活探针）= 挂了要不要重启；startupProbe（启动探针）= 慢启动应用的"宽限期"。', '提示 2：课程已预置示例文件 ~/web-deploy.yaml（健康镜像+探针）和 ~/api-deploy.yaml（api-broken 镜像+探针），cat 查看内容后分别 apply。'],
      ['提示 3：kubectl describe pod <api的pod> 的 Events 里有 Readiness probe failed。修复：kubectl set image deployment/api api=api——换上体检能通过的镜像。'],
    ],
    commonErrors: [
      { cmd: '给 web 配 startupProbe 探测失败', explanation: 'startup 失败会进入 CrashLoopBackOff。', hint: 'web 镜像健康，用 httpGet 探针即可。' },
      { cmd: '删除 api Deployment', explanation: '实验要求修复它而不是删除。', hint: 'set image 换成健康的 api 镜像。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/web-deploy.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx\n        readinessProbe:\n          httpGet:\n            path: /\n            port: 80\n        livenessProbe:\n          httpGet:\n            path: /\n            port: 80\n',
      )
      putFile(
        s,
        '/home/student/api-deploy.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: api\n  template:\n    metadata:\n      labels:\n        app: api\n    spec:\n      containers:\n      - name: api\n        image: api-broken\n        readinessProbe:\n          httpGet:\n            path: /health\n            port: 3000\n',
      )
      return s
    },
  },
  {
    id: 'k8s-resources',
    mode: 'kubernetes',
    category: '配置与存储',
    title: '资源限制：requests / limits / OOMKilled',
    difficulty: '进阶',
    estimatedMinutes: 15,
    prerequisites: ['k8s-probes'],
    summary:
      'requests 是调度依据（节点必须能提供，写大了会 Pending），limits 是运行硬上限（超了容器被杀 OOMKilled）。容器"实际需要多少内存"没有命令可查，它取决于应用本身——生产中靠文档/经验估算，再用 kubectl top 观察实际占用、超了就调大 limits（OOMKilled 就是"设小了"的信号）。本模拟器中镜像的参考需求：nginx≈128Mi、api≈256Mi、postgres≈512Mi。kubectl top nodes/pods 查看资源用量。',
    initialEnv: 'default 命名空间是空的（节点内存有限，node 剩余约 3Gi）。',
    description: '创建带资源声明的 Deployment，再故意制造 Pending 和 OOMKilled，观察并解释状态。',
    goals: ['requests / limits', 'Pending（资源不足）', 'OOMKilled（内存超限）', 'kubectl top'],
    steps: [
      { id: 's1', label: '创建带 requests/limits 的 Deployment（web，正常）', check: (s) => k8sDeployment(s, 'web', 'default', (d) => !!d.resources.requests?.memory && !!d.resources.limits?.memory) && k8sDepPods(s, 'web').every((p) => p.status === 'Running') },
      { id: 's2', label: '创建 requests 超过节点容量的 Deployment（会 Pending）', check: (s) => k8sDeployment(s, 'big', 'default') && k8sDepPods(s, 'big').some((p) => p.status === 'Pending' && /Insufficient|didn/.test(p.message)) },
      { id: 's3', label: '创建 limits.memory 过小的 Deployment（会 OOMKilled）', check: (s) => k8sDeployment(s, 'tiny', 'default') && k8sDepPods(s, 'tiny').some((p) => p.status === 'OOMKilled') },
      { id: 's4', label: '用 kubectl top 查看资源占用', check: (s) => historyRan(s, /^kubectl\s+top\b/) },
    ],
    hints: [
      ['提示 1：课程已预置三个示例文件：~/web.yaml（正常资源限制）、~/big.yaml（requests 4Gi 超容量）、~/tiny.yaml（limits 32Mi 过小），cat 查看内容后逐个 apply。'],
      ['提示 2：apply 后 get pods：web Running、big 是 Pending、tiny 是 OOMKilled。', '提示 3：kubectl top nodes 和 kubectl top pods 查看资源占用。'],
    ],
    commonErrors: [
      { cmd: '把 big 的 limits 设很小', explanation: 'limits 小会导致 OOMKilled 而不是 Pending。', hint: 'Pending 靠 requests 超节点容量触发（示例 big.yaml 已配好）。' },
      { cmd: 'kubectl top nodes / pods 需要指标', explanation: '模拟器直接返回估算值。', hint: 'kubectl top nodes 和 kubectl top pods 都支持。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/web.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx\n        resources:\n          requests:\n            cpu: 250m\n            memory: 256Mi\n          limits:\n            cpu: 500m\n            memory: 512Mi\n',
      )
      putFile(
        s,
        '/home/student/big.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: big\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: big\n  template:\n    metadata:\n      labels:\n        app: big\n    spec:\n      containers:\n      - name: big\n        image: nginx\n        resources:\n          requests:\n            memory: 4Gi\n',
      )
      putFile(
        s,
        '/home/student/tiny.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: tiny\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: tiny\n  template:\n    metadata:\n      labels:\n        app: tiny\n    spec:\n      containers:\n      - name: tiny\n        image: nginx\n        resources:\n          limits:\n            memory: 32Mi\n',
      )
      return s
    },
  },
  {
    id: 'k8s-jobs',
    mode: 'kubernetes',
    category: '调度与任务',
    title: '一次性任务：Job 与 CronJob',
    difficulty: '进阶',
    estimatedMinutes: 12,
    prerequisites: ['k8s-resources'],
    summary:
      'Deployment 管的是"常驻服务"（Web 等，永远不能停）；而 Job 管的是"跑一次就结束"的任务（数据备份、批量处理、报表生成）。Job 创建 Pod 执行任务，任务成功完成后 Pod 变成 Completed（不再重启），Job 显示 COMPLETIONS 1/1。CronJob 是"定时版 Job"：按 cron 表达式（分 时 日 月 周 五个字段）到点自动创建新的 Job，比如每天凌晨 2 点备份。"*/1 * * * *" 表示每分钟触发一次。kubectl create job <名称> --image=<镜像> 创建 Job；CronJob 用 YAML 的 spec.schedule 声明触发时间。',
    initialEnv: 'default 命名空间是空的。',
    description: '创建并查看一个跑完即止的 Job，再用 YAML 声明一个定时触发的 CronJob。',
    goals: ['kubectl create job', 'kubectl get jobs', 'CronJob 与 schedule', 'kubectl get cronjobs'],
    steps: [
      { id: 's1', label: '创建 Job hello（busybox 镜像）', check: (s) => k8sJob(s, 'hello', 'default', (j) => j.status === 'Succeeded') && historyRan(s, /^kubectl\s+create\s+job\b/) },
      { id: 's2', label: '用 kubectl get jobs 查看 Job 状态', check: (s) => historyRan(s, /^kubectl\s+get\s+jobs?\b/) },
      { id: 's3', label: '用 YAML 创建 CronJob backup（schedule: */1 * * * *）', check: (s) => k8sCronJob(s, 'backup', 'default', (c) => c.schedule === '*/1 * * * *') && historyRan(s, /^kubectl\s+apply\s+-f\b/) },
      { id: 's4', label: '用 kubectl get cronjobs 查看', check: (s) => historyRan(s, /^kubectl\s+get\s+cronjobs?\b/) },
    ],
    hints: [
      ['提示 1：kubectl create job hello --image=busybox → 任务跑完，kubectl get pods 里 hello 的 Pod 是 Completed（不是 Running）。', '提示 2：kubectl get jobs 看到 COMPLETIONS 1/1 表示成功完成。'],
      ['提示 3：课程已预置示例文件 ~/backup-cron.yaml（CronJob，cat 查看内容），kubectl apply -f backup-cron.yaml 创建。', '提示 4：get cronjobs 的 SCHEDULE 列显示 */1 * * * *；get jobs 里能看到 CronJob 自动生成的 backup-27000001 Job。'],
    ],
    commonErrors: [
      { cmd: 'kubectl create job hello --image=bad-image', explanation: '镜像不存在会怎样？模拟器里 Job 仍显示 Succeeded，但 Pod 日志不同。', hint: '用 busybox。' },
      { cmd: 'CronJob 用 create 命令', explanation: '模拟器用 YAML apply 创建 CronJob。', hint: '用预置的 backup-cron.yaml apply。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/backup-cron.yaml',
        'apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: backup\nspec:\n  schedule: "*/1 * * * *"\n  jobTemplate:\n    spec:\n      template:\n        spec:\n          containers:\n          - name: backup\n            image: busybox\n          restartPolicy: Never\n',
      )
      return s
    },
  },
  {
    id: 'k8s-scheduling',
    mode: 'kubernetes',
    category: '调度与任务',
    title: '调度控制：nodeSelector / taint / toleration',
    difficulty: '挑战',
    estimatedMinutes: 15,
    prerequisites: ['k8s-jobs'],
    summary:
      '调度就是给 Pod 分配"工位"（落到哪台节点上）。nodeSelector 直接点名：我只去带某个标签的节点；taint（污点）是装在节点上的"门禁"：默认情况下调度器不让没有门禁卡的 Pod 进来；toleration（容忍）就是"门禁卡"：持有匹配容忍度的 Pod 才能无视污点进入该节点。三者配合，就能精确控制 Pod 落在哪台机器上。',
    initialEnv: 'node-1 有标签 disktype=ssd，node-2 有标签 disktype=hdd。',
    description: '给 node-2 打污点，创建只能去 node-2 的 Pod（先 Pending，加容忍后 Running）。',
    goals: ['kubectl taint', 'nodeSelector 调度', 'toleration 容忍'],
    steps: [
      { id: 's1', label: '给 node-2 打污点 gpu=true:NoSchedule', check: (s) => k8sNode(s, 'node-2', (n) => n.taints.some((t) => t.key === 'gpu' && t.effect === 'NoSchedule')) && historyRan(s, /^kubectl\s+taint\b/) },
      { id: 's2', label: '创建 nodeSelector 指向 disktype=hdd 的 Deployment（会 Pending）', check: (s) => k8sDeployment(s, 'gpu-app', 'default', (d) => d.nodeSelector['disktype'] === 'hdd') && historyRan(s, /^kubectl\s+apply\s+-f\b/) },
      { id: 's3', label: '给 Deployment 加上 toleration 后恢复 Running', check: (s) => k8sDeployment(s, 'gpu-app', 'default', (d) => d.tolerations.some((t) => t.key === 'gpu')) && k8sDepPods(s, 'gpu-app').every((p) => p.status === 'Running' && p.node === 'node-2') },
    ],
    hints: [
      ['提示 1：kubectl taint nodes node-2 gpu=true:NoSchedule——给 node-2 装上"门禁"。', '提示 2：课程已预置示例文件 ~/gpu-app.yaml（nodeSelector 指向 disktype=hdd 的 node-2），apply 后 Pod 会 Pending——没有门禁卡，被拦在门外。'],
      ['提示 3：给 gpu-app.yaml 的 template.spec 加 tolerations 段（key: gpu / operator: Exists / effect: NoSchedule）后重新 apply → Running——门禁卡生效。'],
    ],
    commonErrors: [
      { cmd: 'kubectl taint node-2 gpu=true', explanation: '漏了 :NoSchedule 效果。', hint: 'kubectl taint nodes node-2 gpu=true:NoSchedule。' },
      { cmd: 'nodeSelector 写 disktype=ssd', explanation: 'ssd 在 node-1，没有污点，不会 Pending。', hint: '实验目标是体验污点，用 disktype=hdd（node-2）。' },
    ],
    build: () => {
      const s = createInitialState()
      putFile(
        s,
        '/home/student/gpu-app.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: gpu-app\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: gpu-app\n  template:\n    metadata:\n      labels:\n        app: gpu-app\n    spec:\n      nodeSelector:\n        disktype: hdd\n      containers:\n      - name: gpu-app\n        image: nginx\n',
      )
      return s
    },
  },
  {
    id: 'k8s-service',
    mode: 'kubernetes',
    category: 'Service 与排障',
    title: '暴露 Service',
    difficulty: '进阶',
    estimatedMinutes: 10,
    prerequisites: ['k8s-deploy-scale'],
    summary:
      'Pod 的 IP 会随重建而改变，直接访问 Pod 不靠谱。Service 是"前台总机"：它有一个固定不变的"对外号码"（ClusterIP/NodePort），按照 selector 标签找到后台负责干活的 Pod 们，把来电自动转给它们——某个 Pod 挂了，总机立刻把电话转给剩下的，服务不中断。kubectl expose deployment <名称> --port=80 --type=NodePort 就给 Deployment 开通一条对外线路。',
    initialEnv: 'web Deployment（nginx，3 个副本）已经运行。',
    description: '把 web Deployment 暴露为 NodePort 类型的 Service，端口 80。',
    goals: ['理解 Service 的作用', 'kubectl expose deployment', 'kubectl get services'],
    steps: [
      { id: 's1', label: '确认 web Deployment 存在', check: (s) => historyHas(s, /^kubectl\s+get\s+(deployments?|deploy)\b/) },
      {
        id: 's2',
        label: '暴露为 NodePort Service（端口 80）',
        check: (s) => {
          const svc = s.k8s.services.find((sv) => sv.name === 'web')
          return !!svc && svc.type === 'NodePort' && svc.ports[0].port === 80
        },
      },
      { id: 's3', label: '查看 Service 列表', check: (s) => historyHas(s, /^kubectl\s+get\s+(services?|svc)\b/) },
      { id: 's4', label: '用 kubectl get endpoints 确认后端 Pod', check: (s) => historyRan(s, /^kubectl\s+get\s+endpoints?\b/) && k8sService(s, 'web', 'default') },
    ],
    hints: [
      ['提示 1：第 1 步只需 kubectl get deployments——确认 web 已经存在（环境已预置，不用创建）。', '提示 2：kubectl expose deployment web --port=80 --type=NodePort——给 web 开通"总机"。'],
      ['提示 3：kubectl get services 查看结果；PORT(S) 列显示 80:3xxxx/NodePort（3xxxx 是对外随机端口）；kubectl get endpoints 查看总机后面接通的 Pod 地址。'],
    ],
    commonErrors: [
      { cmd: 'kubectl expose pod web', explanation: 'web 是 Deployment，不是 Pod。', hint: 'kubectl expose deployment web。' },
      { cmd: 'kubectl expose deployment web', explanation: '漏了 --port=80（模拟器要求显式指定端口）。', hint: '加 --port=80 --type=NodePort。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'web', 'nginx:latest', 3)
      return s
    },
  },
  {
    id: 'k8s-crashloop',
    mode: 'kubernetes',
    category: 'Service 与排障',
    title: '排查 CrashLoopBackOff',
    difficulty: '挑战',
    estimatedMinutes: 15,
    prerequisites: ['k8s-service'],
    summary:
      'CrashLoopBackOff 表示容器"一启动就崩溃、重启后还是崩"，陷入了反复崩溃的死循环，这是排障课最经典的敌人。排查按固定顺序来：kubectl get pods 先发现异常状态 → kubectl logs 看应用自己输出的崩溃日志（问程序"你怎么了"）→ kubectl describe 看系统给的原因和事件 → 找到问题后 kubectl set image 换上好镜像修复。',
    initialEnv: 'broken Deployment（crashy-app 镜像，2 个副本）的容器反复崩溃。',
    description: 'broken Deployment 的容器反复崩溃（CrashLoopBackOff），找出原因并修复。',
    goals: ['识别 CrashLoopBackOff 状态', 'kubectl logs 与 describe 排障', 'kubectl set image 修复镜像'],
    steps: [
      { id: 's1', label: '查看 Pod，发现 broken 异常状态', check: (s) => historyHas(s, /^kubectl\s+get\s+pods?\b/) },
      { id: 's2', label: '查看崩溃 Pod 的日志', check: (s) => historyHas(s, /^kubectl\s+logs\b/) },
      { id: 's3', label: '用 describe 查看崩溃详情', check: (s) => historyHas(s, /^kubectl\s+describe\s+pod/) },
      {
        id: 's4',
        label: '修复：把镜像换成 nginx 并确认 Pod 恢复 Running',
        check: (s) => {
          const dep = s.k8s.deployments.find((d) => d.name === 'broken')
          if (!dep || dep.image.startsWith('crashy-app') || dep.image.includes('crash') || dep.image.includes('broken')) return false
          const pods = s.k8s.pods.filter((p) => p.owner === 'broken')
          return pods.length >= 1 && pods.every((p) => p.status === 'Running')
        },
      },
    ],
    hints: [
      ['提示 1：kubectl get pods 看到 broken 的 Pod 是 CrashLoopBackOff——它陷入了崩溃-重启的死循环。', '提示 2：kubectl logs <pod名> 查看崩溃日志，kubectl describe pod <pod名> 看原因——logs 问程序，describe 问系统。'],
      ['提示 3：日志显示配置加载失败，问题出在镜像。修复：kubectl set image deployment/broken broken=nginx。'],
    ],
    commonErrors: [
      { cmd: 'kubectl delete pod broken-xxx', explanation: '删除单个 Pod 没用，Deployment 会立刻重建崩溃的 Pod。', hint: '问题在镜像本身，用 kubectl set image 修复。' },
      { cmd: 'kubectl rollout restart deployment/broken', explanation: '重启不会改变镜像，新 Pod 还是会崩溃。', hint: '需要更换镜像：kubectl set image deployment/broken broken=nginx。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'web', 'nginx:latest', 1)
      addDeploymentPreset(s, 'broken', 'crashy-app:1.0', 2)
      return s
    },
  },
  {
    id: 'k8s-inspect',
    mode: 'kubernetes',
    category: 'Service 与排障',
    title: '排查手段：logs / exec / describe / events',
    difficulty: '挑战',
    estimatedMinutes: 15,
    prerequisites: ['k8s-crashloop'],
    summary:
      '排查四件套：kubectl logs 看应用输出（问程序"你怎么了"）、kubectl exec 钻进容器里直接查看现场、kubectl describe 看单个资源的详情和事件、kubectl get events 看集群全局的事件流。Ready 0/1 的 Pod 通常"死不了但接不了客"，最常见原因是就绪探针失败，describe 的 Events 里会写明具体原因。',
    initialEnv: 'api Deployment（api-broken 镜像）的 Pod 是 Running 但 Ready 0/1（就绪探针失败）；旁边还有 db（postgres）在正常运行。',
    description: 'api 服务虽然没崩溃但一直不就绪，用四种手段找出原因并修复。',
    goals: ['kubectl logs', 'kubectl exec 进入容器', 'kubectl describe 与 events', '修复就绪问题'],
    steps: [
      { id: 's1', label: '用 get pods 发现 api 的 Ready 是 0/1', check: (s) => historyHas(s, /^kubectl\s+get\s+pods?\b/) },
      { id: 's2', label: '用 describe 查看事件，确认探针失败', check: (s) => historyRan(s, /^kubectl\s+describe\s+pod/) },
      { id: 's3', label: '用 kubectl logs 查看 api 日志', check: (s) => historyRan(s, /^kubectl\s+logs\b/) },
      { id: 's4', label: '用 exec 检查容器内配置', check: (s) => historyRan(s, /^kubectl\s+exec\b/) },
      { id: 's5', label: '用 kubectl get events 查看集群事件', check: (s) => historyRan(s, /^kubectl\s+get\s+events?\b/) },
      { id: 's6', label: '修复 api：让 Pod 恢复 Ready 1/1', check: (s) => k8sDeployment(s, 'api', 'default', (d) => !d.image.includes('api-broken') || d.probes.readiness === undefined) && k8sDepPods(s, 'api').every((p) => p.status === 'Running' && p.ready === '1/1') },
    ],
    hints: [
      ['第 1 步：kubectl get pods → 看到 api-xxxxx-1 的 READY 是 0/1、STATUS 是 Running（活着但没过体检）。注意：db-xxxxx-1 是 Running 1/1，数据库是好的。'],
      ['第 2 步：kubectl describe pod api-xxxxx-1 → 底部 Events：Warning Readiness probe failed: HTTP probe failed with statuscode: 500——就绪探针探测 /health 返回 500。'],
      ['第 3 步：kubectl logs api-xxxxx-1 → 看到 Failed to connect to database: connect ECONNREFUSED。关键判断：db 明明在 Running（第 1 步看到的），api 却连不上——排除"数据库没启动"，问题指向 api 应用本身/镜像。'],
      ['第 4 步：kubectl exec api-xxxxx-1 -- ls /app 和 cat /app/config.json → 查看容器内配置（模拟器内文件）。'],
      ['第 5 步：kubectl get events → 全局事件流里能看到这条 api 的 Unhealthy 事件。'],
      ['第 6 步修复：/health 一直 500 是 api-broken 镜像本身的毛病，换健康镜像：kubectl set image deployment/api api=api → get pods 确认 READY 变 1/1。'],
    ],
    commonErrors: [
      { cmd: 'kubectl delete pod api-xxx', explanation: 'Deployment 会立即重建同样不健康的 Pod。', hint: '从镜像或探针入手。' },
      { cmd: 'kubectl logs 报错容器还没启动', explanation: 'CrashLoopBackOff 的容器无法 logs？模拟器会给出日志。', hint: '直接 kubectl logs <pod>。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'db', 'postgres:15', 1)
      addDeploymentPreset(s, 'api', 'api-broken:1.0', 1)
      const dep = s.k8s.deployments.find((d) => d.name === 'api')!
      dep.probes = { readiness: { httpGet: { path: '/health', port: 3000 } } }
      for (const p of s.k8s.pods.filter((x) => x.owner === 'api')) {
        p.ready = '0/1'
        p.message = 'Readiness probe failed: HTTP probe failed with statuscode: 500'
        pushEvent(s, 'Warning', 'Unhealthy', `pod/${p.name}`, 'Readiness probe failed: HTTP probe failed with statuscode: 500')
      }
      return s
    },
  },
  {
    id: 'k8s-app',
    mode: 'kubernetes',
    category: 'Service 与排障',
    title: '综合实验：发布 Web 应用并排障',
    difficulty: '挑战',
    estimatedMinutes: 30,
    prerequisites: ['k8s-inspect'],
    summary:
      '这是"毕业设计"：把前面学的零件组装成一台完整机器。按顺序推进：创建命名空间 prod（新楼栋）→ 放好 ConfigMap（配置文件夹）和 Secret（保险箱）→ 部署三副本 Deployment（包工头+考勤表+资源限制+体检探针）→ 建 Service（前台总机）→ set image 发布新版本 → rollout undo 回滚 → 最后用 describe/logs 修好故障的 api 服务。每一步都是一次真实排障与发布的演练。',
    initialEnv:
      'prod 命名空间尚不存在；api Deployment（api-broken 镜像，1 副本）带就绪探针，Pod 一直 Ready 0/1。你的任务是把它修好。',
    description: '从零发布一个完整 Web 应用，完成一次发布与回滚，最后修复故障的 api 服务。',
    goals: ['Namespace / ConfigMap / Secret', 'Deployment 完整配置', 'Service 暴露', '更新与回滚', '故障修复'],
    steps: [
      { id: 's1', label: '创建命名空间 prod', check: (s) => k8sNamespace(s, 'prod') },
      { id: 's2', label: '在 prod 创建 ConfigMap app-config（APP_MODE=prod）', check: (s) => k8sConfigMap(s, 'app-config', 'prod', (c) => c.data['APP_MODE'] === 'prod') },
      { id: 's3', label: '在 prod 创建 Secret db-secret（DB_PASSWORD=secret123）', check: (s) => k8sSecret(s, 'db-secret', 'prod', (c) => c.data['DB_PASSWORD'] === 'c2VjcmV0MTIz') },
      {
        id: 's4',
        label: '在 prod 部署 3 副本 web（引用 ConfigMap/Secret、资源限制、探针）',
        check: (s) =>
          k8sDeployment(s, 'web', 'prod', (d) => {
            if (d.replicas !== 3) return false
            if (!d.resources.requests?.memory || !d.resources.limits?.memory) return false
            if (!d.probes.readiness || !d.probes.liveness) return false
            if (!d.envFrom.some((e) => e.configMapRef === 'app-config')) return false
            if (!d.env.some((e) => e.secretKeyRef?.name === 'db-secret')) return false
            return true
          }) && k8sDepPods(s, 'web', 'prod').every((p) => p.status === 'Running' && p.ready === '1/1'),
      },
      { id: 's5', label: '创建 Service 暴露 web（selector 匹配，endpoints 就绪）', check: (s) => k8sService(s, 'web', 'prod', (x) => x.selector['app'] === 'web' && s.k8s.pods.filter((p) => p.namespace === 'prod' && p.status === 'Running' && p.ready === '1/1' && p.labels['app'] === 'web').length >= 3) },
      { id: 's6', label: '把 web 升级到新版本镜像（触发一次发布）', check: (s) => k8sDeployment(s, 'web', 'prod', (d) => d.revisions.length >= 2 && d.available === 3) && historyRan(s, /^kubectl\s+(set\s+image|apply\s+-f)/) },
      { id: 's7', label: '回滚到上一个版本', check: (s) => k8sDeployment(s, 'web', 'prod', (d) => d.revisions.length >= 3 && d.available === 3) && historyRan(s, /^kubectl\s+rollout\s+undo\b/) },
      {
        id: 's8',
        label: '修复 prod 中故障的 api（Ready 0/1 → 1/1）',
        check: (s) =>
          k8sDeployment(s, 'api', 'prod', (d) => !d.image.includes('api-broken') || d.probes.readiness === undefined) &&
          k8sDepPods(s, 'api', 'prod').every((p) => p.status === 'Running' && p.ready === '1/1') &&
          historyHas(s, /^kubectl\s+describe\s+pod/) &&
          historyHas(s, /^kubectl\s+logs\b/),
      },
    ],
    hints: [
      ['第 1 步：kubectl create namespace prod——建好"楼栋"，本实验所有资源都放 prod，命令记得带 -n prod。', '第 2 步：kubectl create configmap app-config --from-literal=APP_MODE=prod -n prod——把配置放进"配置文件夹"。'],
      ['第 3 步：kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123 -n prod——把密码放进"保险箱"。', '第 4 步：课程已预置完整示例文件 ~/web.yaml（Deployment + Service 两个文档），cat 先看懂它（3 副本、引用上面两个资源、资源限制、探针都配好了）→ kubectl apply -f web.yaml → get pods -n prod 确认 3 个 web Pod 都是 Running 1/1。'],
      ['第 5 步：Service 也在 web.yaml 里一起创建了（第二个文档）。验证：kubectl get svc web -n prod 和 kubectl get endpoints web -n prod 看到 3 个后端地址。', '第 6 步：kubectl set image deployment/web web=nginx:1.25 -n prod——发布新版本，kubectl rollout status deployment/web -n prod 等它完成。'],
      ['第 7 步：kubectl rollout undo deployment/web -n prod——回滚到上一个版本，再 get pods 确认 3 个 Pod 仍 Running 1/1。', '第 8 步（排障）：kubectl get pods -n prod 看到 api-xxx 是 Ready 0/1 → kubectl describe pod <api名> -n prod（Events 有 Readiness probe failed）→ kubectl logs <api名> -n prod → 根因是 api-broken 镜像自身毛病（db 正常运行可排除数据库）→ kubectl set image deployment/api api=api -n prod → 确认 api Ready 变 1/1。'],
    ],
    commonErrors: [
      { cmd: '把资源创建在 default', explanation: '实验要求资源都在 prod 命名空间。', hint: '命令加 -n prod，YAML 里 metadata.namespace: prod（预置 web.yaml 已写好）。' },
      { cmd: '删除故障的 api Deployment', explanation: '综合实验要求修复它（describe/logs 定位后 set image）。', hint: 'kubectl set image deployment/api api=api -n prod。' },
    ],
    build: () => {
      const s = createInitialState()
      addDeploymentPreset(s, 'db', 'postgres:15', 1)
      addDeploymentPreset(s, 'api', 'api-broken:1.0', 1)
      const apiDep = s.k8s.deployments.find((d) => d.name === 'api')!
      apiDep.namespace = 'prod'
      for (const p of s.k8s.pods.filter((x) => x.owner === 'api')) {
        p.namespace = 'prod'
        p.ready = '0/1'
        p.message = 'Readiness probe failed: HTTP probe failed with statuscode: 500'
        pushEvent(s, 'Warning', 'Unhealthy', `pod/${p.name}`, 'Readiness probe failed: HTTP probe failed with statuscode: 500')
      }
      const dep = s.k8s.deployments.find((d) => d.name === 'api')!
      dep.probes = { readiness: { httpGet: { path: '/health', port: 3000 } } }
      putFile(
        s,
        '/home/student/web.yaml',
        'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n  namespace: prod\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: nginx\n        ports:\n        - containerPort: 80\n        envFrom:\n        - configMapRef:\n            name: app-config\n        env:\n        - name: DB_PASSWORD\n          valueFrom:\n            secretKeyRef:\n              name: db-secret\n              key: DB_PASSWORD\n        resources:\n          requests:\n            cpu: 100m\n            memory: 256Mi\n          limits:\n            cpu: 500m\n            memory: 512Mi\n        readinessProbe:\n          httpGet:\n            path: /\n            port: 80\n        livenessProbe:\n          httpGet:\n            path: /\n            port: 80\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\n  namespace: prod\nspec:\n  selector:\n    app: web\n  ports:\n  - port: 80\n    targetPort: 80\n',
      )
      return s
    },
  },
]

export function findLab(id: string): Lab {
  const lab = LABS.find((l) => l.id === id)
  if (!lab) throw new Error('unknown lab: ' + id)
  return lab
}

export function nextLabId(id: string): string | null {
  const idx = LABS.findIndex((l) => l.id === id)
  if (idx === -1 || idx === LABS.length - 1) return null
  return LABS[idx + 1].id
}

export function labIndex(id: string): number {
  return LABS.findIndex((l) => l.id === id)
}