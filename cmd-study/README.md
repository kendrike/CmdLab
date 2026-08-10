# CmdLab · Linux / Docker / Kubernetes 命令练习平台

一个在本地浏览器中运行的交互式终端模拟器。无需安装虚拟机、Docker、Kubernetes、WSL 或任何云环境，
即可练习 Linux、Docker、Kubernetes 常用命令。所有模拟状态（文件系统、容器、镜像、Pod、Deployment 等）
都保存在浏览器内存与 localStorage 中，**不执行任何真实系统命令**。

## 快速开始

```bash
npm install
npm run dev        # 启动开发服务器，访问 http://localhost:5173
```

其他脚本：

```bash
npm run build      # 类型检查 + 生产构建（输出到 dist/）
npm run test       # Vitest 单元测试（模拟核心逻辑）
npm run test:e2e   # Playwright 端到端测试（桌面 + 移动端）
```

要求：Node.js 18+。首次运行 E2E 测试前需 `npx playwright install chromium`。

### 内网访问（让其他机器使用）

开发服务器已绑定 `0.0.0.0`（`vite --host 0.0.0.0`），同一内网的电脑可通过
`http://<你的IP>:5173` 访问（查看 IP：`ipconfig` 中的 IPv4 地址）。

首次启动时需放行 Windows 防火墙（以管理员身份运行 PowerShell）：

```powershell
netsh advfirewall firewall add rule name="CmdLab Dev Server" dir=in action=allow protocol=TCP localport=5173
```

或在「Windows 安全中心 → 防火墙 → 高级设置 → 入站规则」中新建规则，允许 TCP 5173 端口。

> 提示：Vite 开发服务器适合学习和演示；若需要稳定共享，可 `npm run build` 后用
> `npm run preview -- --host 0.0.0.0`（同样需放行端口 4173）。

## 功能一览

- **50 个可完成实验**，覆盖 15 个课程分类：18 节 Linux 基础（路径/文件/文本/权限/进程/网络/排障）、
  14 节 Docker（镜像/容器/端口/卷/网络/Dockerfile/Compose/资源限制/排障）、
  18 节 Kubernetes（Pod/Deployment/滚动发布/ConfigMap/Secret/存储/探针/资源/Job/调度/Service/排障/综合实验）。
- **新手教学模型**：每节课都包含"场景说明 → 明确目标 → 观察现状 → 分析线索 → 选择工具 →
  执行命令 → 阅读输出 → 总结规律"的完整引导，零基础也能理解"为什么敲这条命令、敲了有什么效果"。
- **五级分级提示**：重新理解目标 → 思考方向 → 命令类型 → 命令结构 → 完整答案。
  前四级逐级解锁，完整命令需主动点击"显示答案"；显示答案不会直接完成课程，判定仍基于最终环境状态。
- **新手错误反馈**：终端保留贴近真实的原始报错，同时在下方的折叠卡片中给出"发生了什么 →
  关键信息 → 可能原因 → 先检查什么 → 下一步"，覆盖拼写错误、目录错误、权限不足、端口冲突、
  Namespace 错误、容器停止等 13 类常见错误。
- **命令与输出解析**：执行任意命令后，可展开查看逐段参数解释（含占位符提示与风险标注）和
  表格输出的字段含义（docker ps、kubectl get pods 等 12 种）。
- **两种学习模式**：引导模式（完整教学分区 + 提示，默认）与实战模式（只显示目标与终端），
  切换即时生效、持久化保存，不会重置当前实验。
- **完成反馈**：每课完成后显示教学小结——解决了什么问题、用了什么判断线索、为什么这个命令合适、
  以后何时再用、一个相关命令。
- **终端交互**：`student@lab:~$` 提示符、↑/↓ 历史、Tab 补全、Ctrl+L 清屏、Ctrl+C 取消、多行 heredoc 续行提示。
- **三个模式**：Linux / Docker / Kubernetes，命令之间共享同一份连续、一致的模拟状态。
- **任务面板**：目标、步骤清单、实时进度、检查答案、下一个实验、重新开始。
- **持久化**：实验进度、提示解锁等级、学习模式、当前模拟状态（文件系统/容器/集群）自动存入 localStorage，刷新页面可恢复。
- **响应式**：桌面端三栏布局；窄屏下课程导航与任务面板变为抽屉，终端始终是主区域。

