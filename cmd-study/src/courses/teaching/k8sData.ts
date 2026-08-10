import type { TeachingContent } from './types'

export const K8S_TEACHING: Record<string, TeachingContent> = {
  'k8s-intro': {
    scenario:
      '公司把你调到一个新项目组，组长说"服务都在 Kubernetes 集群上，你熟悉一下环境"。你连上管理机，面前只有一个空荡荡的终端——第一步当然是确认这个集群是否真的可用，以及它长什么样。',
    whyItMatters: 'kubectl 是操作 Kubernetes 的唯一"遥控器"。先学会确认集群状态，就像上岗前先确认电源和总闸，后面所有操作都建立在这个基础上。',
    observationGuide: [
      '任务问的是"集群是否正常"和"集群里有什么"',
      '注意 kube-system 这个命名空间——系统组件都住在里面',
    ],
    reasoningSteps: [
      '关键词"集群状态""地址"→ 需要一条查看集群信息的命令',
      '关键词"当前上下文"→ 需要确认自己操作的是哪套集群',
      '关键词"有多少个命名空间"→ 需要一条列出命名空间的命令',
    ],
    commandSelection:
      'kubectl 是控制集群的客户端工具，cluster-info 查看集群地址，config current-context 查看当前集群身份，get namespaces 查看命名空间列表——三条命令各解决一个子问题。',
    transferRules: [
      '"集群是否就绪" → kubectl cluster-info',
      '"我连的是哪套集群" → kubectl config current-context',
      '"集群里有哪些命名空间" → kubectl get namespaces',
      '"系统组件在哪个命名空间" → kube-system',
    ],
    reflectionQuestions: ['kube-system 里住着哪些组件？它们和你的应用 Pod 有什么不同？', '为什么要用命名空间把资源分隔开？'],
    hintLevels: {
      goal: '确认集群可用，查看集群地址、当前使用的上下文，并列出集群里已有的命名空间。',
      think: '先观察任务里出现的三个关键词：集群地址、当前上下文、命名空间，每个词都对应一条独立的查看命令。',
      commandType: '需要使用集群客户端工具的三条"查看类"命令：查集群信息、查当前上下文、查命名空间列表。',
      syntax:
        'kubectl cluster-info；kubectl config current-context；kubectl get namespaces——前两条没有参数，直接执行即可。',
      answer:
        '依次执行三条命令：kubectl cluster-info 输出集群地址（如 https://127.0.0.1:6443，说明集群连接正常）；kubectl config current-context 输出当前上下文名称；kubectl get namespaces 列出 default、kube-node-lease、kube-public、kube-system。三条都执行后任务步骤自动勾选。',
    },
    completion: {
      solved: '你确认了集群可用（cluster-info 有地址返回）、知道了当前上下文，并看到了全部 4 个命名空间。',
      clue: '把任务拆成三个关键词：集群地址、上下文、命名空间，每个词对应一条查看命令。',
      why: 'kubectl 是操作集群的唯一入口，这三条查看命令零风险、信息量最大，适合作为任何排障的第一动作。',
      reuse: '以后每次接触新集群或怀疑集群失联，都用 cluster-info 快速探活。',
      relatedCommand: 'kubectl get nodes——查看集群里有几台"工人"（节点），是了解集群规模的下一步。',
    },
  },
  'k8s-pods': {
    scenario:
      '你已经会看集群了，组长说"我们的 nginx 应用正在跑，你去看看它的 Pod；再亲手建一个自己的 Pod 试试"。你习惯性地想敲 docker ps，但被拦住——这里是 Kubernetes 的地盘，用的是另一套"遥控器"。',
    whyItMatters: 'Pod 是 Kubernetes 最小的运行单元，后面所有课程都围绕它转。不会查看 Pod，你就无从判断应用死活；不会创建和删除 Pod，你就没法部署任何东西。',
    observationGuide: [
      '任务先要"查看"，看看集群里已经有什么',
      '注意 nginx 是 Deployment 管理的，还有预置好的图纸文件 ~/pod.yaml 可用',
      'kube-system 里也住着 Pod，不加参数看不到它',
    ],
    reasoningSteps: [
      '关键词"查看 Pod"→ 需要一条列出 Pod 的命令',
      '关键词"查看 Deployment"→ 需要另一条查看部署的命令',
      '关键词"自己创建"→ 用预置图纸应用一次',
      '关键词"删除"→ 查看详情后拆掉自己的 Pod',
    ],
    commandSelection:
      'kubectl get pods 查看 Pod 列表，describe pod 查看单个 Pod 的详情与事件，apply -f 按图纸创建，delete pod 删除——四条命令正好覆盖"查看-创建-删除"完整流程。',
    transferRules: [
      '"看看有什么 Pod" → kubectl get pods',
      '"看某栋楼的 Pod" → kubectl get pods -n kube-system',
      '"按图纸创建资源" → kubectl apply -f pod.yaml',
      '"看单个 Pod 详情" → kubectl describe pod <名称>',
      '"拆掉一个 Pod" → kubectl delete pod <名称>',
    ],
    reflectionQuestions: ['为什么 nginx Deployment 的 Pod 删不掉（删了会自动重建）？', 'describe 输出的 Events 里一般记录什么信息？'],
    hintLevels: {
      goal: '先观察集群里已有的 Pod 和 Deployment，再用预置的图纸创建自己的 Pod，查看详情后删除它。',
      think: '任务分成"看现有资源"和"创建自己的资源"两段。看资源时注意区分楼栋；创建时家里已经备好了图纸文件，先在文件列表里找到它。',
      commandType: '需要集群客户端工具的"查看类"命令（列表、详情）和"文件创建类"命令，最后是"删除类"命令。',
      syntax:
        'kubectl get pods；kubectl get deployments；kubectl get pods -n kube-system；kubectl apply -f <文件名>；kubectl describe pod <Pod名>；kubectl delete pod <Pod名>。',
      answer:
        '依次执行：kubectl get pods 查看 default 里的 Pod（应看到 nginx 开头的 2 个，来自 Deployment）；kubectl get deployments 确认 nginx Deployment 存在；kubectl get pods -n kube-system 看到系统组件的 Pod（-n=指定命名空间）；kubectl apply -f pod.yaml 创建 hello Pod（-f=指定图纸文件，输出 created，get pods 看到 hello 1/1 Running）；kubectl describe pod hello 查看详情（describe=描述详情，含 Events 事件）；kubectl delete pod hello 删除它。下一步：kubectl get pods 确认 hello 已消失。',
    },
    completion: {
      solved: '你观察了集群里的 Pod 与 Deployment，用 YAML 图纸创建了自己的 hello Pod，查看详情后删掉了它。',
      clue: '"查看"和"自己创建"是两个方向，分别对应查看类命令和文件创建类命令。',
      why: 'Pod 是运行单元的"最小盒子"，从查看到创建再到删除，正好覆盖对它的全部基本操作。',
      reuse: '以后部署任何新东西，第一反应都是 get pods 确认现状。',
      relatedCommand: 'kubectl logs <Pod名>——查看容器输出的日志，是判断"里面发生了什么"的第一把钥匙。',
    },
  },
  'k8s-apply': {
    scenario:
      '你学会了用 pod.yaml 创建单个 Pod，组长说"以后别一个个盒子建了，公司用的是图纸化批量管理：一份 YAML 里声明好几个资源，一次应用全部生效，重复应用也不会出错"。他让你亲手试一次。',
    whyItMatters: '真实生产里没人敲命令创建资源，全是写 YAML 声明式管理。不会 apply 就读不懂任何真实部署文件；不理解幂等，你可能用错工具制造 AlreadyExists 报错。',
    observationGuide: [
      '预置文件 ~/web-app.yaml 里用 --- 分隔了两个资源',
      '第一次应用输出 created，再应用一次应输出 configured',
      '创建后要核对集群里实际生成的 Deployment 和 Service',
    ],
    reasoningSteps: [
      '关键词"多文档 YAML"→ 一份图纸声明多个资源，一次应用',
      '关键词"幂等"→ 同一命令重复执行结果不变',
      '关键词"核对定义"→ 用输出格式参数查看资源完整定义',
    ],
    commandSelection:
      'kubectl apply -f 是声明式管理的核心命令，apply 的意思是"把期望状态应用到集群"；get 加 -o yaml 输出资源完整定义，方便对照图纸检查。',
    transferRules: [
      '"按图纸声明资源" → kubectl apply -f <文件>',
      '"重复执行不报错" → apply 是幂等的（created → configured）',
      '"查看资源完整定义" → kubectl get <资源> -o yaml',
      '"一次声明多个资源" → 一个 YAML 文件里用 --- 分隔多份文档',
    ],
    reflectionQuestions: ['为什么说 apply 是"声明式"而 create 是"命令式"？', '如果 YAML 里只写了 Deployment，应用后 Service 会被创建吗？'],
    hintLevels: {
      goal: '用预置的多文档图纸一次性创建 web 应用，重复应用体验幂等，再查看资源的完整定义并确认 Service 一起创建成功。',
      think: '任务有三个关键点：多文档（一个文件多个资源）、重复执行、查看实际定义。应用后对比两次输出的文字是否不同。',
      commandType: '需要"文件应用类"命令执行两次，再加一条"查看类"命令输出资源的 YAML 格式定义。',
      syntax: 'kubectl apply -f web-app.yaml；kubectl apply -f web-app.yaml；kubectl get deployment web -o yaml。',
      answer:
        '执行 kubectl apply -f web-app.yaml，第一次输出 deployment.apps/web created 和 service/web created（-f=指定文件，一份图纸同时创建两个资源）；再执行一次同样命令，输出变成 configured（幂等：声明式管理下重复执行结果不变）；最后 kubectl get deployment web -o yaml 查看完整定义（-o yaml=以 YAML 格式输出实际状态）。下一步：kubectl get svc 确认 Service web 也在。',
    },
    completion: {
      solved: '你用一个多文档 YAML 同时创建了 web 的 Deployment 和 Service，体验了 apply 的幂等性，并用 -o yaml 核对了实际定义。',
      clue: '"多文档""幂等""核对定义"三个关键词，对应 apply 两次和一次 get 加 -o yaml。',
      why: 'apply 声明"最终想要的样子"，集群自己收敛，重复执行结果不变，是生产环境的标准姿势。',
      reuse: '以后拿到任何 YAML 部署文件，统一用 apply -f 执行，可以放心重复执行。',
      relatedCommand: 'kubectl apply -f <目录>——整个目录的 YAML 一次应用，多服务项目经常这样批量发布。',
    },
  },
  'k8s-labels': {
    scenario:
      '运维群里有人喊"谁能给 nginx 的 Pod 贴个前端标签，方便我批量管理？"。你看着 Pod 名里的一串随机字符发愣：总不能一个个记名字吧？标签（label）就是解决这个问题的——给资源贴名片，再用名片筛选。',
    whyItMatters: '标签是 Kubernetes 批量操作和资源关联的基础：Service 靠它选 Pod、滚动更新靠它区分新旧。不会打标签和筛选，资源一多你就寸步难行。',
    observationGuide: [
      '先 get pods 记下一个 nginx Pod 的名字',
      '标签用 键=值 的形式，比如 tier=frontend',
      '删除标签是 键名- 的写法',
      'annotate 和 label 的语法几乎一模一样',
    ],
    reasoningSteps: [
      '关键词"打标签"→ 给指定 Pod 加上 键=值',
      '关键词"筛选"→ 用选择器参数按标签过滤',
      '关键词"注解"→ 另一种键值对，但只能给人看',
      '关键词"删除标签"→ 键名后面跟减号',
    ],
    commandSelection:
      'kubectl label 管理标签，kubectl annotate 管理注解，-l 是 label 的首字母，作为选择器参数筛选资源——三者配合覆盖"贴标签-筛选-加备注-撕标签"全流程。',
    transferRules: [
      '"给资源贴标签" → kubectl label pod <名称> 键=值',
      '"按标签筛选" → kubectl get pods -l 键=值',
      '"给资源加注解" → kubectl annotate pod <名称> 键=值',
      '"删除标签" → kubectl label pod <名称> 键-',
      '"覆盖已有标签" → kubectl label ... --overwrite',
    ],
    reflectionQuestions: ['标签和注解有什么区别？为什么注解不能用来筛选？', 'Service 用选择器按标签选 Pod，这带来什么好处？'],
    hintLevels: {
      goal: '给一个 nginx Pod 贴上 tier=frontend 标签，用选择器筛选出它，再添加一个注解，最后把标签删掉。',
      think: '任务四步对应四种操作：添加键值对、按键值筛选、添加另一种键值对、按键移除。注意删除的写法和添加只有一处不同。',
      commandType: '需要"标签管理类"命令（添加和删除各一次）、"列表筛选类"命令，还有"注解管理类"命令。',
      syntax:
        'kubectl label pod <Pod名> tier=frontend；kubectl get pods -l tier=frontend；kubectl annotate pod <Pod名> note=example；kubectl label pod <Pod名> tier-。',
      answer:
        '先 kubectl get pods 记下一个 nginx Pod 名；kubectl label pod <名称> tier=frontend（label=管理标签，tier 是键、frontend 是值）；kubectl get pods -l tier=frontend（-l=按标签筛选，应只列出刚打标签的那个 Pod）；kubectl annotate pod <名称> note=example（annotate=加注解，注解是给人看的备注，不能用于筛选）；kubectl label pod <名称> tier-（键后加 - 表示删除该键）。下一步：再 get pods -l tier=frontend 确认输出为空。',
    },
    completion: {
      solved: '你给 Pod 打了标签、按标签筛选出了它、添加了注解，最后撕掉了标签。',
      clue: '添加用 键=值、筛选用 -l、注解用 annotate、删除用 键-，四个动词对应四种操作。',
      why: '标签是资源之间的"名片"，所有选择、关联、批量操作都建立在它之上。',
      reuse: '以后批量操作资源，看到 selector 就知道背后是标签在起作用。',
      relatedCommand: 'kubectl get pods --show-labels——列表直接显示每个资源的全部标签，排查标签写没写对时很好用。',
    },
  },
  'k8s-deploy-scale': {
    scenario:
      '组长说"新服务上线，先部署一个 nginx 试试，确认没问题再扩到 3 个"。你想起之前手写的 pod.yaml，但这次要求的是"包工头"式管理：就算 Pod 挂了也能自动补位，这正是 Deployment 的职责。',
    whyItMatters: '单 Pod 没人管，挂了就没了；Deployment 保证任何时候都有指定数量的副本在岗。不会创建和扩容 Deployment，你的应用就没有"自动修复"和"弹性伸缩"能力。',
    observationGuide: [
      '创建命令必须带 --image 参数，缺了会直接报错',
      '扩容命令必须带 --replicas 参数',
      '扩容后 get pods 应看到 3 个 web 开头的 Pod',
    ],
    reasoningSteps: [
      '关键词"创建 Deployment"→ 一条创建命令带上镜像',
      '关键词"N 个副本"→ 调整副本数量的命令',
      '关键词"确认"→ 查看 Pod 列表核对人数',
    ],
    commandSelection:
      'kubectl create deployment 一句话创建 Deployment（create=创建，--image 指定镜像）；kubectl scale 调整副本数（scale=缩放，--replicas=副本数量）。两条命令配合，招工和调人数都有了。',
    transferRules: [
      '"创建一个 Deployment" → kubectl create deployment <名称> --image=<镜像>',
      '"调整副本数量" → kubectl scale deployment <名称> --replicas=N',
      '"确认创建成功" → kubectl get pods',
      '"包工头保证人数" → Deployment 会不断补充挂掉的 Pod',
    ],
    reflectionQuestions: ['如果删掉一个 web 的 Pod，会发生什么？为什么？', 'replicas 从 1 改成 3，背后是谁在执行扩容？'],
    hintLevels: {
      goal: '创建一个名为 web 的 nginx Deployment，把它扩容到 3 个副本，并确认 3 个 Pod 都在运行。',
      think: '两个动作各带一个必填参数：创建要指定镜像，扩容要指定数量。做完后用列表命令核对人数。',
      commandType: '需要"创建类"命令（带镜像参数）和"缩放类"命令（带副本数参数），最后用"查看类"命令确认。',
      syntax: 'kubectl create deployment <名称> --image=<镜像>；kubectl scale deployment <名称> --replicas=<数字>；kubectl get pods。',
      answer:
        '执行 kubectl create deployment web --image=nginx（create=创建，deployment=部署类型，web=名称，--image=nginx 指定镜像，缺了会报 required flag "image" not set）；kubectl scale deployment web --replicas=3（scale=缩放，--replicas=3 把副本数设为 3）；kubectl get pods 应看到 3 个 web 开头的 Pod，STATUS 为 Running、READY 为 1/1。下一步：kubectl get deployments 确认 DESIRED 列是 3。',
    },
    completion: {
      solved: '你创建了 web Deployment 并把它从 1 个副本扩容到 3 个，Pod 数量符合预期。',
      clue: '"创建"对应 --image，"扩容"对应 --replicas，"确认"对应 get pods。',
      why: 'Deployment 是包工头，负责保证副本数量恒定；scale 只是改掉考勤表上的数字。',
      reuse: '以后任何"部署一个新服务""服务扛不住了加点副本"的需求，都用这两条命令。',
      relatedCommand: 'kubectl rollout status deployment/web——查看扩容或发布的进度，实时看到包工头干到哪一步了。',
    },
  },
  'k8s-scale': {
    scenario:
      '双十一流量来了，组长说"web 从 3 个副本扩到 5 个，撑过去再缩回 2 个"。上次你已经会 scale 了，这次组长还让你注意一个叫 ReplicaSet 的"考勤表"——看看幕后是谁在盯着人数。',
    whyItMatters: 'scale 是最常用的运维操作，加机器减机器就一条命令。但只有理解 ReplicaSet 的存在，你才会明白为什么删除 Pod 没用、为什么扩容能这么快。',
    observationGuide: [
      '扩容到 5 时副本数立即变化，Pod 逐个出现',
      '缩容到 2 后最终只剩 2 个 Running Pod',
      'get rs 能看到名字带一串随机数字的 ReplicaSet',
    ],
    reasoningSteps: [
      '关键词"扩到 5"→ 缩放一次',
      '关键词"缩回 2"→ 再缩放一次',
      '关键词"考勤表"→ 查看 ReplicaSet 列表',
      '关键词"确认人数"→ 查看 Pod 列表',
    ],
    commandSelection:
      'kubectl scale 是调整副本数的唯一方式，--replicas 指定目标数量；kubectl get rs 查看 ReplicaSet（rs 是 ReplicaSet 的缩写，deploy 是 Deployment 的缩写）。',
    transferRules: [
      '"扩容或缩容" → kubectl scale deployment <名称> --replicas=<数字>',
      '"查看考勤表" → kubectl get rs',
      '"删除 Pod 没有用" → 会被 ReplicaSet 立即重建，必须 scale',
      '"资源名缩写" → rs、deploy、svc 都是官方缩写',
    ],
    reflectionQuestions: ['为什么删掉一个 Pod，它马上又回来了？', '缩容到 2 后，被裁掉的 Pod 去了哪里？'],
    hintLevels: {
      goal: '把 web 先扩容到 5 个副本，再缩容到 2 个，用 ReplicaSet 观察幕后机制，最后确认只剩 2 个 Pod。',
      think: '任务就是两次改数字，中间穿插一次查看"考勤表"。注意第二次改完数字后，要确认实际人数和数字一致。',
      commandType: '需要两条"缩放类"命令和两条"查看类"命令（分别查看考勤表和 Pod 列表）。',
      syntax: 'kubectl scale deployment web --replicas=5；kubectl scale deployment web --replicas=2；kubectl get rs；kubectl get pods。',
      answer:
        'kubectl scale deployment web --replicas=5（scale=缩放，deployment web=要调整的对象，--replicas=5 目标副本数，Pod 会逐个补到 5 个）；kubectl scale deployment web --replicas=2（改回 2，多余的 Pod 被裁掉）；kubectl get rs 查看 ReplicaSet 列表（名字形如 web-xxxxx，DESIRED 列跟着变化）；kubectl get pods 确认只有 2 个 Pod 处于 Running。下一步：手动删一个 web 的 Pod，观察它是否自动复活。',
    },
    completion: {
      solved: '你完成了 web 从 3 扩到 5、再缩到 2 的全过程，并看到了 ReplicaSet 这张考勤表。',
      clue: '每次调整都是 scale 加 --replicas；"考勤表"对应 get rs。',
      why: '副本数量是"期望状态"，ReplicaSet 负责收敛到它；scale 只是改写期望值。',
      reuse: '任何"临时扩一波"或"省资源缩一波"的操作，一条 scale 搞定。',
      relatedCommand: 'kubectl autoscale deployment web --min=2 --max=10——按负载自动伸缩，是手工 scale 的进阶版。',
    },
  },
  'k8s-rollout': {
    scenario:
      '应用要升级了：nginx 从旧版换到 1.25。组长说"发布期间服务不能断，万一新版本不行要能一键退回"。你理了一下思路：换镜像、看进度、查历史、回滚——这就是一次完整的发布流程。',
    whyItMatters: '发版是日常最高频操作之一，滚动更新保证服务不断线，回滚是出事故时的救命稻草。不会 rollout，升级全靠直觉，出事只能干瞪眼。',
    observationGuide: [
      '换镜像后 Pod 是一批一批滚动替换，而不是全量重启',
      'rollout status 最后输出 successfully rolled out',
      'rollout history 里每次发布是一条 REVISION 记录',
      'undo 之后镜像回到 nginx:latest',
    ],
    reasoningSteps: [
      '关键词"换镜像"→ 指定 Deployment 和容器的新镜像',
      '关键词"发布进度"→ 查看滚动更新的状态',
      '关键词"历史版本"→ 列出发布记录',
      '关键词"回滚"→ 退回上一个版本',
    ],
    commandSelection:
      'kubectl set image 更新镜像（set=设置，image=镜像，格式为 容器名=新镜像）；rollout 系列管发布流程，status 看进度、history 看历史、undo 回滚，动词即含义。',
    transferRules: [
      '"更新镜像发布" → kubectl set image deployment/<名称> <容器名>=<新镜像>',
      '"看发布进度" → kubectl rollout status deployment/<名称>',
      '"看发布历史" → kubectl rollout history deployment/<名称>',
      '"回滚上一版本" → kubectl rollout undo deployment/<名称>',
      '"发布了几次" → rollout history 的 REVISION 列',
    ],
    reflectionQuestions: ['滚动更新为什么能保证服务不断线？', 'undo 回滚的是镜像还是整个配置？'],
    hintLevels: {
      goal: '把 web 的镜像更新为 nginx:1.25 触发一次发布，查看发布状态和历史，再回滚到上一个版本。',
      think: '先发起发布（指定新镜像），再用"进度类"命令等它完成，用"历史类"命令确认版本数，最后用"回滚类"命令撤销。',
      commandType: '需要"更新类"命令、两条"发布流程类"命令（进度、历史）和一条"回滚类"命令。',
      syntax:
        'kubectl set image deployment/web web=nginx:1.25；kubectl rollout status deployment/web；kubectl rollout history deployment/web；kubectl rollout undo deployment/web。',
      answer:
        'kubectl set image deployment/web web=nginx:1.25（set image=更新镜像，deployment/web=对象，web=容器名，nginx:1.25=新镜像）；kubectl rollout status deployment/web 等发布完成（输出 successfully rolled out 表示成功）；kubectl rollout history deployment/web 查看历史（至少 2 条 REVISION 记录）；kubectl rollout undo deployment/web 回滚（撤销刚才的发布，镜像回到 nginx:latest）。下一步：kubectl get pods 确认 3 个 Pod 都是 Running 1/1。',
    },
    completion: {
      solved: '你完成了一次完整的发布：升级镜像、查看进度与历史、最后回滚，服务全程没断。',
      clue: '换镜像用 set image，后面三个动作都是 rollout 家族的 status、history、undo。',
      why: 'rollout 让发布可观测、可回退，这正是生产环境敢做升级的底气。',
      reuse: '以后每次发版，标准动作就是 set image → rollout status → 必要时 undo。',
      relatedCommand: 'kubectl rollout restart deployment/web——不换镜像只重启 Pod，常用于让配置重新生效。',
    },
  },
  'k8s-configmap': {
    scenario:
      '代码里写死配置被安全部门点名了："数据库模式、环境名这些别写死在镜像里！"你想起组长提过的 ConfigMap——把配置从镜像里抽出来，变成独立的"配置文件夹"，改配置不用重新打包镜像。',
    whyItMatters: '配置写死在镜像里，改一个参数就要重新构建、重新发布；用 ConfigMap 把配置和程序解耦，改配置只改文件夹再重启即可，这是生产环境的基本素养。',
    observationGuide: [
      '先创建 ConfigMap，再应用引用它的 Deployment，顺序不能反',
      '预置文件 ~/app-deploy.yaml 里用 envFrom 整份注入',
      '进容器执行 env 应看到 APP_MODE=prod',
      'describe configmap 能看到键值内容',
    ],
    reasoningSteps: [
      '关键词"创建配置"→ 创建 ConfigMap，键值用字面量参数',
      '关键词"注入"→ 预置图纸已写好整份注入，应用即可',
      '关键词"验证"→ 进容器看环境变量',
      '关键词"查看配置"→ 查看 ConfigMap 详情',
    ],
    commandSelection:
      'kubectl create configmap 创建配置（--from-literal=键=值 直接给键值对）；envFrom 是 YAML 里"整份导入"的写法；kubectl exec 进容器执行命令验证，形成"创建-注入-验证"闭环。',
    transferRules: [
      '"创建键值配置" → kubectl create configmap <名称> --from-literal=<键>=<值>',
      '"整份注入环境变量" → envFrom + configMapRef',
      '"进容器执行命令" → kubectl exec <Pod名> -- env',
      '"查看配置内容" → kubectl describe configmap <名称>',
      '"改配置不动镜像" → 只更新 ConfigMap，再重启应用',
    ],
    reflectionQuestions: ['为什么要"重启应用"配置才会生效？', 'envFrom 和只取一个键的 valueFrom.configMapKeyRef 有什么区别？'],
    hintLevels: {
      goal: '创建包含 APP_MODE=prod 的 ConfigMap，用预置图纸部署引用它的应用，进容器验证变量生效，并查看配置内容。',
      think: '顺序很重要：先有配置文件夹，应用才能引用。创建时注意键值的连接符号；验证时进容器执行查看环境变量的命令。',
      commandType: '需要"创建配置类"命令、"文件应用类"命令、"进容器执行类"命令和"详情查看类"命令。',
      syntax:
        'kubectl create configmap app-config --from-literal=APP_MODE=prod；kubectl apply -f app-deploy.yaml；kubectl exec <Pod名> -- env；kubectl describe configmap app-config。',
      answer:
        'kubectl create configmap app-config --from-literal=APP_MODE=prod（create configmap=创建配置，app-config=名称，--from-literal=键=值 用等号连接，缺了等号会报错）；kubectl apply -f app-deploy.yaml（预置图纸的 envFrom 会把整份配置倒进环境变量）；kubectl exec <Pod名> -- env（exec=进入容器执行，-- 后面是容器内命令，应看到 APP_MODE=prod）；kubectl describe configmap app-config 查看键值内容。下一步：思考如果把 APP_MODE 改成 dev，需要几步才能生效。',
    },
    completion: {
      solved: '你创建了 ConfigMap，通过 envFrom 注入到应用，并在容器内验证环境变量 APP_MODE=prod 生效。',
      clue: '配置与镜像解耦：create configmap 造文件夹，图纸里 envFrom 整份导入，exec env 验证。',
      why: 'ConfigMap 让"改配置"从"重新发版"变成"改个文件夹重启一下"，代价低到可以随意折腾。',
      reuse: '任何环境变量类配置（开关、地址、运行模式），都优先考虑放进 ConfigMap。',
      relatedCommand: 'kubectl create configmap <名称> --from-file=config.txt——从文件生成配置，适合整份配置文件注入。',
    },
  },
  'k8s-secret': {
    scenario:
      '配置文件夹搞定了，但组长说"数据库密码不能放 ConfigMap，明文躺着谁都能看，要放 Secret 保险箱"。你发现 Secret 的用法几乎和 ConfigMap 一样，只是值在 YAML 里变成了 Base64 编码。',
    whyItMatters: '密码、令牌这类敏感信息一旦明文入库或写进镜像就是事故前兆。Secret 提供集中存放和最小暴露；同时理解 Base64 只是编码不是加密，才不会产生"保险箱很保险"的错觉。',
    observationGuide: [
      '创建 Secret 必须带 generic 子命令',
      '查看编码后的值，data 里是 c2VjcmV0MTIz 这样的字符',
      '预置文件 ~/app-deploy.yaml 用 secretKeyRef 只取一个键',
      '容器里 exec env 看到的是解码后的 secret123',
    ],
    reasoningSteps: [
      '关键词"创建密码"→ 创建通用类型的 Secret',
      '关键词"编码"→ 用输出格式参数查看 Base64 值',
      '关键词"注入"→ 预置图纸只取一个键，应用即可',
      '关键词"验证解码"→ 进容器看环境变量',
    ],
    commandSelection:
      'kubectl create secret generic 创建普通类型 Secret（generic=通用类型）；--from-literal 的用法与 ConfigMap 相同；secretKeyRef 是 YAML 里"取某一个键"的写法；exec env 验证容器里拿到的是解码后的真实值。',
    transferRules: [
      '"存放敏感键值" → kubectl create secret generic <名称> --from-literal=<键>=<值>',
      '"只取 Secret 的某一个键" → secretKeyRef',
      '"查看编码后的值" → kubectl get secret <名称> -o yaml',
      '"容器里自动解码" → env 里看到明文 secret123',
      '"Base64 不是加密" → 只是编码，明文可逆',
    ],
    reflectionQuestions: ['Base64 和加密有什么区别？为什么说 Secret 默认并不"安全"？', '为什么解码由系统自动完成，而不是应用自己解码？'],
    hintLevels: {
      goal: '创建包含 DB_PASSWORD=secret123 的 Secret，查看它的 Base64 编码，注入应用并验证容器里得到解码后的真实值。',
      think: '流程和 ConfigMap 完全同构：创建（多一个类型子命令）、查看编码、用预置图纸注入、进容器验证。注意"文件里的值"和"容器里的值"不一样。',
      commandType: '需要"创建密钥类"命令（比 ConfigMap 多一个类型子命令）、"查看类"命令加输出格式参数、"文件应用类"命令和"进容器执行类"命令。',
      syntax:
        'kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123；kubectl get secret db-secret -o yaml；kubectl apply -f app-deploy.yaml；kubectl exec <Pod名> -- env。',
      answer:
        'kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123（generic=通用类型，db-secret=名称，--from-literal=键=值）；kubectl get secret db-secret -o yaml（-o yaml=以 YAML 格式输出，data 里 DB_PASSWORD 显示 c2VjcmV0MTIz，即 secret123 的 Base64 编码）；kubectl apply -f app-deploy.yaml（预置图纸用 secretKeyRef 引用 db-secret 的 DB_PASSWORD 键）；kubectl exec <Pod名> -- env 看到 DB_PASSWORD=secret123（系统自动解码）。下一步：试试 echo c2VjcmV0MTIz | base64 -d 还原明文。',
    },
    completion: {
      solved: '你创建了 Secret，看到了 Base64 编码形式，注入应用后容器里拿到解码后的真实密码。',
      clue: 'Secret 与 ConfigMap 同构但多 generic；YAML 里是编码、容器里是明文，对比这两处就理解了 Base64。',
      why: 'Secret 把敏感信息集中、隔离存放，注入逻辑与 ConfigMap 一致，学习成本几乎为零。',
      reuse: '数据库密码、API 令牌、证书等一切敏感配置，都放 Secret 而不是 ConfigMap。',
      relatedCommand: 'echo c2VjcmV0MTIz | base64 -d——手动解码 Base64，看 YAML 时用来核对值有没有写对。',
    },
  },
  'k8s-storage': {
    scenario:
      '上线一个写日志的应用，跑了一天发现 Pod 一重启，日志全没了。组长说"Pod 是临时工，干完活就消失，数据得放外部仓库"——这就引出了 PV 和 PVC：管理员备好的仓库，加上你填的领料单。',
    whyItMatters: '无状态服务可以随便重启，但数据库、日志、上传文件都是"命根子"。不会声明存储，你的应用一重启数据就清零，这是任何有状态应用都躲不开的坎。',
    observationGuide: [
      '预置文件 ~/storage.yaml 里 PV（1Gi）和 PVC（500Mi）两个文档',
      '应用后 get pvc 的 STATUS 应为 Bound',
      '~/app-deploy.yaml 把 PVC 挂载到容器的 /data 目录',
      '挂载未绑定 PVC 的 Pod 会一直 Pending',
    ],
    reasoningSteps: [
      '关键词"仓库"→ PV 是集群级的存储资源',
      '关键词"领料单"→ PVC 申请容量，容量匹配就绑定',
      '关键词"挂载"→ Deployment 里把卷挂到 /data',
      '关键词"查看状态"→ 分别查看仓库和领料单',
    ],
    commandSelection:
      'PV/PVC 用 YAML 图纸创建（apply 一次建两个资源）；get pv、get pvc 查看状态（看 STATUS 列判断是否绑定）；volumeMounts 是 YAML 里"把卷挂进容器目录"的配置。',
    transferRules: [
      '"声明一块存储" → PV（管理员）+ PVC（用户）',
      '"容量匹配才能绑定" → PV 1Gi 满足 PVC 500Mi → Bound',
      '"挂载到容器目录" → volumeMounts 的 mountPath',
      '"查看绑定状态" → kubectl get pvc 的 STATUS 列',
      '"PVC 未绑定" → 引用它的 Pod 会 Pending',
    ],
    reflectionQuestions: ['为什么 Pod 和存储要解耦（Pod 只认 PVC 不认 PV）？', '如果 PVC 申请 2Gi 而 PV 只有 1Gi，会发生什么？'],
    hintLevels: {
      goal: '用预置图纸创建 PV 和 PVC 让它们绑定，再部署一个挂载该 PVC 的应用，最后查看存储状态。',
      think: '三步：先建仓库和领料单（一个文件两个文档），确认领料单状态是 Bound，再让应用挂载它。顺序错了应用会一直等不到存储。',
      commandType: '需要两条"文件应用类"命令（分别应用存储图纸和应用图纸）、两条"状态查看类"命令（仓库和领料单各一条）。',
      syntax: 'kubectl apply -f storage.yaml；kubectl apply -f app-deploy.yaml；kubectl get pv；kubectl get pvc。',
      answer:
        'kubectl apply -f storage.yaml 创建 PV data-pv（1Gi）和 PVC data-pvc（申请 500Mi，小于 1Gi 才能匹配上）；kubectl get pvc 看到 data-pvc 的 STATUS 为 Bound、VOLUME 为 data-pv（领料单匹配到了仓库）；kubectl apply -f app-deploy.yaml 部署 app（volumeMounts 把 PVC 挂到 /data 目录）；kubectl get pv 和 kubectl get pvc 查看两端状态（CAPACITY、STATUS、CLAIM 列）。下一步：exec 进 Pod 在 /data 写个文件，然后删除 Pod 观察数据是否还在。',
    },
    completion: {
      solved: '你让 PVC 与 PV 成功绑定，应用挂载了持久卷，数据从此不随 Pod 消失。',
      clue: '存储三步走：storage.yaml 建仓库和领料单 → Bound 状态确认 → app-deploy.yaml 挂载。',
      why: 'PV/PVC 把"谁提供存储"和"谁使用存储"分开，应用只填领料单，不用关心底层磁盘。',
      reuse: '数据库、日志、上传目录等有状态需求，一律"申请 PVC、挂到目录"。',
      relatedCommand: 'kubectl delete pvc data-pvc——删除领料单前先了解回收策略 Retain 的含义，小心数据去向。',
    },
  },
  'k8s-probes': {
    scenario:
      '应用部署好了，但你发现奇怪现象：有的 Pod 明明 STATUS 是 Running，READY 却是 0/1，而且 Service 不往它转流量。组长说"那是体检没过，Kubernetes 用探针给容器做体检，三科：入职体检、门口体检、定期复查"。',
    whyItMatters: '没有探针，集群就分不清"进程活着"和"真正能干活"，故障 Pod 会一直挂着接流量。探针是自愈系统的眼睛，也是后续所有排障课的判断依据。',
    observationGuide: [
      'web-deploy.yaml 是健康镜像 nginx，带就绪和存活探针',
      'api-deploy.yaml 是 api-broken 镜像，就绪探针探测 /health',
      '健康 Pod READY 1/1，不健康的是 0/1',
      'describe pod 的 Events 里写着 Readiness probe failed',
    ],
    reasoningSteps: [
      '关键词"三科体检"→ 就绪管接流量、存活管重启、启动管慢启动',
      '关键词"健康镜像"→ 应用健康图纸',
      '关键词"不健康镜像"→ 应用坏图纸观察 READY 0/1',
      '关键词"失败原因与修复"→ 详情看事件，再换健康镜像',
    ],
    commandSelection:
      '探针通过 YAML 声明（readinessProbe/livenessProbe 字段），应用后由集群自动体检；describe pod 是看体检报告和失败事件的地方；set image 换镜像修复——三件套覆盖"体检-诊断-治疗"。',
    transferRules: [
      '"接不接流量" → readinessProbe（就绪探针）',
      '"挂没挂要不要重启" → livenessProbe（存活探针）',
      '"启动很慢先别急着查" → startupProbe（启动探针）',
      '"看体检失败原因" → kubectl describe pod <名称> 的 Events',
      '"体检不过就换镜像" → kubectl set image deployment/<名称> <容器>=<健康镜像>',
    ],
    reflectionQuestions: ['Running 但 READY 0/1 的 Pod 算"活着"吗？Service 会把流量转给它吗？', 'startupProbe 失败和 livenessProbe 失败的现象有什么不同？'],
    hintLevels: {
      goal: '创建健康和不健康两个带探针的应用，用 describe 找出体检失败的原因，最后把不健康的修复好。',
      think: '先看两个预置图纸的区别：一个镜像健康、一个镜像有问题；应用后对比两个应用的 READY 列，再用详情命令找失败事件。',
      commandType: '需要两条"文件应用类"命令、一条"详情查看类"命令（看事件），最后一条"镜像更新类"命令。',
      syntax:
        'kubectl apply -f web-deploy.yaml；kubectl apply -f api-deploy.yaml；kubectl describe pod <api的Pod名>；kubectl set image deployment/api api=api。',
      answer:
        'kubectl apply -f web-deploy.yaml（nginx 镜像带 readiness+liveness 探针，get pods 看到 READY 1/1）；kubectl apply -f api-deploy.yaml（api-broken 镜像带就绪探针探测 /health，get pods 看到 READY 0/1）；kubectl describe pod <api的Pod名> 看底部 Events，有 Warning Readiness probe failed（探测 /health 返回异常）；kubectl set image deployment/api api=api（api=容器名，api=健康镜像）。下一步：get pods 确认 api 的 READY 变 1/1。',
    },
    completion: {
      solved: '你部署了带探针的健康和不健康应用，用 describe 找到体检失败事件，并换镜像修复了它。',
      clue: 'READY 0/1 是体检没过的信号，describe 的 Events 写明具体原因，set image 是治本的修复。',
      why: '探针把"健康"变成机器可判断的状态，自愈和负载均衡都建立在它之上。',
      reuse: '以后看到 READY 0/1，第一反应就是 describe 看探针相关事件。',
      relatedCommand: 'kubectl get pods -w——实时跟踪状态变化，观察探针失败后容器被重启的现场。',
    },
  },
  'k8s-resources': {
    scenario:
      '新来的同事把内存限制写成 32Mi，结果容器被杀；又有人 requests 写了 4Gi，Pod 一直 Pending。组长说"requests 是调度时的座位要求，limits 是运行时的饭量上限，超了就被 OOM 杀死——今天把这两个概念玩明白"。',
    whyItMatters: '不写资源声明，Pod 会挤占整台机器；写错又会出现 Pending 或 OOMKilled 两类经典故障。看懂这两种状态，是排查集群资源问题的入门券。',
    observationGuide: [
      '预置三个文件：web.yaml（正常）、big.yaml（requests 4Gi）、tiny.yaml（limits 32Mi）',
      '应用后 get pods：web Running、big Pending、tiny OOMKilled',
      'kubectl top 查看节点和 Pod 的占用',
      'big 的 Pending 信息里含 Insufficient memory 字样',
    ],
    reasoningSteps: [
      '关键词"座位要求"→ requests 是调度依据，写大了节点给不出就 Pending',
      '关键词"饭量上限"→ limits 超了就 OOMKilled',
      '关键词"观察状态"→ get pods 看三个 Deployment 的差异',
      '关键词"看占用"→ 资源统计命令',
    ],
    commandSelection:
      '资源声明写在 YAML 的 resources 段（requests/limits 两个字段）；kubectl top 查看实际资源占用（top=最高的，nodes 和 pods 两个子命令）；先应用三个预置文件制造现象，再用 top 观察，形成"声明-现象-观测"闭环。',
    transferRules: [
      '"requests 写多了" → 超节点容量 → Pending',
      '"limits 写小了" → 内存超限 → OOMKilled',
      '"查节点占用" → kubectl top nodes',
      '"查 Pod 占用" → kubectl top pods',
      '"正常应用配多少" → 参考镜像需求，nginx 约 128Mi',
    ],
    reflectionQuestions: ['Pending 和 OOMKilled 分别对应哪个字段写错？', '为什么说"实际需要多少内存"只能靠应用本身知道？'],
    hintLevels: {
      goal: '应用三个预置文件，观察正常、资源不足、内存超限三种结果，并查看节点与 Pod 的资源占用。',
      think: '三个图纸分别演示三种结局。应用后对比 Pod 状态列；Pending 和 OOMKilled 是不同字段造成的，回忆"座位要求"和"饭量上限"各自对应哪个。',
      commandType: '需要三条"文件应用类"命令和两条"资源占用查看类"命令（节点、Pod 各一条）。',
      syntax: 'kubectl apply -f web.yaml；kubectl apply -f big.yaml；kubectl apply -f tiny.yaml；kubectl top nodes；kubectl top pods。',
      answer:
        '依次 kubectl apply -f web.yaml（requests 256Mi、limits 512Mi，Pod Running 1/1）、kubectl apply -f big.yaml（requests 4Gi 超过节点剩余容量，Pod 停在 Pending，信息里有 Insufficient memory）、kubectl apply -f tiny.yaml（limits 32Mi 太小，容器被杀，状态 OOMKilled）；然后 kubectl top nodes 看每台节点用量，kubectl top pods 看每个 Pod 的 CPU 和内存占用。下一步：回忆两个异常状态分别对应哪个字段（requests 还是 limits）写错。',
    },
    completion: {
      solved: '你用三个文件制造并观察了正常、Pending、OOMKilled 三种结局，还会用 top 查看资源占用。',
      clue: 'requests 管调度（写大了 Pending），limits 管运行（写小了 OOMKilled），top 管观测。',
      why: '资源声明是集群调度的输入，也是故障的常见来源，理解现象才能对症下药。',
      reuse: '以后部署任何应用先想两件事：requests 给多少、limits 给多少，再用 top 校准。',
      relatedCommand: 'kubectl describe node <节点名>——查看节点剩余可分配资源，预判新 Pod 会不会 Pending。',
    },
  },
  'k8s-jobs': {
    scenario:
      '每天晚上数据库要备份，你打算写个脚本定时跑。组长说"备份这种跑完就结束的任务，别用 Deployment 常驻，用 Job——跑完即止、绝不赖着；要定时就再加一层 CronJob"。你第一次接触"一次性任务"这个新物种。',
    whyItMatters: '把一次性任务塞进 Deployment 要么永远不结束、要么反复重启；Job 的完成语义（跑完就 Completed）和 CronJob 的定时触发，是备份、批处理、报表场景的标配。',
    observationGuide: [
      'create job 后 Pod 状态是 Completed 而不是 Running',
      'get jobs 的 COMPLETIONS 列显示 1/1',
      '预置文件 ~/backup-cron.yaml 的 schedule 是 */1 * * * *',
      'get cronjobs 能看到 SCHEDULE 列',
    ],
    reasoningSteps: [
      '关键词"跑一次"→ Job 创建后执行，成功即 Completed',
      '关键词"查看任务"→ get jobs 看完成数',
      '关键词"定时"→ CronJob 用 cron 表达式，五个字段：分 时 日 月 周',
      '关键词"查看定时任务"→ get cronjobs',
    ],
    commandSelection:
      'kubectl create job 创建一次性任务（job=作业，--image 指定执行镜像）；get jobs 查看完成情况；CronJob 用 YAML 的 spec.schedule 声明触发时间（cron 表达式 */1 * * * * 表示每分钟一次）。命令与资源名完全对应。',
    transferRules: [
      '"跑完就结束的任务" → kubectl create job <名称> --image=<镜像>',
      '"查看任务完成数" → kubectl get jobs 的 COMPLETIONS 列',
      '"定时任务" → CronJob 的 spec.schedule',
      '"cron 表达式" → 分 时 日 月 周 五段，*/1 表示每 1 单位',
      '"Job 的 Pod 状态" → Completed 而不是 Running',
    ],
    reflectionQuestions: ['Job 的 Pod 完成一次后为什么不重启？和 Deployment 的 Pod 有什么本质区别？', 'cron 表达式 * * * * * 和 */1 * * * * 一样吗？'],
    hintLevels: {
      goal: '创建一个 busybox 的一次性任务，查看它的完成状态，再用预置图纸创建每分钟触发一次的定时任务并查看。',
      think: '两个物种：一次性任务用创建命令（指定镜像），定时任务用预置图纸（里面有个五个字段的时间表达式）。完成后注意 Pod 的状态是"已完成"而不是"运行中"。',
      commandType: '需要"创建任务类"命令、"任务查看类"命令、"文件应用类"命令和"定时任务查看类"命令。',
      syntax: 'kubectl create job hello --image=busybox；kubectl get jobs；kubectl apply -f backup-cron.yaml；kubectl get cronjobs。',
      answer:
        'kubectl create job hello --image=busybox（create job=创建一次性任务，hello=名称，--image=busybox=指定执行镜像）；kubectl get pods 看到 hello 的 Pod 状态是 Completed（不是 Running）；kubectl get jobs 看到 COMPLETIONS 1/1（完成数/总数，表示任务成功跑完）；kubectl apply -f backup-cron.yaml（预置图纸的 CronJob，schedule 为 */1 * * * * 表示每分钟触发）；kubectl get cronjobs 看到 SCHEDULE 列为 */1 * * * *，且 get jobs 能看到它自动生成的 backup-xxx Job。下一步：思考如果任务要跑 10 分钟而 cron 每分钟触发一次，会发生什么。',
    },
    completion: {
      solved: '你创建并查看了跑完即止的 Job，还部署了每分钟触发一次的 CronJob，理解了两种任务的定位。',
      clue: '常驻用 Deployment、一次用 Job、定时用 CronJob，三个词对应三种资源。',
      why: 'Job 的完成语义天然适合批处理，CronJob 把调度交给集群而不是脚本里的定时器。',
      reuse: '备份、批量导入导出、报表生成这类"干完就走"的任务，都用 Job 和 CronJob 承载。',
      relatedCommand: 'kubectl logs <job的Pod名>——查看任务执行日志，确认批处理跑出了预期结果。',
    },
  },
  'k8s-scheduling': {
    scenario:
      '公司给 node-2 装了 GPU，只有跑 AI 任务的 Pod 能上去，普通应用不许进。你发现这个"门禁"就是 taint（污点），而"门禁卡"是 toleration（容忍），再加上 nodeSelector 点名要哪台机器——调度控制三件套齐了。',
    whyItMatters: '不是所有机器都适合跑所有任务：GPU 机器要给 AI 用、某些节点要隔离敏感数据。不会调度控制，Pod 就会到处乱跑，资源专用、合规隔离都无从谈起。',
    observationGuide: [
      'node-1 标签 disktype=ssd，node-2 标签 disktype=hdd',
      'taint 命令的格式是 键=值:效果',
      '预置文件 ~/gpu-app.yaml 的 nodeSelector 指向 disktype=hdd',
      '无容忍时 Pod 停在 Pending，加容忍后 Running 在 node-2',
    ],
    reasoningSteps: [
      '关键词"门禁"→ 给节点打污点',
      '关键词"点名要哪台"→ nodeSelector 按标签选节点',
      '关键词"门禁卡"→ toleration 匹配污点才能进入',
      '关键词"没卡被拦"→ Pod 停在 Pending',
    ],
    commandSelection:
      'kubectl taint 给节点打污点（taint=污点，格式 键=值:效果，NoSchedule 表示不安排新 Pod）；nodeSelector 和 tolerations 都是 YAML 字段；先打门禁再应用，观察 Pending，补上容忍再应用，就完成了"装门禁-被拦截-亮门禁卡"的完整演示。',
    transferRules: [
      '"给节点装门禁" → kubectl taint nodes <节点> <键>=<值>:NoSchedule',
      '"指定 Pod 去哪些节点" → nodeSelector + 节点标签',
      '"无视污点进入" → tolerations 匹配 taint',
      '"没有容忍的 Pod" → Pending',
      '"污点效果" → NoSchedule 只拦新 Pod，不赶旧 Pod',
    ],
    reflectionQuestions: ['节点打上 NoSchedule 污点后，已经在跑的 Pod 会被赶走吗？', '为什么"点名"（nodeSelector）和"门禁"（taint/toleration）要两个机制配合？'],
    hintLevels: {
      goal: '给 node-2 打上 gpu=true:NoSchedule 污点，部署点名去 node-2 的应用，先观察 Pending，再补上容忍让它恢复运行。',
      think: '三步：装门禁（注意键=值:效果 的完整格式）、把点名去 hdd 节点的应用丢进去（预置图纸已写好）、给图纸补一张门禁卡（一段 YAML）。每一步之后看一次 Pod 状态。',
      commandType: '需要一条"污点设置类"命令、两次"文件应用类"命令（前后各一次），中间还要编辑 YAML 文件补字段。',
      syntax:
        'kubectl taint nodes node-2 gpu=true:NoSchedule；kubectl apply -f gpu-app.yaml；编辑文件加 tolerations 段后再次 kubectl apply -f gpu-app.yaml。',
      answer:
        'kubectl taint nodes node-2 gpu=true:NoSchedule（taint=打污点，node-2=目标节点，gpu=true:NoSchedule=键=值:效果，该效果表示"不让没有容忍的新 Pod 进来"）；kubectl apply -f gpu-app.yaml（nodeSelector 指向 disktype=hdd 即 node-2，Pod 停在 Pending）；编辑 ~/gpu-app.yaml 在 template.spec 下加 tolerations 段（key: gpu / operator: Exists / effect: NoSchedule）；再次 kubectl apply -f gpu-app.yaml，get pods 看到 Pod Running 且落在 node-2。下一步：用 get pods -o wide 确认 NODE 列是 node-2。',
    },
    completion: {
      solved: '你给节点装了污点门禁，制造了 Pending，又用 toleration 门禁卡让应用成功进入 node-2。',
      clue: '门禁（taint）在节点上、门禁卡（toleration）在 Pod 上、点名（nodeSelector）也在 Pod 上，三层各管一段。',
      why: '调度控制让"哪个 Pod 能上哪台机器"变成声明式规则，而不是靠运气。',
      reuse: '看到"Pod 一直 Pending"时，除了资源不足，还要检查节点污点和 Pod 容忍是否匹配。',
      relatedCommand: 'kubectl describe node node-2——Taints 字段里能看到节点装的所有门禁，排查调度问题第一步。',
    },
  },
  'k8s-service': {
    scenario:
      '应用跑起来了，但客户端说"你们 Pod 的 IP 三天两头变，我们连不上"。你想了想：Pod 一重建 IP 就换，直接暴露 Pod 确实不靠谱。组长说"架个前台总机——Service，对外号码固定不变，背后自动转接到活着的 Pod"。',
    whyItMatters: 'Pod IP 是临时的，直接访问等于把客户端绑在沙子上；Service 提供固定入口、负载均衡和故障自动切换，是所有外部访问的统一大门。',
    observationGuide: [
      'web Deployment（nginx，3 副本）已经预置，不用创建',
      'expose 命令要指定端口和类型',
      'get services 的 PORT(S) 列形如 80:3xxxx/NodePort',
      'get endpoints 显示总机后面接通的 Pod 地址',
    ],
    reasoningSteps: [
      '关键词"确认存在"→ get deployments 看一眼 web',
      '关键词"开通总机"→ 暴露命令指定类型和端口',
      '关键词"看总机列表"→ get services',
      '关键词"背后接通谁"→ get endpoints',
    ],
    commandSelection:
      'kubectl expose 把 Deployment 暴露成 Service（expose=暴露，--port=80 对外端口，--type=NodePort 对外类型）；get services 查看总机列表（services 缩写 svc）；get endpoints 查看后端 Pod 地址（endpoints=端点）。',
    transferRules: [
      '"给应用开总机" → kubectl expose deployment <名称> --port=<端口> --type=<类型>',
      '"查看总机列表" → kubectl get services',
      '"查看后端地址" → kubectl get endpoints',
      '"Pod 挂了怎么办" → 总机自动转给其他活着的 Pod',
      '"对外类型" → NodePort 给节点开个口，ClusterIP 仅集群内',
    ],
    reflectionQuestions: ['Service 怎么知道把电话转给哪些 Pod？靠的是什么字段？', '为什么说 Pod IP 不可靠而 Service IP 稳定？'],
    hintLevels: {
      goal: '把已经存在的 web Deployment 暴露为 NodePort 类型的 Service（端口 80），查看 Service 列表和后端端点。',
      think: '环境里 web 已经部署好了，你只负责"开通总机"：指定端口和类型两个参数。开完用列表看结果，再查一下总机后面接通的地址。',
      commandType: '需要一条"暴露类"命令（带端口和类型参数）和两条"查看类"命令（Service 列表、Endpoints 列表）。',
      syntax: 'kubectl get deployments；kubectl expose deployment web --port=80 --type=NodePort；kubectl get services；kubectl get endpoints。',
      answer:
        'kubectl get deployments 确认 web 存在（环境预置，无需创建）；kubectl expose deployment web --port=80 --type=NodePort（expose=暴露，web=要暴露的 Deployment，--port=80=对外端口，--type=NodePort=通过节点端口对外）；kubectl get services 看到 web 的 TYPE 为 NodePort、PORT(S) 为 80:3xxxx/NodePort（3xxxx 是对外随机端口）；kubectl get endpoints 看到 web 后面接了 3 个 Pod 地址。下一步：思考 3xxxx 这个随机端口在哪里访问。',
    },
    completion: {
      solved: '你给 web Deployment 架好了 NodePort 总机，并确认了它的对外端口和后端三个 Pod 地址。',
      clue: '暴露动作要带端口和类型，查看总机用 get services，查接通对象用 get endpoints。',
      why: 'Service 把不稳定的 Pod IP 收进稳定的对外入口，还顺带做了负载均衡和故障切换。',
      reuse: '任何"让集群外访问应用"的需求，第一选择都是暴露命令加 NodePort 类型。',
      relatedCommand: 'kubectl get svc web -o yaml——查看 Service 完整定义，看 selector 是怎么选定后端 Pod 的。',
    },
  },
  'k8s-crashloop': {
    scenario:
      '凌晨两点，告警响了：broken 服务的 Pod 状态显示 CrashLoopBackOff。你听说过这个词——容器一启动就崩溃、重启后接着崩，无限死循环。组长电话里只说了一句："按老规矩来：先看状态，再看日志，再看详情，最后换镜像。"',
    whyItMatters: 'CrashLoopBackOff 是排障课最经典的敌人，背后可能是配置错误、依赖缺失、启动脚本挂掉。掌握"状态-日志-详情-修复"的固定顺序，任何崩溃型故障都不慌。',
    observationGuide: [
      'broken 的 Pod 状态是 CrashLoopBackOff，重启次数在涨',
      'logs 问程序：应用自己输出了什么',
      'describe 问系统：Kubernetes 给的结论和事件',
      '修复是换镜像而不是删 Pod——删了立刻重建还崩',
    ],
    reasoningSteps: [
      '关键词"状态异常"→ get pods 先看谁在崩',
      '关键词"程序怎么说"→ logs 看应用输出',
      '关键词"系统怎么说"→ describe 看事件和原因',
      '关键词"修复"→ 问题是镜像，换健康镜像',
    ],
    commandSelection:
      '排障按固定顺序：kubectl get pods 定位（get=查看列表）；kubectl logs 看应用日志（logs=日志，问程序）；kubectl describe 看事件（describe=描述，问系统）；kubectl set image 修复（set image=换镜像，治本）。',
    transferRules: [
      '"先看谁在崩" → kubectl get pods',
      '"问程序怎么了" → kubectl logs <Pod名>',
      '"问系统怎么说" → kubectl describe pod <Pod名>',
      '"修崩溃的容器" → kubectl set image deployment/<名称> <容器>=<好镜像>',
      '"删 Pod 治不好崩溃" → Deployment 会立刻重建，必须治本',
    ],
    reflectionQuestions: ['为什么先 logs 再 describe？两个工具各自回答什么问题？', '如果删掉崩溃的 Pod，会发生什么？这说明了什么？'],
    hintLevels: {
      goal: '找到崩溃的服务，先看状态，再分别用日志和详情两个工具找原因，最后换掉坏镜像让 Pod 恢复运行。',
      think: '排查顺序是固定的：先列表看谁崩、再日志问程序、再详情问系统，三者信息互补。找到根因后注意修复手段是"换镜像"，而不是"删 Pod"或"重启"。',
      commandType: '需要"列表查看类"命令、两条"诊断类"命令（日志、详情）和一条"镜像更新类"命令。',
      syntax: 'kubectl get pods；kubectl logs <Pod名>；kubectl describe pod <Pod名>；kubectl set image deployment/broken broken=nginx。',
      answer:
        'kubectl get pods 看到 broken 的 Pod 状态 CrashLoopBackOff（RESTARTS 列在涨，陷入崩溃-重启死循环）；kubectl logs <Pod名> 看应用日志（崩溃原因写在程序输出里）；kubectl describe pod <Pod名> 看系统视角的事件（BackOff 相关事件和原因）；kubectl set image deployment/broken broken=nginx（broken=容器名，nginx=健康镜像）。下一步：get pods 确认 broken 的 Pod 变成 Running 1/1。',
    },
    completion: {
      solved: '你按"状态-日志-详情-修复"的顺序定位了崩溃根因，换镜像让 broken 恢复 Running。',
      clue: '崩溃故障三连问：get 看现象、logs 问程序、describe 问系统，最后 set image 治本。',
      why: '固定的排查顺序保证信息不漏、判断有据，这是所有排障课通用的思维框架。',
      reuse: '任何"Pod 反复崩溃"的场景，直接套用这套四步流程，包治包好。',
      relatedCommand: 'kubectl get pods -o wide——多列信息（节点、IP），崩溃现场采集的增强版。',
    },
  },
  'k8s-inspect': {
    scenario:
      '这次故障更隐蔽：api 服务没崩，STATUS 还是 Running，但 READY 是 0/1，一直接不了客。数据库 db 明明健康，api 却连不上。组长说"这种半死不活的 Pod 最坑人，把四件套用上：logs、exec、describe、events"。',
    whyItMatters: '很多故障不是"崩了"而是"带病运行"：进程活着但功能失效。四件套是看清这类隐蔽故障的唯一手段，也是综合排障的基本功。',
    observationGuide: [
      'get pods 看到 api 是 Running 但 READY 0/1，db 是 1/1 健康',
      'describe 的 Events 有 Readiness probe failed 和 statuscode: 500',
      'logs 里是 Failed to connect to database: connect ECONNREFUSED',
      'db 健康而 api 连不上 → 排除数据库，问题在 api 自身',
    ],
    reasoningSteps: [
      '关键词"半死不活"→ get pods 看 READY 0/1',
      '关键词"程序怎么说"→ logs 看应用报错',
      '关键词"系统怎么说"→ describe 看事件，exec 看现场',
      '关键词"修复"→ api-broken 镜像本身有毛病，换健康镜像',
    ],
    commandSelection:
      '四件套各司其职：kubectl logs 问程序（应用输出）、kubectl exec 进现场（-- 后面是容器内命令）、kubectl describe 问系统（详情和事件）、kubectl get events 看全局（集群事件流）；修复用 set image。多工具交叉验证，结论才可靠。',
    transferRules: [
      '"程序输出了什么" → kubectl logs <Pod名>',
      '"进容器看现场" → kubectl exec <Pod名> -- <命令>',
      '"系统怎么看这个资源" → kubectl describe pod <Pod名>',
      '"全局事件流" → kubectl get events',
      '"Ready 0/1 的常见原因" → 就绪探针失败，describe 里有答案',
    ],
    reflectionQuestions: ['四个工具各自回答什么问题？为什么不能只用其中一个？', '为什么"db 健康但 api 连不上"能排除数据库故障？'],
    hintLevels: {
      goal: '找出 api 就绪失败的原因，按顺序使用日志、详情、进容器、事件四种手段，最后修复让它 READY 变 1/1。',
      think: '任务是"多工具取证"：每个工具问一个不同的问题——程序说了什么、系统说了什么、容器里有什么、全局发生了什么。最后综合所有证据判断根因再修复。',
      commandType: '需要"列表查看类"命令、两条"诊断类"命令（日志、详情）、一条"进容器执行类"命令、一条"事件查看类"命令和一条"镜像更新类"命令。',
      syntax:
        'kubectl get pods；kubectl describe pod <api的Pod名>；kubectl logs <api的Pod名>；kubectl exec <api的Pod名> -- ls /app；kubectl get events；kubectl set image deployment/api api=api。',
      answer:
        'kubectl get pods 看到 api 的 READY 0/1、STATUS Running（活着但没过体检），db 是 1/1 健康；kubectl describe pod <api名> 的 Events 有 Readiness probe failed: HTTP probe failed with statuscode: 500（探测 /health 返回 500）；kubectl logs <api名> 看到 Failed to connect to database: connect ECONNREFUSED（结合 db 健康，排除数据库，指向应用自身）；kubectl exec <api名> -- ls /app 进容器看现场（-- 后是容器内命令）；kubectl get events 看全局事件流里的 Unhealthy 事件；kubectl set image deployment/api api=api 换上健康镜像。下一步：get pods 确认 api READY 变 1/1。',
    },
    completion: {
      solved: '你用 logs、describe、exec、events 四件套交叉取证，定位了 api 就绪失败的根因并修复。',
      clue: '每条线索来自不同工具，互相印证：事件说是探针 500，日志说是连库失败，db 健康排除数据库。',
      why: '隐蔽故障的症状在多个层面，单一工具会误判，交叉验证才可靠。',
      reuse: '凡是"看起来活着但不好使"的服务，直接把四件套按顺序过一遍。',
      relatedCommand: 'kubectl logs <Pod名> --previous——查看容器上一次崩溃前的日志，崩溃瞬间的现场回放。',
    },
  },
  'k8s-app': {
    scenario:
      '毕业设计来了：把 prod 环境从零搭起来。要建新楼栋（命名空间 prod）、放配置文件夹（ConfigMap）和保险箱（Secret）、交给包工头（3 副本 Deployment）、架前台总机（Service）、发一次版再回滚，最后还要修好一个躺着不动（Ready 0/1）的 api。十八般武艺一次全用上。',
    whyItMatters: '之前每课学的是单件兵器，这课是实战：发布、回滚、排障串成一条完整链路。能独立走完，你才算真正迈过"会用 Kubernetes"的门槛。',
    observationGuide: [
      '所有资源都要放在 prod 命名空间，命令加 -n prod',
      '预置文件 ~/web.yaml 一个文件声明了 Deployment 和 Service 两个文档',
      'api 是 Ready 0/1，db 健康——排障顺序和上一课一样',
      '每做完一步用 get 验证，别一口气闷头敲',
    ],
    reasoningSteps: [
      '关键词"新楼栋"→ 先建命名空间 prod',
      '关键词"配置与密码"→ ConfigMap 和 Secret 都要放在 prod',
      '关键词"完整应用"→ 预置 web.yaml 已含副本、资源、探针和引用',
      '关键词"发布回滚与排障"→ 更新镜像、回滚，再按四件套修 api',
    ],
    commandSelection:
      '全程是前面所有课的实战串烧：create namespace 建楼栋、create configmap 和 create secret 放配置、apply -f web.yaml 部署、set image 和 rollout undo 发布回滚、describe 和 logs 加 set image 排障。每个动作都是学过的命令，区别只在多了一个 -n prod。',
    transferRules: [
      '"资源放哪个楼栋" → 命令加 -n <命名空间>',
      '"建新命名空间" → kubectl create namespace <名称>',
      '"发布新版本" → kubectl set image deployment/<名称> <容器>=<新镜像>',
      '"回滚发布" → kubectl rollout undo deployment/<名称>',
      '"Ready 0/1 排障" → get pods → describe → logs → set image',
    ],
    reflectionQuestions: ['为什么所有资源都要放进 prod？不按命名空间隔离会有什么风险？', '回滚之后，rollout history 里的版本记录发生了什么变化？'],
    hintLevels: {
      goal: '在 prod 命名空间里从零搭建完整应用：建命名空间、放配置与密码、部署三副本应用、暴露服务、发布并回滚，最后修好故障的 api。',
      think: '任务像打关卡：前三步是"搭楼栋放东西"（记得每步 -n prod），第 4 步用预置图纸一次性部署，第 5 到 7 步是发布与回滚，第 8 步是排障（上一课的顺序）。每关打完用 get 验证再进下一关。',
      commandType: '需要"命名空间创建类"命令、两条"配置创建类"命令、两条"文件应用类"命令、两条"发布流程类"命令和一组排障命令（详情、日志、镜像更新）。',
      syntax:
        'kubectl create namespace prod；kubectl create configmap app-config --from-literal=APP_MODE=prod -n prod；kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123 -n prod；kubectl apply -f web.yaml；kubectl set image deployment/web web=nginx:1.25 -n prod；kubectl rollout undo deployment/web -n prod；kubectl set image deployment/api api=api -n prod。',
      answer:
        '依次执行：kubectl create namespace prod（建楼栋）；kubectl create configmap app-config --from-literal=APP_MODE=prod -n prod（配置放进 prod 的文件夹，-n=指定命名空间）；kubectl create secret generic db-secret --from-literal=DB_PASSWORD=secret123 -n prod（密码放进 prod 的保险箱）；kubectl apply -f web.yaml（预置文件含 Deployment 3 副本和 Service 两个文档，metadata.namespace 已是 prod，get pods -n prod 确认 3 个 Running 1/1）；kubectl get svc web -n prod 和 get endpoints 确认总机接通；kubectl set image deployment/web web=nginx:1.25 -n prod 发布，rollout status 等它完成；kubectl rollout undo deployment/web -n prod 回滚，get pods 确认 3 个仍 Running 1/1；最后排障：get pods -n prod 看到 api Ready 0/1 → describe 有 Readiness probe failed → logs 连库失败且 db 健康排除数据库 → kubectl set image deployment/api api=api -n prod 修复，确认 READY 1/1。所有步骤勾选即过关。',
    },
    completion: {
      solved: '你从零搭建了 prod 环境：命名空间、配置、密钥、应用、服务、发布回滚、故障修复一气呵成。',
      clue: '全程是旧知识加一个新参数 -n prod；排障部分完整复用了"状态-详情-日志-修复"顺序。',
      why: '真实工作里就是这些动作的组合，能在一条链路里熟练切换，才算真正掌握 Kubernetes。',
      reuse: '以后任何"部署一套新环境"的任务，直接按这套清单走：命名空间→配置→应用→服务→发布→排障。',
      relatedCommand: 'kubectl get all -n prod——一次列出 prod 里所有资源类型，全局巡检一把梭。',
    },
  },
}
