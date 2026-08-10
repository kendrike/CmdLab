import type { TeachingContent } from './types'

export const DOCKER_TEACHING: Record<string, TeachingContent> = {
  'docker-arch': {
    scenario:
      '你刚接手一台预装 Docker 的机器，想先确认它是不是"健康"的。记住一个关键分工：你敲的 docker 命令只是遥控器（客户端），真正干活的是后台的 dockerd 守护进程（管家），两者通过 API 对话。本课把遥控器和管家都检查一遍。',
    whyItMatters: '很多诡异的 Docker 报错其实是客户端与服务端版本不匹配或管家没启动，学会环境自检，遇到问题时你不会一头扎进业务代码里白找。',
    observationGuide: [
      '任务关键词是"查看"——查看版本、查看系统信息、查看镜像，都是只读操作',
      '版本命令的输出要同时包含 Client 和 Server 两段',
      '系统信息命令里能找到 Containers 和 Images 的统计数字',
    ],
    reasoningSteps: [
      '先查版本：确认遥控器（Client）和管家（Server）都在岗，两边版本也兼容',
      '再查系统信息：信息命令会汇总这台机器上容器、镜像、网络的数量',
      '最后查镜像：列出本地已有的"菜谱"，做到心里有数',
    ],
    commandSelection:
      '三条都是"查看类"命令：一个看版本、一个看整体信息、一个看镜像列表，单词本身就直白地说明了用途，不用记复杂参数。',
    transferRules: [
      '"确认 Docker 客户端和服务端都正常" → 查看版本命令',
      '"查看这台机器的整体概况" → 查看系统信息命令',
      '"查看本地有哪些镜像" → 查看镜像列表命令',
      '"环境不对先怀疑什么" → 优先自检环境，再怀疑业务代码',
    ],
    reflectionQuestions: ['版本输出里的 Client 和 Server 分别代表谁？', '系统信息里哪些数字能看出这台机器被使用过？'],
    hintLevels: {
      goal: '确认 Docker 的遥控器和管家都在正常工作，并看清这台机器上已有的镜像情况。',
      think: '任务里出现"版本""系统信息""镜像"三个词，每个词对应一条只读命令，注意命令输出里分别有版本段、统计数字和列表。',
      commandType: '需要三条"查看类"命令：一条查版本、一条查系统信息、一条查镜像列表，都没有参数。',
      syntax: '三条命令的语法都是"docker + 动作单词"，后面不需要任何参数，直接输入即可。',
      answer:
        '依次输入 docker version（输出同时有 Client 和 Server 两段版本）、docker info（找到 Containers 和 Images 的统计数字）、docker images（列出本地镜像，注意 IMAGE ID 和 SIZE 两列）。下一步：记住 images 里看到的镜像名，下一课就要用它。',
    },
    completion: {
      solved: '你用版本、系统信息、镜像列表三条命令确认了环境正常，并看清了本地镜像。',
      clue: '任务关键词"版本""信息""镜像"分别对上了三条查看命令。',
      why: '这三条都是只读自检命令，不改动任何东西，适合作为任何操作的第一步。',
      reuse: '以后到任何新环境，先跑这三条命令，一分钟摸清家底。',
      relatedCommand: 'docker -v 是版本命令的快捷写法，但它只显示客户端版本。',
    },
  },
  'docker-images': {
    scenario:
      '你的应用需要 redis 做缓存，可本地还没有这个镜像。镜像像"菜谱"：描述内容但本身不变，使用前要先把菜谱拿到本地，不用了再扔掉。本课完整走一遍镜像的一生：拉取、查看、检查、删除。',
    whyItMatters: 'Docker 世界里的所有操作都围绕镜像和容器展开，镜像管理的四步是高频动作；不会删除镜像，硬盘很快会被用不到的镜像占满。',
    observationGuide: [
      '任务关键词是"拉取"——从仓库把镜像拿到本地',
      '列表命令输出的第一列是 REPOSITORY，第四列是 IMAGE ID',
      '检查命令输出一大段 JSON，SIZE 等信息都在里面',
    ],
    reasoningSteps: [
      '先列出本地镜像，确认 redis 还不存在',
      '任务说"拉取"，对应从仓库取菜谱的动作，拉完 redis 会出现在列表里',
      '"检查"和"删除"是两个方向相反的动作：一个只看不动手，一个彻底清掉',
    ],
    commandSelection:
      '四个单词对应镜像生命周期的四个阶段：拉取、列出、检查、删除，组合起来就是完整的一生；删除镜像的命令是"删除加 image 的首尾字母"。',
    transferRules: [
      '"从仓库下载镜像" → docker pull <镜像名>',
      '"查看本地镜像列表" → docker images',
      '"查看镜像的详细信息" → docker inspect <镜像名>',
      '"删除镜像" → docker rmi <镜像名>',
      '"删除的对象是镜像还是容器" → 镜像用 rmi，容器用 rm，别搞混',
    ],
    reflectionQuestions: ['rmi 和 rm 有什么区别？为什么删除命令要分两个？', '删除一个从没拉取过的镜像会发生什么？'],
    hintLevels: {
      goal: '把 redis 镜像拉到本地，查看、检查它，最后把它删除。',
      think: '任务里"拉取""查看""检查""删除"四个词，顺序就是镜像的一生；先确认它还不存在，再让它出现，最后让它消失。',
      commandType: '需要四条命令：拉取镜像的、列出镜像的、查看镜像详情的、删除镜像的，后两个名字长得几乎一样。',
      syntax: 'docker <动作> <镜像名>——动作是拉取、列出、检查、删除四个单词之一；拉取、检查、删除的对象都是 redis，只有列表命令不需要写对象。',
      answer:
        '依次输入 docker pull redis（模拟下载，输出类似层的进度信息）、docker images（redis 出现在列表中）、docker inspect redis（输出一大段 JSON 详情）、docker rmi redis（删除成功），最后再用 docker images 确认 redis 已经消失。下一步：理解镜像和容器的关系，进入下一课真正"做菜"。',
    },
    completion: {
      solved: '你完成了镜像的完整生命周期：拉取、查看、检查、删除。',
      clue: '"拉取""检查""删除"三个动作对应四条命令，且删除对象是镜像所以用 rmi。',
      why: '这四条命令覆盖了镜像从获取到清理的所有阶段，各司其职。',
      reuse: '以后装任何软件镜像都先拉取再确认，不用了就用 rmi 清理。',
      relatedCommand: 'docker pull redis:7 可以指定版本标签，默认才拉 latest。',
    },
  },
  'docker-run-nginx': {
    scenario:
      '你已经把 nginx 镜像拉到了本地（docker images 能看到它），现在要让一个真正的网站服务跑起来。但直接输入镜像名可不会启动任何东西——镜像只是"菜谱"，你需要用 run 命令按照菜谱"做菜"。',
    whyItMatters: 'docker run 是你使用 Docker 时敲得最多的命令，学会它的核心参数，后面所有课程的容器操作都建立在它之上。',
    observationGuide: [
      '先 docker images 确认 nginx 镜像已存在',
      '任务关键词是"启动""运行"——这对应 Docker 里"创建并启动容器"的动作',
    ],
    reasoningSteps: [
      '镜像只是静态的"菜谱"，要让它变成运行的"菜"（容器）',
      '任务说网站要能通过 http://localhost:8080 访问，说明要把容器内的 80 端口映射出来',
      '任务还要求容器在后台持续运行，不能占用当前终端',
    ],
    commandSelection:
      'docker run 负责"创建并启动一个新容器"，它同时解决了"启动服务"和"端口映射"两个需求，是这一场景的唯一正确入口。',
    transferRules: [
      '"把镜像变成运行的容器" → docker run',
      '"要后台运行" → 加 -d',
      '"要访问容器内的服务" → 加 -p 宿主机端口:容器端口',
      '"启动一个叫特定名字的容器" → 加 --name',
      '"容器跑起来了吗" → docker ps',
    ],
    reflectionQuestions: ['-p 8080:80 里，8080 和 80 分别代表什么？为什么要写两个端口？', '如果不写 -d 会怎样？'],
    hintLevels: {
      goal: '让 nginx 镜像变成一个真正运行的后台服务，并能在浏览器访问它。',
      think: '先看任务里出现的端口号 8080 和"后台运行"这两个词，它们都对应启动容器时需要的参数。',
      commandType: '需要使用"从镜像创建并启动容器"的命令，它同时支持后台运行和端口映射两个选项。',
      syntax: 'docker run -d --name <名字> -p <宿主机端口>:<容器端口> <镜像名>——尖括号里的内容是占位符，要替换成任务里给的值，不能照抄。',
      answer:
        '输入 docker run -d --name web -p 8080:80 nginx 并回车。含义：-d 后台运行，--name web 把容器命名为 web，-p 8080:80 把宿主机的 8080 端口映射到容器的 80 端口，nginx 是要运行的镜像。执行后输出一串容器 ID，用 docker ps 应该能看到 STATUS 为 Up 的 web 容器。',
    },
    completion: {
      solved: '你从 nginx 镜像创建并启动了一个名为 web 的容器，并映射了 8080 端口。',
      clue: '判断依据是任务关键词"启动""8080 端口""后台运行"，这些分别对应 run、-p、-d。',
      why: 'docker run 是把镜像变成运行中容器的唯一入口，-d 和 -p 是它最常用的两个选项。',
      reuse: '以后启动任何服务（数据库、网站、Redis 等）都用 docker run，只是镜像名和端口不同。',
      relatedCommand: 'docker stop web——启动后自然想知道怎么优雅地停掉它。',
    },
  },
  'docker-lifecycle': {
    scenario:
      '上一课你启动了名为 web 的 nginx 容器，现在它正占着 8080 端口。容器像一台有"生老病死"的机器：运行中（running）、已停止（exited），删除后彻底消失。本课陪它走完一生。',
    whyItMatters: '容器天天要经历停止、启动、重启、删除，这些是最基础的运维动作；尤其"运行中的容器不能直接删"这个坑，踩一次就要回头改代码。',
    observationGuide: [
      '普通列表命令只看运行中的容器，加一个参数才能看到已停止的',
      '停止后的容器状态列会变成 Exited',
      '任务关键词是"停止""重新启动""重启""删除"，是四个不同的动作',
    ],
    reasoningSteps: [
      '先创建 web 容器，这是"出生"',
      '"停止"用停止命令，然后加参数确认它进入 Exited 状态',
      '"重新启动"和"重启"是两回事：一个让停下的容器再跑，一个先停再启',
      '删除前必须保证容器是停止状态，这是安全规则',
    ],
    commandSelection:
      '四个动作单词本身就是"停止、启动、重启、删除"的英文直译，而列表命令加小写 a（all）就能把已停止的也列出来。',
    transferRules: [
      '"只看运行中的容器" → docker ps',
      '"看包括已停止在内的所有容器" → docker ps -a',
      '"停止容器" → docker stop <名字>',
      '"让停止的容器再运行" → docker start <名字>',
      '"删除容器" → 先 docker stop 再 docker rm，运行中不能直接删',
    ],
    reflectionQuestions: ['stop 和 restart 的区别是什么？各自适合什么场景？', '为什么运行中的容器不能直接删除？'],
    hintLevels: {
      goal: '创建 web 容器，然后按顺序完成停止、再启动、重启、最后删除的完整一生。',
      think: '任务里"停止""重新启动""重启""删除"四个词对应四个动作，注意"重新启动"和"重启"不是同一个动作，删除前容器必须是停止状态。',
      commandType: '需要一条创建容器的命令和四条生命周期管理命令，还有一条带参数 a 的查看命令。',
      syntax: 'docker <动作> <容器名>——动作是停止、启动、重启、删除四个单词之一，最后都要带容器名 web；查看列表时在基础命令后加 -a 能看到已停止的容器。',
      answer:
        '先 docker run -d --name web -p 8080:80 nginx 创建容器；再 docker stop web（停止，输出容器名）后用 docker ps -a 看到状态变为 Exited；再 docker start web 让它恢复运行；docker restart web 执行一次重启；最后先 docker stop web 再 docker rm web 完成删除，再用 docker ps -a 确认 web 已消失。下一步：进入日志与检查课程，学会观察容器内部。',
    },
    completion: {
      solved: '你让 web 容器完整经历了停止、再启动、重启和删除的整个生命周期。',
      clue: '"停止""重启""删除"对应 stop、restart、rm，且牢记运行中不能删除。',
      why: '停止、启动、重启、删除是容器管理的四大基础动作，带 a 的列表命令则是看清全貌的关键。',
      reuse: '任何容器的日常维护都是这套动作，把"先停后删"变成肌肉记忆。',
      relatedCommand: 'docker rm -f web 可以强制删除运行中的容器，但一般不推荐。',
    },
  },
  'docker-logs-stop': {
    scenario:
      'web 容器正安静地跑着，但你完全不知道它里面发生了什么。容器像个"黑箱"：要看它的输出要靠日志，要进它里面要靠执行命令，要看它的档案要靠详情命令。本课把这三种"偷看"手段都学会。',
    whyItMatters: '程序出问题时，第一手证据就是日志；而进入容器执行命令是排查运行中容器内部状态的唯一手段，详情命令则是最全的档案。三者合起来，你才真正"看得见"容器。',
    observationGuide: [
      '日志命令显示容器打印过的输出，加 -f 会跟随新日志',
      '进入容器执行命令时，先写容器名，再写要在里面执行的命令',
      '详情命令输出的是最长的一串 JSON',
    ],
    reasoningSteps: [
      '先列出容器确认 web 正在运行，操作对象要真实存在',
      '任务说"日志"——容器打印出来的记录，用日志命令查看',
      '"钻进去执行命令"——执行命令可以让命令在容器内运行，容器有自己的文件系统',
      '想看最完整的档案——详情命令输出状态、配置、网络等全部字段',
    ],
    commandSelection:
      '三个动作词分别对应"看输出""进内部""查档案"：日志用 logs（加 f 表示 follow 跟随）、执行用 exec、档案用 inspect。',
    transferRules: [
      '"查看容器的输出日志" → docker logs <容器名>',
      '"实时跟随新日志" → docker logs -f <容器名>',
      '"在运行中的容器内执行命令" → docker exec <容器名> <命令>',
      '"查看容器的完整配置档案" → docker inspect <容器名>',
      '"只看日志末尾几行" → docker logs --tail 20 <容器名>',
    ],
    reflectionQuestions: ['exec 里 ls 看到的是哪里的文件？和宿主机有什么关系？', '为什么排障时先看日志而不是直接重建容器？'],
    hintLevels: {
      goal: '通过日志、进入容器执行命令、查看容器档案三种方式，深入了解运行中的 web 容器。',
      think: '任务关键词"日志""进入容器执行命令""JSON 详情"分别对应三种手段，注意执行命令后面要同时写容器名和要执行的命令两样东西。',
      commandType: '需要一条查日志的命令、一条"钻进容器执行命令"的命令，和一条输出完整 JSON 档案的命令。',
      syntax: '三个命令的结构都是"docker + 动作词 + 容器名 web"；其中"进入容器执行"那个还要在容器名后面再加一条命令。',
      answer:
        '先 docker ps 确认 web 运行中；再 docker logs web 查看日志，试试 docker logs -f web 跟随实时输出；再输入 docker exec web ls /usr/share/nginx/html，在容器内部执行 ls，看到的是容器自己的文件；最后 docker inspect web 输出完整 JSON，找 State、Config、NetworkSettings 字段。下一步：学会在启动时给容器做端口映射，掌握更精细的控制。',
    },
    completion: {
      solved: '你用日志、执行、详情三种手段，把运行中的 web 容器看了个透。',
      clue: '"日志""进入容器""JSON 详情"三个关键词分别指向三条查看命令。',
      why: '这些命令都能在不打扰容器的情况下获取内部信息，是排障的利器。',
      reuse: '任何容器"不对劲"时，先看日志找报错、再进容器查内部、最后看档案查配置。',
      relatedCommand: 'docker top web 可以查看容器内正在运行的进程列表。',
    },
  },
  'docker-ports': {
    scenario:
      '楼下快递柜的格口，同一时刻只能放一家快递。宿主机端口就是这样：-p 8080:80 的意思是"把容器里 80 端口的水管接到宿主机的 8080 格口"。本课启动 web 容器用 curl 访问验证，再故意制造一次端口冲突，亲眼看报错。',
    whyItMatters: '端口映射是容器对外提供服务的方式，而端口冲突是新手第一高频报错；见过一次报错原文，以后就知道怎么避让。',
    observationGuide: [
      '-p 的格式是"宿主机端口:容器端口"，冒号左边对外、右边对内',
      'curl 后面要带完整的 http:// 协议头',
      '第二个容器抢同一个宿主机端口时会报端口已分配的错误',
    ],
    reasoningSteps: [
      '任务要求"启动 web 容器（8080->80）"，-p 8080:80 完成映射',
      '"访问服务"用 curl 模拟浏览器，地址是宿主机 8080',
      '再启动一个也占用 8080 的容器，等于两个快递抢一个格口，必然报错',
      '报错后确认 8080 仍然只被 web 占用，其他容器没被破坏',
    ],
    commandSelection:
      '-p 是 publish 的缩写，负责端口映射；curl 是模拟 HTTP 请求的工具，用它验证"水管是否真的通了"。',
    transferRules: [
      '"让容器服务对外可访问" → docker run -p 宿主机端口:容器端口',
      '"验证服务是否通" → curl http://localhost:端口/',
      '"端口被占用" → 报错提示端口已分配，换一个宿主机端口',
      '"容器内部端口" → 由镜像决定，如 nginx 是 80，改的是冒号左边的值',
    ],
    reflectionQuestions: ['8080:80 两个数字分别代表什么？哪个是可换的？', '两个容器能共享同一个容器端口（80）吗？为什么？'],
    hintLevels: {
      goal: '启动映射 8080 端口的 web 容器，用 curl 验证访问，再体验一次端口冲突。',
      think: '注意"8080->80"这种写法：箭头左边是宿主机端口，右边是容器内端口；冲突场景是"再启动一个也占用 8080 的容器"，关键词是"占用"。',
      commandType: '需要一条带端口映射的启动命令，一条模拟浏览器访问的请求命令，以及再看一次容器状态的命令。',
      syntax: 'docker run -d --name <名字> -p <宿主机端口>:<容器端口> <镜像名>——冒号左边是宿主机端口，右边是容器端口，冲突发生在左边；访问用 curl http://localhost:8080/。',
      answer:
        '先 docker run -d --name web -p 8080:80 nginx 启动 web（-p 8080:80 把宿主机 8080 映射到容器 80）；再 curl http://localhost:8080/ 会返回 nginx 欢迎页面；接着故意运行 docker run -d --name web2 -p 8080:80 nginx，会报端口已被占用（port is already allocated），因为 8080 已被 web 占用；最后 docker ps 确认只有 web 在用 8080。下一步：学会用 -e 给容器注入环境变量。',
    },
    completion: {
      solved: '你启动了端口映射的 web 容器，验证了访问，并亲眼看到了端口冲突报错。',
      clue: '"8080->80"的箭头方向提示了 -p 的书写顺序，冲突时认准端口已占用的报错。',
      why: '-p 是容器对外通信的桥梁，curl 是验证桥梁是否通行的工具。',
      reuse: '以后启动任何对外服务都要 -p 映射，遇到端口冲突就换冒号左边的数字。',
      relatedCommand: 'docker port web 可以专门查看某个容器的端口映射关系。',
    },
  },
  'docker-env': {
    scenario:
      '同一个 nginx 镜像，在不同机器上要扮演不同角色（生产、测试），配置不能写死在镜像里。解决办法是"贴在容器身上的配置纸条"——环境变量。本课用 -e 把两张纸条贴上去，再检查纸条是否贴稳。',
    whyItMatters: '真实应用几乎全靠环境变量区分环境和敏感配置，不会注入环境变量，你的容器只能永远用一种配置；而验证方法能防止"纸条没贴上去"的乌龙。',
    observationGuide: [
      '-e 的格式是 KEY=value，等号两边都要写',
      '在容器内执行 env 命令会列出全部环境变量',
      '容器档案的 Config.Env 数组里同样能看到',
    ],
    reasoningSteps: [
      '任务要求注入两个变量 APP_MODE=prod 和 APP_REGION=cn，每个变量都要一个 -e',
      '启动后要"验证"，方式是在容器内执行 env 命令打印所有环境变量',
      '档案命令的 Config.Env 是另一处存档，两处对照更放心',
    ],
    commandSelection:
      '-e 是 environment 的缩写，专门在创建容器时注入环境变量；在容器内执行 env 命令，是把它打印出来给你看。',
    transferRules: [
      '"给容器注入配置" → docker run -e KEY=value',
      '"注入多个配置" → 连用多个 -e',
      '"查看容器内的环境变量" → docker exec <容器> env',
      '"查看容器档案里的环境变量" → docker inspect 的 Config.Env',
    ],
    reflectionQuestions: ['-e KEY=value 里等号换成空格会怎样？', '环境变量和改镜像里的配置文件相比，优势是什么？'],
    hintLevels: {
      goal: '创建容器时注入 APP_MODE 和 APP_REGION 两个环境变量，并验证它们真的生效了。',
      think: '任务给出两个"KEY=值"的写法，注意等号是必须的；验证方式有两种，一种在容器内打印，一种在档案里找。',
      commandType: '需要一条带环境变量选项的启动命令，一条在容器内查看环境变量的命令，一条输出容器档案的命令。',
      syntax: 'docker run -d --name <名字> -e KEY=value -e KEY=value <镜像名>——-e 后面紧跟 KEY=value，等号不能少；验证时一条命令在容器内打印所有环境变量，另一条输出档案。',
      answer:
        '先 docker run -d --name app -e APP_MODE=prod -e APP_REGION=cn nginx 启动（-e 表示注入环境变量，KEY=value 是值，两个 -e 注入了两张纸条）；再 docker exec app env 列出容器内全部环境变量，能在输出里找到 APP_MODE=prod 和 APP_REGION=cn；最后 docker inspect app 在 Config.Env 数组里也能看到同样内容。下一步：学会用数据卷让数据在容器删除后依然存活。',
    },
    completion: {
      solved: '你用 -e 注入了两个环境变量，并用容器内打印和档案两种方式双重验证。',
      clue: '"APP_MODE=prod"的等号写法提示 -e 的参数格式，验证靠 env 命令。',
      why: '环境变量把配置从镜像里解放出来，-e 是注入它的标准入口。',
      reuse: '以后给任何容器配数据库地址、密钥、环境标识都用 -e，一次可连用多个。',
      relatedCommand: 'docker inspect 里还有 Config.Cmd 等字段，可以继续挖一挖容器的出身。',
    },
  },
  'docker-volumes': {
    scenario:
      '容器像"一次性餐盒"：删掉容器，里面写的文件就跟着没了。你有个数据卷（volume），它像"共享冰箱"：创建一次，挂到容器上，餐厅关门了冰箱里的食材还在。本课亲手验证这个特性。',
    whyItMatters: '数据库、用户上传等数据如果存在容器里，一删容器全部归零，这是新手最容易出的灾难事故；掌握卷的用法，数据才真正属于你而不是属于容器。',
    observationGuide: [
      '卷列表命令能看到已创建的卷',
      '-v 的格式是"卷名:容器内路径"，冒号右边是容器里的挂载点',
      '挂载后往 /data 写文件，文件会进到卷里',
    ],
    reasoningSteps: [
      '任务先要"创建数据卷 appdata"，用创建卷的命令',
      '然后"挂载卷启动容器"，-v appdata:/data 把卷接到容器的 /data 目录',
      '在容器内往 /data 写文件（如 hello.txt），模拟产生数据',
      '删除容器再挂同一个卷重建，去 /data 里看文件是否还在——这就是持久化验证',
    ],
    commandSelection:
      'volume 是"数据卷"的统称，-v 是它的缩写，格式"卷名:路径"让容器和卷对接；随后用停止删除命令清掉容器，再用同一个卷名重建。',
    transferRules: [
      '"创建数据卷" → docker volume create <卷名>',
      '"查看已有数据卷" → docker volume ls',
      '"把卷挂进容器" → docker run -v 卷名:容器内路径',
      '"容器删了数据不丢" → 数据写进卷里而不是容器内',
      '"删除数据卷" → docker volume rm <卷名>，但要先删掉使用它的容器',
    ],
    reflectionQuestions: ['为什么 -v appdata:/data 里，卷的数据不怕容器被删？', '如果两个容器挂同一个卷，会发生什么？'],
    hintLevels: {
      goal: '创建数据卷 appdata，挂到容器上写入文件，删除容器后用同一个卷重建，验证数据依然存在。',
      think: '任务关键词"创建卷""挂载""删除容器并用同一卷重建"，抓住"同一卷"三个字——卷是独立于容器存在的存储空间。',
      commandType: '需要一条创建卷的命令、一条带卷挂载选项的启动命令、一条在容器内执行命令的入口，以及停止删除容器的命令。',
      syntax: '创建卷的命令是 docker volume <动作> <卷名>；挂载时在启动命令里加 -v 卷名:容器内路径；在容器内写文件用"进入容器执行"那条命令；删除容器先停止再删除，最后用同样的挂载参数重新启动。',
      answer:
        '先 docker volume create appdata 创建卷（输出卷名 appdata）；再 docker run -d --name app -v appdata:/data nginx 启动（-v appdata:/data 把卷挂到容器内的 /data 路径）；docker exec app touch /data/hello.txt 在容器内写入文件；然后 docker stop app 再 docker rm app 删除容器；最后用同样的命令 docker run -d --name app -v appdata:/data nginx 重建，docker exec app ls /data 能看到 hello.txt 还在——数据没随容器消失。下一步：学习容器网络，让多个容器互相通信。',
    },
    completion: {
      solved: '你验证了数据卷的核心价值：容器删除后，卷里的数据依然完好。',
      clue: '任务反复强调"同一个卷"，这是持久化的钥匙，写进卷的数据跟容器无关。',
      why: '-v 卷名:路径 把容器目录和卷绑定，写进卷的数据由 Docker 独立保管。',
      reuse: '以后任何要保存数据的服务（数据库、日志）都要挂卷，这是数据安全的底线。',
      relatedCommand: 'docker volume inspect appdata 可以查看卷的详细信息。',
    },
  },
  'docker-networks': {
    scenario:
      '两个容器想互相"串门"。默认网络里，它们只能靠 IP 地址找对方，而 IP 每次重启都可能变，很不方便。创建自定义网络就像单独划一个楼栋，同一栋里的容器可以直接用对方的名字互访。本课把 app1 和 app2 搬进同一栋楼。',
    whyItMatters: '真实应用都是多容器协作，容器之间要用名字互相调用；不懂自定义网络，你就只能依赖会变的 IP，系统一重启就断。',
    observationGuide: [
      '网络列表命令能看到默认网络和自定义网络',
      '启动容器时加一个网络参数，就能让容器加入指定网络',
      '网络详情命令的成员字段列出所有容器',
    ],
    reasoningSteps: [
      '先"创建自定义网络 webnet"，创建网络的命令负责盖楼',
      '把 app1 和 app2 分别"接入 webnet"，启动时加网络参数',
      '"查看网络成员"用网络详情命令，成员字段是名单',
    ],
    commandSelection:
      'network 是"网络"命令组：创建、列出、查看详情三个子命令；启动容器时加网络参数，指名道姓送容器入楼。',
    transferRules: [
      '"创建自定义网络" → docker network create <网络名>',
      '"查看网络列表" → docker network ls',
      '"让容器加入网络" → docker run --network <网络名>',
      '"查看网络里有哪些容器" → docker network inspect <网络名>',
      '"同网络容器互访" → 直接用容器名当地址，不用记 IP',
    ],
    reflectionQuestions: ['同一网络的容器为什么能用名字互访？这解决了 IP 的什么问题？', '如果容器不在同一网络，它还能访问对方吗？'],
    hintLevels: {
      goal: '创建网络 webnet，把 app1 和 app2 两个容器都接入，并查看网络的成员名单。',
      think: '任务关键词"创建网络""接入""查看网络成员"，接入发生在启动容器那一刻，用"网络名"把容器和楼栋绑定。',
      commandType: '需要一条创建网络的命令、两条带网络接入参数的启动命令、一条查看网络详情的命令。',
      syntax: '创建网络是 docker network <动作> <网络名>；启动容器时加 --network <网络名> 参数接入；查看网络详情是 docker network <动作> <网络名>，输出里有成员名单。',
      answer:
        '先 docker network create webnet 创建网络（输出网络 ID）；再 docker run -d --name app1 --network webnet nginx 启动 app1（--network webnet 让它加入 webnet），app2 同理用 docker run -d --name app2 --network webnet nginx；最后 docker network inspect webnet，在输出的成员字段里能看到 app1 和 app2 两个成员。下一步：自己写 Dockerfile，定制专属镜像。',
    },
    completion: {
      solved: '你创建了 webnet 网络，把 app1、app2 两个容器接了进来，并确认了成员名单。',
      clue: '"创建""接入""查看成员"分别对应创建、接入参数、查看详情三个环节。',
      why: '自定义网络让容器用名字互访，摆脱了对易变 IP 的依赖。',
      reuse: '以后部署任何多容器应用，先把容器放进同一个自定义网络，互访零障碍。',
      relatedCommand: 'docker network connect webnet app3 可以在容器运行后追加接入网络。',
    },
  },
  'docker-dockerfile': {
    scenario:
      '直接用现成镜像只是"照菜谱做菜"，今天你要当主厨，自己写"配方单"：用 Dockerfile 的几行指令，把 index.html 装进 nginx 镜像，做出一盘专属于你的菜。',
    whyItMatters: '自定义镜像是生产部署的基础，不会写 Dockerfile 就永远只能拿别人的镜像；理解这几行指令，你就掌握了"定制环境"的钥匙。',
    observationGuide: [
      'Dockerfile 是一个纯文本文件，保存在当前目录',
      '第一行指令是配方单的底料选择，决定基础镜像',
      '复制指令是"把本地文件放进镜像"，执行指令是"在构建时运行命令"',
    ],
    reasoningSteps: [
      '配方单要从底料开始：选 nginx 作为基础镜像',
      '工作目录指令定下目录，后续操作都在这个目录里进行',
      '任务里有 index.html 文件，要用复制指令把它放进去',
      '声明端口指令写上 80，启动命令指令规定容器启动时运行的命令',
    ],
    commandSelection:
      'Dockerfile 的指令都是大写单词，每个词负责一个环节：选底料、定目录、复制文件、执行命令、声明端口、定义启动命令。',
    transferRules: [
      '"选基础镜像" → FROM <镜像名>',
      '"指定工作目录" → WORKDIR <路径>',
      '"把文件放进镜像" → COPY <本地文件> <镜像内路径>',
      '"构建时执行命令" → RUN <命令>',
      '"声明端口 / 定义启动命令" → EXPOSE <端口> / CMD ["命令", "参数"]',
    ],
    reflectionQuestions: ['复制指令和执行指令的执行时机有什么不同？', '为什么启动命令要写成数组形式？'],
    hintLevels: {
      goal: '在代码编辑器里写一份完整的 Dockerfile，把 index.html 装进 nginx 镜像。',
      think: '配方单有固定环节：选底料、定工作目录、复制文件、构建时执行、声明端口、定义启动命令，六个环节缺一不可，写完后要点保存。',
      commandType: '这是"配方单"编写任务：需要六条大写开头的指令，分别负责选底料、定工作目录、复制文件、构建时执行、声明端口、定义启动命令，保存后可以用查看命令确认。',
      syntax: '结构模板：先写底料行 FROM nginx；再写 WORKDIR /usr/share/nginx/html；然后 COPY index.html /usr/share/nginx/html/；接着 RUN echo done > /build.log；再写 EXPOSE 80；最后 CMD ["nginx", "-g", "daemon off;"]。',
      answer:
        '切换到编辑器标签页，输入：FROM nginx（基础镜像）；WORKDIR /usr/share/nginx/html（工作目录）；COPY index.html /usr/share/nginx/html/（把 index.html 复制进镜像）；RUN echo done > /build.log（构建时生成构建记录）；EXPOSE 80（声明 80 端口）；CMD ["nginx", "-g", "daemon off;"]（容器启动时前台运行 nginx），然后点保存。保存后可用 cat Dockerfile 确认内容完整。下一步：用构建命令把这份配方单变成真正的镜像。',
    },
    completion: {
      solved: '你写了一份完整的 Dockerfile，把 index.html 装进了 nginx 镜像。',
      clue: '六个大写指令各司其职，配方单的每个环节都能对上号。',
      why: 'Dockerfile 是"镜像的配方单"，Docker 会照着它一步步构建出镜像。',
      reuse: '以后构建任何应用的镜像都从这份模板改起：换底料、改复制指令的文件即可。',
      relatedCommand: '构建命令是下一步的主角，它负责执行这份配方单。',
    },
  },
  'docker-build': {
    scenario:
      '配方单（Dockerfile）写好了，现在要"照着做饭"：构建命令会一步步执行配方单里的指令，最终产出一个全新的镜像。本课把镜像做出来、起个响亮的名字、并查看做菜记录。',
    whyItMatters: '构建是把代码变成可交付镜像的核心环节，命名参数和结尾的点（构建上下文）是新手最容易漏掉的关键细节。',
    observationGuide: [
      '构建命令结尾的 . 表示把当前目录作为构建上下文',
      '命名参数是给镜像起的名字和标签，格式"名称:标签"',
      '查看历史的命令逐行显示镜像的构建步骤',
    ],
    reasoningSteps: [
      '任务说"构建镜像 myapp:v1"，构建命令加命名参数同时完成构建和命名',
      '"加一个 latest 标签"用打标签命令，给同一镜像起别名',
      '"查看构建步骤"用查看历史命令，能看到每一步',
      '最后用构建出的镜像启动容器，验证它真的能用',
    ],
    commandSelection:
      '构建命令负责执行配方单，命名参数负责起名，打标签命令添加别名，查看历史命令展示构建流水账——"做""命名""看记录"三件事各有其主。',
    transferRules: [
      '"从 Dockerfile 构建镜像" → docker build -t 名称:标签 .',
      '"给镜像加标签" → docker tag 旧标签 新标签',
      '"查看镜像的构建步骤" → docker history <镜像名>',
      '"用自建镜像启动容器" → docker run -d <镜像名>',
      '"构建上下文" → 构建命令结尾的 . 表示当前目录',
    ],
    reflectionQuestions: ['myapp:v1 和 myapp:latest 是什么关系？是两份镜像吗？', '为什么构建命令结尾要写 . ？'],
    hintLevels: {
      goal: '用 Dockerfile 构建出 myapp:v1 镜像，加上 latest 标签，查看构建历史，并用它启动容器。',
      think: '任务关键词"构建""加标签""查看历史""启动容器"，注意构建命令结尾有个点号代表当前目录，标签格式是名称加冒号加标签。',
      commandType: '需要一条构建镜像的命令（带命名参数）、一条添加标签的命令、一条查看历史的命令，以及一条启动容器的命令。',
      syntax: 'docker build -t <名字>:<标签> .——-t 后跟"名字:标签"为镜像命名，结尾的 . 表示当前目录作为构建上下文；随后用打标签命令给同一镜像加别名，用查看历史的命令看构建流水账。',
      answer:
        '先 docker build -t myapp:v1 . 构建镜像（-t myapp:v1 命名为 myapp 并打 v1 标签，结尾的 . 表示把当前目录作为构建上下文，输出会逐行显示构建步骤）；再 docker tag myapp:v1 myapp:latest 添加 latest 标签；docker history myapp:v1 查看构建流水账，能看到底料、复制、启动命令等步骤；最后 docker run -d --name site -p 8080:80 myapp:v1 用自建镜像启动容器，docker ps 确认它运行中。下一步：用编排命令一次性管理多个容器。',
    },
    completion: {
      solved: '你把配方单变成了 myapp 镜像，加了 latest 标签，并用它启动了容器。',
      clue: '"构建""加标签""查看历史"对应构建加命名参数、打标签、看历史三个动作，容器名随意起但端口沿用 8080。',
      why: '构建命令是"配方单到镜像"的唯一通道，命名参数和结尾的 . 是它的标配。',
      reuse: '以后每次改完代码，都构建一个新版本再打标签，版本管理尽在掌握。',
      relatedCommand: 'docker rmi myapp:v1 可以删除你构建的镜像，和镜像课一样先确认再删。',
    },
  },
  'docker-compose': {
    scenario:
      '真实应用往往是好几道菜一起上：前端、后端、数据库。一个个启动容器太啰嗦了。编排命令像"一键启动剧本"：把所有服务写进一个 compose.yaml，一条命令全部启动。本课编写 web 和 api 两个服务的剧本并排练一遍。',
    whyItMatters: '多容器应用手工逐个启动又慢又容易漏参数，编排把服务定义沉淀成文件，团队都能一键复现环境，这是现代交付的基本功。',
    observationGuide: [
      'compose.yaml 以 services: 开头，每个服务缩进两格',
      '服务里的 image 指定镜像，ports 用列表形式写端口映射',
      '编排启动的容器名字带 compose- 前缀',
    ],
    reasoningSteps: [
      '先"编写 compose.yaml"：services 下定义 web 和 api 两个服务',
      'web 服务用 web 镜像、映射 8080:80，api 服务用 api 镜像、映射 3000:3000',
      '"启动"用编排启动命令，一条命令拉起所有服务',
      '"停止""清理"分别用停止和拆除命令，拆除会删除容器但保留数据卷',
    ],
    commandSelection:
      '编排是"一键启动剧本"：启动、看状态、看日志、停止、拆除五个子命令，对应服务的完整管理流程。',
    transferRules: [
      '"多个服务一键启动" → docker compose up',
      '"查看服务状态" → docker compose ps',
      '"查看服务日志" → docker compose logs',
      '"停止服务" → docker compose stop',
      '"停止并删除容器" → docker compose down（保留数据卷）',
    ],
    reflectionQuestions: ['编排启动和逐条启动容器各自适合什么场景？', '拆除和停止的区别是什么？'],
    hintLevels: {
      goal: '编写包含 web 和 api 两个服务的 compose.yaml，并完整走一遍启动、查看、停止、清理的流程。',
      think: '这是"文件编写加命令管理"的组合任务：先在编辑器写剧本（两个服务各有镜像和端口），再用编排命令组完成启动、查看、停止、清理四个动作。',
      commandType: '需要先在编辑器写一个 YAML 格式的配置文件，然后用编排命令组完成四个管理动作。',
      syntax: 'compose.yaml 模板：version: "3"，services 下定义两个服务，每个服务有 image 和 ports（web 映射 8080:80，api 映射 3000:3000）；管理命令都是 docker compose <子命令>。',
      answer:
        '在编辑器保存 compose.yaml：version: "3"\nservices:\n  web:\n    image: web\n    ports:\n      - "8080:80"\n  api:\n    image: api\n    ports:\n      - "3000:3000"；然后依次执行 docker compose up（一次性启动两个服务）、docker compose ps（查看状态）、docker compose logs（查看日志）、docker compose stop（停止服务）、docker compose down（停止并删除容器，数据卷保留）。下一步：给容器加上健康检查和资源限制。',
    },
    completion: {
      solved: '你编写了双服务 compose.yaml，并用编排命令组完成了启动、查看、停止、清理全流程。',
      clue: '"一键启动"和"管理命令组"指向编排，服务的镜像和端口信息都从任务说明中取。',
      why: '编排把多容器的定义沉淀成文件，一条命令即可整体管理。',
      reuse: '以后任何多容器项目都先写 compose.yaml，团队共享一套启动剧本。',
      relatedCommand: 'docker compose -f 其他文件.yaml up 可以指定别的剧本文件。',
    },
  },
  'docker-limits': {
    scenario:
      '容器跑起来后要上三道"保险"：健康检查（定时探测容器还活着吗）、资源限制（防止某个容器吃垮整台机器）、重启策略（挂了自动拉起来）。本课分别给三个容器装上这三道保险。',
    whyItMatters: '不加限制的容器像脱缰的野马，内存泄漏就能拖垮整个宿主机；没有健康检查，服务假死你都不知道；不学会这三样，你管不了容器集群。',
    observationGuide: [
      '容器列表里有一列 HEALTH，健康检查通过会显示 healthy',
      '内存参数的单位是小写 m 或 g，如 128m',
      '重启策略的值 always 表示无论什么原因退出都自动重启',
    ],
    reasoningSteps: [
      '任务要"带健康检查的容器"，健康探测参数后跟要执行的探测命令',
      '"内存与 CPU 限制"用内存和 CPU 两个参数，给容器定量配给',
      '"重启策略"用重启参数，规定挂了自动拉起',
      '最后用档案命令验证三道保险真的装上了',
    ],
    commandSelection:
      '三个选项各有归属：健康探测参数定义检查命令、内存和 CPU 参数限制资源、重启参数设置策略，都是在启动时一次装好。',
    transferRules: [
      '"定时探测容器健康" → docker run --health-cmd "探测命令"',
      '"限制内存" → --memory 128m（单位用小写）',
      '"限制 CPU" → --cpus 0.5（半个核心）',
      '"容器挂了自动重启" → --restart always',
      '"验证配置" → docker inspect 里的健康与资源字段',
    ],
    reflectionQuestions: ['健康检查和日志查看，哪个更先发现问题？', '重启策略 always 和 no 有什么区别？'],
    hintLevels: {
      goal: '创建三个容器，分别加上健康检查、资源限制、重启策略，并验证配置生效。',
      think: '任务给了三件"保险"，每件对应启动命令里的一组选项：探测命令、内存加 CPU、重启策略；验证靠档案命令里的对应字段。',
      commandType: '需要三条带不同选项的启动命令，其中一条带健康探测、一条带资源限制、一条带重启策略，最后用查看档案的命令验证。',
      syntax: '启动命令结构：docker run -d --name <名字> [选项] <镜像名>，选项可组合：--health-cmd 后跟引号包住的探测命令、--memory 后跟带单位的内存值（如 128m）、--cpus 后跟核心数、--restart 后跟策略名。',
      answer:
        '先 docker run -d --name app --health-cmd "curl -f http://localhost:80/" nginx 启动带健康检查的容器（--health-cmd 指定探测命令），docker ps 的 HEALTH 列应变为 healthy；再 docker run -d --name limited --memory 128m --cpus 0.5 nginx 限制内存（128m 表示 128 兆，m 必须小写）和 CPU（0.5 表示半个核心）；再 docker run -d --name auto --restart always nginx 设置重启策略；最后 docker inspect app 在健康状态和资源配置字段里验证。下一步：进入综合排障关卡，把所学全部用上。',
    },
    completion: {
      solved: '你为三个容器分别装上了健康检查、资源限制和重启策略，并验证了配置。',
      clue: '"探测""限制""重启策略"对应三个选项，验证走档案命令的对应字段。',
      why: '健康、限额、自愈是生产环境的标配，三条命令就把保险装好。',
      reuse: '以后任何重要容器都加健康探测，吃内存的服务必加内存限制。',
      relatedCommand: '档案命令里的资源字段可以看到限制是否生效。',
    },
  },
  'docker-troubleshoot': {
    scenario:
      '最后是实战演习：部署 Web、API、数据库三层应用，但系统里埋了一个故障——api 容器连接数据库时用了错误的地址 wronghost，一直处于不健康状态。就像修车：先看仪表盘，再看故障码，最后动手修。',
    whyItMatters: '排障思路比命令本身更重要：先发现问题、再定位原因、再动手修复；顺序一乱，你会越修越乱，这是运维最核心的软实力。',
    observationGuide: [
      '全局列表里能看到 api 的状态是 unhealthy',
      '日志命令会显示连接 wronghost 失败的报错',
      '环境变量 DB_HOST 决定了 api 找哪个数据库',
    ],
    reasoningSteps: [
      '先看全局状态，发现 api 不对劲（仪表盘亮红灯）',
      '再看日志，定位到"连不上 wronghost"（故障码）',
      '搭好基础设施：创建网络 webnet、数据卷 pgdata',
      '启动数据库（挂卷、入网、设密码），再删掉坏 api 用正确地址重建',
      '最后启动 web 并验证整条链路',
    ],
    commandSelection:
      '这是"组合拳"课程：看状态和看日志负责诊断，网络和卷命令搭台，启动命令按正确参数重建数据库和 api，最后用访问命令做最终验收——每一步都是前面课程学过的命令。',
    transferRules: [
      '"先看全局状态" → docker ps -a',
      '"看失败原因" → docker logs <容器名>',
      '"同网络容器互访" → 用网络参数加容器名',
      '"数据库数据不丢" → 挂载数据卷到数据库数据目录',
      '"问题出在配置" → 删掉容器用正确环境变量重建，而不是重启',
    ],
    reflectionQuestions: ['为什么重启 api 治不好这个故障？', '数据库容器为什么要加密码环境变量？'],
    hintLevels: {
      goal: '排查 api 容器不健康的故障，搭建数据库和网络，修复 api，最后启动 web 并验证整个应用可访问。',
      think: '先诊断后修复：从全局状态找可疑容器，从日志里找失败原因（记住 wronghost 这个关键词），修复的核心是让 api 的环境变量指向真实存在的数据库。',
      commandType: '需要诊断类命令（看状态、看日志）、基础设施类命令（建网络、建卷）、多条件启动命令（数据库、API、Web），以及最后的验证命令。',
      syntax: '按顺序套模板：看状态、看日志、建网络、建卷，然后 docker run -d --name db --network <网络> -e <密码> -v <卷>:<数据库数据目录> <镜像>，删掉坏 api 后用 --network 加 -e DB_HOST=<数据库容器名> 和端口映射启动 api，再启动 web，最后用访问命令验证。',
      answer:
        '先 docker ps -a 发现 api 是 unhealthy；docker logs api 看到连接 wronghost 失败的报错（环境变量 DB_HOST=wronghost 是病根）；然后 docker network create webnet 建网络、docker volume create pgdata 建卷；docker run -d --name db --network webnet -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:15 启动数据库（--network webnet 入网、-e 设密码、-v 挂卷防丢数据）；docker stop api 再 docker rm api 删掉坏容器；docker run -d --name api --network webnet -e DB_HOST=db -p 3000:3000 --health-cmd "curl -f http://localhost:3000/health" api-broken 用正确地址重建（DB_HOST=db 指向数据库容器）；docker run -d --name web --network webnet -p 8080:80 web 启动前端；最后 curl http://localhost:8080/ 验证整条链路通。下一步：Docker 课程全部通关，这些命令组合在一起就是生产环境部署的缩影。',
    },
    completion: {
      solved: '你完成了三层应用的排障与部署：诊断 api、搭建数据库、修复环境变量、验证整条链路。',
      clue: '病根在日志里的 wronghost——api 的环境变量指向了不存在的地址，修复方向是重建而不是重启。',
      why: '看状态、看日志、按正确参数重建，诊断和修复的顺序决定了排障效率。',
      reuse: '以后任何"服务不健康"的故障，都按这个顺序：看状态、看日志、查配置、重建。',
      relatedCommand: 'docker events 可以实时观察 Docker 事件流，是更高级的排障工具。',
    },
  },
}