## 安全边界

- 纯浏览器端模拟：不使用 `child_process`、不调用宿主机 Shell、不访问真实文件系统。
- 命令处理器只读写内存中的 `SimState`（虚拟文件系统、Docker 状态、K8s 状态）。
- `rm -rf /` 会被拒绝；未知命令返回 `command not found`；不支持的参数返回教学友好的错误，
  绝不伪装成成功执行。
- 持久化仅使用 `localStorage`（键 `cmdstudy-save-v1`）。

## 系统架构

```
src/
├── sim/                     # 模拟核心（无任何 DOM / 网络依赖，可单测）
│   ├── types.ts             # 全部状态类型（FsNode / SimState / DockerState / K8sState ...）
│   ├── commands.ts          # 命令注册入口（initCommands，幂等）
│   ├── vfs/                 # 虚拟文件系统
│   │   ├── paths.ts         # 路径归一化、. .. ~ 解析、通配符、树遍历
│   │   ├── access.ts        # 用户/组、权限位（r/w/x）、ls -l 权限串与时间格式化
│   │   └── build.ts         # 初始目录树（/home/student、/etc、/var/log、/tmp ...）
│   ├── shell/               # Shell 引擎
│   │   ├── lexer.ts         # 词法解析：引号、$VAR 展开、| > >> < <<EOF、; 分隔
│   │   ├── executor.ts      # 最小管道执行模型：逐命令执行、stdin 传递、重定向落盘、退出码
│   │   ├── registry.ts      # 命令注册表（Map<name, Handler>）与统一返回结构
│   │   ├── builtins.ts      # pwd / cd / echo / history / clear / true / false / exit
│   │   └── session.ts       # ShellSession：多行缓冲、历史、Tab 补全
│   ├── linux/               # Linux 命令模块（ls mkdir touch cp mv rm cat head tail grep find wc sort uniq chmod whoami id ps kill man help）
│   ├── docker/              # Docker 状态（镜像/容器/网络/卷）与命令模块
│   ├── kubernetes/          # K8s 状态（Pod/Deployment/Service/ConfigMap/Event）与 kubectl 命令模块
│   └── persistence.ts       # localStorage 读写
├── courses/                 # 课程
│   ├── validate.ts          # Lab 接口、StepDef、evaluateLab、状态断言辅助
│   ├── labs.ts              # 50 个实验定义：初始状态、目标、步骤、分级提示、常见错误、验证器
│   ├── teaching/            # 每课教学数据（场景/为什么/观察/推理/五级提示/规律/思考题/完成反馈）
│   │   ├── types.ts         # TeachingContent / HintLevels / CompletionFeedback 类型
│   │   ├── linuxData.ts     # 18 节 Linux 课教学文案
│   │   ├── dockerData.ts    # 14 节 Docker 课教学文案
│   │   ├── k8sData.ts       # 18 节 Kubernetes 课教学文案
│   │   └── index.ts         # TEACHING 汇总 + teachingFor(id)
│   ├── hintSystem.ts        # 五级提示纯函数（hintGroups / hintButtonState / isAnswerRevealed）
│   ├── errorCoach.ts        # 错误识别 13 类 → 新手解释（发生了什么/关键信息/检查步骤/下一步）
│   └── commandExplain.ts    # 40+ 命令字典（逐段参数解释）+ 12 种表格输出字段解释
├── ui/                      # React 界面（Toolbar / CourseSidebar / TerminalPane / TaskPanel / HelpModal）
└── hooks/useMediaQuery.ts   # 移动端断点
tests/                       # Vitest 单元测试（443 个断言用例）
e2e/                         # Playwright 测试（桌面 + 移动端，21 个场景）
```

### 命令处理器的统一契约

```ts
interface CommandResult {
  stdout: string      // 标准输出（管道会传递给下一个命令）
  stderr: string      // 标准错误（终端中显示为红色）
  exitCode: number    // 0 成功；1 一般错误；2 用法错误；125 Docker 错误；127 命令不存在
  stateChanges?: unknown
}
```

命令通过注册表挂载，执行流程：`Session.execute(line)` → `lexer.parseInput` →
对每个 pipeline 逐条 `runPipeline`（展开变量/通配符 → 查注册表 → 执行 → 重定向/传递 stdin）。

### 状态变化如何保持可预测

- 时间使用模拟时钟（`SimState.clock`，每次执行 +1 分钟），Docker 的 "Up X minutes"、
  K8s 的 AGE、文件 mtime 全部由它派生，因此状态完全确定、可复现，不依赖随机数。
- Pod 名 hash（`podHash(name, image, gen)`）、容器 ID、ClusterIP、NodePort 均由确定性函数生成。
- CrashLoopBackOff 由镜像名触发（如 `crashy-app`），一旦镜像修复即为 Running。

## 新增命令

1. 在任意命令模块（如 `src/sim/linux/commands.ts`）中写一个处理器并 `register('cmd', handler)`；
   也可以新建模块并在 `src/sim/commands.ts` 的 `initCommands()` 中注册。
2. 处理器签名：`(ctx: CmdContext) => CommandResult`，
   `CmdContext = { state: SimState, args: string[], stdin: string | null }`。
   读取 `ctx.stdin` 即可支持管道输入；修改 `ctx.state` 即产生状态变化（会被持久化）。
3. 在 `src/sim/linux/manpages.ts` 补充 `man` 页面，`help` 会展示注册表中的全部命令。
4. 在 `tests/` 中添加对应单元测试，运行 `npm run test` 验证。

## 新增实验

在 `src/courses/labs.ts` 中按 `Lab` 接口追加：

```ts
{
  id: 'unique-id',          // 侧边栏与持久化使用
  mode: 'linux' | 'docker' | 'kubernetes',
  category: '课程分类名',    // 与 CATEGORIES 对齐，决定侧边栏分组
  title: '实验标题',
  description: '一句话简介',
  goals: ['目标 1', ...],
  steps: [{ id: 's1', label: '步骤描述', check: (state) => boolean }],
  hints: [['第一级提示'], ['第二级提示']],   // 兼容的旧式分级提示；最后一级视为"答案"
  commonErrors: [{ cmd: '错误命令', explanation: '为什么错', hint: '方向性提示' }],
  build: () => SimState,    // 实验初始状态（可用 createInitialState 组合）
}
```

然后在 `src/courses/teaching/<模式>Data.ts` 中补充该课的 `TeachingContent`（键为 labId），
包含：`scenario`（场景）、`whyItMatters`（为什么学）、`observationGuide`（先观察什么）、
`reasoningSteps`（思考线索）、`commandSelection`（为什么选这条命令）、`transferRules`（可迁移规律）、
`reflectionQuestions`（思考题）、`hintLevels`（五级提示，第 5 级为完整答案）、
`completion`（完成后的教学小结）。无教学数据的课程会自动回退到 `hints` 字段。

验证器优先检查**模拟系统的最终状态**（如容器是否存在且 running、Deployment 副本数、文件权限位），
而不是比对命令字符串；无状态变化的步骤（如 pwd）才回退为检查命令历史。
"显示答案"只展示命令，不会把课程标记为完成——完成条件始终由环境状态判定。

## 新增命令（可选：添加参数/输出解释）

命令处理器注册后，可在 `src/courses/commandExplain.ts` 中为该命令补充
`CommandDoc`（缩写记忆、flag 含义、valueFlags、位置参数、读写/风险标注），
并在 `TABLE_LAYOUTS` 中为新的表格输出补充字段解释，终端下方的"命令解析"卡片即自动生效。

## 已知限制（模拟器简化）

- 不支持 `-it` 交互式进入容器、`docker logs -f`、`kubectl logs -f`、`vim` 等交互式编辑器。
- `docker run` 前台运行会打印启动日志后直接返回提示符（模拟器不支持附着终端）。
- 管道支持 `|`、重定向 `>` / `>>` / `<`、heredoc `<<EOF` 与 `;` 分隔；通配符支持 `*` 与 `?`。
- YAML 通过 `js-yaml` 正式解析（非手写解析器），支持 Pod / Deployment / Service / ConfigMap。
- 仅模拟教学所需的最小参数集，未支持的参数会给出明确的教学错误。
