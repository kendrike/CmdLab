import type { TeachingContent } from './types'

export const LINUX_TEACHING: Record<string, TeachingContent> = {
  'linux-pwd': {
    scenario:
      '你第一次登录一台 Linux 服务器，屏幕上只有一个提示符，你不知道"我是谁"，也不知道"我在哪"。接下来无论创建文件、删除文件，系统都默认作用于"当前用户"和"当前目录"，如果不先确认身份和位置，就可能操作到错误的地方。',
    whyItMatters: '终端里没有图形菜单，一切操作都靠命令。whoami 和 pwd 是命令世界的两把钥匙：一把回答"我是谁"，一把回答"我在哪"，是所有后续操作的安全起点。',
    observationGuide: ['观察提示符（如 student@lab:~$）：student 是当前用户，~ 表示主目录', '确认任务是"查看"类问题，只读不改，执行任何命令都没有风险'],
    reasoningSteps: ['任务关键词是"当前用户"和"当前目录"', '这属于"身份与位置"类问题，需要一条查询身份的命令和一条查询位置的命令', '查询类命令只读不改，可以放心执行'],
    commandSelection: 'whoami 是 who am I 的缩写（我是谁），pwd 是 print working directory 的缩写（打印工作目录），一个回答身份、一个回答位置，正好对应前两步。',
    transferRules: [
      '"我是谁" → whoami',
      '"我在哪里" → pwd',
      '"这里有什么" → ls',
      '"刚才敲过什么" → history',
      '屏幕太乱 → clear',
    ],
    reflectionQuestions: ['为什么"当前用户"和"当前目录"很重要？如果不知道自己在哪就执行 rm a.txt，删的可能是谁的文件？', '提示符上的 ~ 代表什么？'],
    hintLevels: {
      goal: '先弄清楚两件事：当前登录的用户是谁，当前所在的目录在哪。这不需要创建或修改任何东西。',
      think: '任务问的是"身份"和"位置"。看看提示符，再想想有没有命令能回答"我是谁"和"我在哪"。',
      commandType: '需要两条"查看"类命令：一条问当前用户的命令（念出来就是"我是谁"），一条看当前目录的命令（三个字母，意思是"打印工作目录"）。',
      syntax: 'whoami 和 pwd 都直接输入即可，没有任何参数。',
      answer:
        '输入 whoami 并回车，输出 student，说明当前用户是 student；再输入 pwd 并回车，输出 /home/student，说明你正在家目录。看到输出后，对应的步骤会自动勾选，可以继续完成后面的 history 和 clear。',
    },
    completion: {
      solved: '你确认了自己的身份（student）和位置（/home/student），并认识了终端的基本操作。',
      clue: '判断依据是任务里的关键词"当前用户"和"当前目录"，这是身份与位置类问题。',
      why: 'whoami（who am I）回答"我是谁"，pwd（print working directory）回答"我在哪"，都只读不改、没有风险。',
      reuse: '以后每次登录服务器，都先用 whoami 和 pwd 确认身份和位置，再开始干活。',
      relatedCommand: 'ls——查看当前目录里有什么，这是紧接着自然想知道的下一步。',
    },
  },
  'linux-ls': {
    scenario:
      '你想知道自己家里到底存了些什么。家目录里可能有以点开头的隐藏文件，平时就像"隐身"一样看不见；而系统日志目录 /var/log 里还躺着 big.log 这样的大文件，你需要连它的大小也看清。',
    whyItMatters: '不会 ls，你在终端里就像个盲人：文件在哪、有多大、谁有权限一概不知。ls 是照相机，所有"目录里有什么"的问题都靠它回答。',
    observationGuide: ['先执行 ls 看看目录里有哪些名字，注意区分目录和文件', '再执行 ls -a，对比多出了哪些以 . 开头的条目', '执行 ls -l 观察权限、所有者和大小这几列信息'],
    reasoningSteps: ['任务关键词是"查看内容""隐藏文件""详细信息""人类可读大小"', '查看目录内容用 ls，想看全部加 -a，想详细加 -l', '想让大小变成 K/M 这样的单位，还要再加 -h 并与 -l 搭配'],
    commandSelection: 'ls 是 list（列出）的缩写。选项 a 是 all（全部）、l 是 long（长格式）、h 是 human-readable（人类可读），每个字母都有来历。',
    transferRules: [
      '"这里有什么" → ls',
      '"想看隐藏文件" → ls -a',
      '"想看权限和大小" → ls -l',
      '"想让大小变成 K/M" → ls -lh',
      '"看别的目录" → ls 路径，如 ls /var/log',
    ],
    reflectionQuestions: ['ls -a 和 ls -l 可以同时用吗？该怎样写？', 'ls -lh /var/log 里 big.log 的大小显示成了什么格式？'],
    hintLevels: {
      goal: '查看当前目录的内容，再看隐藏文件，最后查看 /var/log 目录并让文件大小以 K/M 为单位显示。',
      think: '任务里出现了"隐藏文件""长格式""人类可读大小"三个关键词，想想同一款查看命令配哪些选项能分别满足。',
      commandType: '需要一条"列出目录内容"的命令，配上"全部""长格式""可读大小"等选项，选项之间可以组合。',
      syntax: 'ls [选项] [目录]——方括号表示可以省略：不加参数看当前目录，ls -a 看隐藏文件，ls -lh /var/log 看指定目录的可读大小。',
      answer:
        '依次执行 ls、ls -a、ls -l、ls -lh /var/log。ls -a 会多出 .bashrc、.profile 两个隐藏文件；ls -l 显示权限、所有者、大小；ls -lh /var/log 中 big.log 的大小显示为 12K 这样的格式。每步执行后对应步骤自动勾选。',
    },
    completion: {
      solved: '你看到了家目录的内容、隐藏文件、文件详情，并让 /var/log 里文件的大小变得一眼可读。',
      clue: '判断依据是关键词"隐藏文件""长格式""人类可读大小"，对应 ls 的 -a、-l、-h 选项。',
      why: 'ls（list）就是列目录，-a 显示全部、-l 显示长格式详情、-h 把大小换算成 K/M。',
      reuse: '任何时候想确认目录里有什么、文件多大、权限如何，都用 ls 配上这几个选项。',
      relatedCommand: 'ls -R——递归列出所有子目录，一次性看清整棵目录树。',
    },
  },
  'linux-cd': {
    scenario:
      '家目录里有一间间"房间"（子目录），你要去 projects 目录里工作，还要去系统日志目录 /var/log 查东西，最后要回到自己的房间。路径就是门牌号，写法不同，走法也不同。',
    whyItMatters: '不会 cd，你就永远被困在同一个目录里，访问不了其他位置的文件。相对路径、绝对路径、.. 和 ~ 这四个概念，会伴随你整个 Linux 生涯。',
    observationGuide: ['cd 后提示符会变化，注意观察当前位置的改变', '对比 cd projects（相对路径）和 cd /var/log（绝对路径）的写法差异', '用 cd .. 后看看自己回到了哪一级'],
    reasoningSteps: ['任务关键词是"进入""返回""回家"，以及"相对路径"和"绝对路径"', '"进入某目录"用 cd 加路径', '以 / 开头的是绝对路径，从当前位置出发的是相对路径，.. 表示上一级，~ 表示家目录'],
    commandSelection: 'cd 是 change directory（切换目录）的缩写。相对路径像"从地铁口走 100 米"，绝对路径像"北京市朝阳区某号"，两种写法都能到达目的地。',
    transferRules: [
      '"进入某目录" → cd 目录名',
      '"返回上一级" → cd ..',
      '"回家" → cd ~（等价于 cd /home/student）',
      '"写全路径" → 以 / 开头，如 cd /var/log',
      '"不确定在哪" → 先 pwd 再 cd',
    ],
    reflectionQuestions: ['cd /var/log 和 cd var/log 有什么区别？为什么前者在任何位置都能成功？', '~ 等价于哪个绝对路径？'],
    hintLevels: {
      goal: '依次去三个地方：家目录下的 projects、系统目录 /var/log，最后回到家目录。',
      think: '任务提到了"相对路径"和"绝对路径"两种写法，还出现了 .. 和 ~ 两个特殊符号，先分清它们各自代表什么。',
      commandType: '需要一条"切换目录"的命令，后面跟目标路径或特殊符号。',
      syntax: 'cd [目录]——cd 后跟目录名进入该目录；.. 是上一级，~ 是家目录的快捷写法；不跟参数直接 cd 也会回家。',
      answer:
        'cd projects 用相对路径进入家目录下的 projects；cd /var/log 用绝对路径（以 / 开头）进入系统日志目录；cd .. 返回上一级；cd ~ 回到家目录，用 pwd 验证会显示 /home/student。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你学会了在目录树中穿梭：进入 projects、跳到 /var/log、返回上一级、回到主目录。',
      clue: '判断依据是任务里的关键词"进入""返回""回家"，以及相对路径和绝对路径的区分。',
      why: 'cd（change directory）负责切换目录，配合相对路径、绝对路径、.. 和 ~ 四种写法，就能到达任何位置。',
      reuse: '以后任何"去某个目录干活"的需求，都用 cd 加对应路径；不确定时用 pwd 确认。',
      relatedCommand: 'pwd——随时确认自己当前在哪个目录，防止 cd 后迷路。',
    },
  },
  'linux-touch-mkdir': {
    scenario:
      '你要开始一个新项目，需要先搭好工作空间：一个 work 目录，里面再建 projects/web 两层结构，还要放 notes.txt 和 app.js 两个文件。在 Linux 里没有"右键新建文件夹"，一切都要靠命令。',
    whyItMatters: '没有目录和文件，后面所有练习都无处安放。mkdir 和 touch 是最常用的两个创建命令，搭项目、建日志目录、初始化配置全靠它们。',
    observationGuide: ['执行 mkdir 后用 ls 确认新目录出现', '对比 mkdir work/projects/web 和 mkdir -p work/projects/web 的差别', 'touch 一个文件后，ls 里能看到它'],
    reasoningSteps: ['任务关键词是"创建目录""多级目录""创建文件"', '创建目录用 mkdir（make directory）', '一次创建多级目录要加 -p（parents），否则中间目录不存在会报错', '创建空文件用 touch'],
    commandSelection: 'mkdir 是 make directory 的缩写；touch 原意是"轻触"——轻触一下不存在的文件，文件就诞生了，已存在的文件则只刷新时间戳。',
    transferRules: [
      '"建目录" → mkdir 名字',
      '"一次建多级目录" → mkdir -p a/b/c',
      '"建空文件" → touch 名字',
      '"建完想看看结果" → ls',
      '"想验证整个结构" → ls -R',
    ],
    reflectionQuestions: ['为什么 mkdir work/projects/web 会报 No such file or directory，而加 -p 就好了？', 'touch 一个已存在的文件会发生什么？'],
    hintLevels: {
      goal: '创建一套项目结构：work 目录、work 下的 projects/web 多级目录，以及 notes.txt 和 app.js 两个文件。',
      think: '任务是"建目录"和"建文件"两类动作；注意多级目录需要特殊选项，否则中间目录不存在会直接报错。',
      commandType: '两条命令：一条"创建目录"的命令（多级目录要加选项），一条"创建文件"的命令。',
      syntax: 'mkdir [选项] 目录名；touch 文件名——mkdir 的 -p 选项能自动补齐所有中间目录。',
      answer:
        'mkdir work 创建第一个目录；mkdir -p work/projects/web 一次建好两层；touch work/notes.txt 创建笔记文件；touch work/projects/web/app.js 创建应用文件。用 ls work/projects/web 能看到 app.js，验证创建成功。',
    },
    completion: {
      solved: '你创建了 work 目录、work/projects/web 多级目录，以及 notes.txt 和 app.js 两个文件。',
      clue: '判断依据是任务关键词"创建目录""多级""创建文件"。',
      why: 'mkdir（make directory）建目录，-p 自动补齐中间层；touch 轻触一下就能创建空文件。',
      reuse: '每次要搭建项目目录结构时，mkdir -p 加 touch 一整套就够用。',
      relatedCommand: 'ls -R——递归列出目录树，可以一次性验证你创建的结构。',
    },
  },
  'linux-cp-mv': {
    scenario:
      '你手上有一份重要文档 readme.md，想复印一份备份；projects 目录里还有一堆文件，需要整目录复制一份；另外想把 todo.txt 从 projects 搬到家目录，再给它换个名字。',
    whyItMatters: '数据只有一份时，一次误删就全没了。cp 让你随时能"复印"出备份；mv 既是搬运工又是改名工具，这两招是文件管理的日常核心。',
    observationGuide: ['复制文件后 ls 应同时看到 readme.md 和 readme-copy.md', '复制目录时不加 -r 会报 omitting directory', 'mv 之后，源位置的文件会消失'],
    reasoningSteps: ['任务关键词是"复制""备份""移动""重命名"', '复制文件用 cp，复制目录必须加 -r（recursive）', '移动和重命名都用 mv；同一个目录内 mv a.txt b.txt 就是改名'],
    commandSelection: 'cp 是 copy 的缩写，mv 是 move 的缩写。mv 像搬家：搬到同一个小区（同一目录）换门牌号就是重命名，所以移动和改名是同一个命令。',
    transferRules: [
      '"复制文件" → cp 源 目标',
      '"复制整个目录" → cp -r 源 目标',
      '"移动文件" → mv 源 目标',
      '"重命名" → mv 旧名 新名',
      '"备份后验证" → ls -R 目标目录',
    ],
    reflectionQuestions: ['为什么 cp projects projects-backup 会报 omitting directory？', 'mv a.txt b.txt 和 cp a.txt b.txt 执行后，a.txt 还在吗？'],
    hintLevels: {
      goal: '把 readme.md 复制成副本，把整个 projects 目录复制成 projects-backup，再把 todo.txt 移到 home 目录并改名为 todo-final.txt。',
      think: '任务区分"复制"和"移动"两类动作；复制目录时系统会抱怨"内容太多"，需要一个"递归"选项。',
      commandType: '两条命令：一条"复制"命令，一条"移动"命令；复制目录时都要配上"递归"选项。',
      syntax: 'cp [选项] 源 目标；mv 源 目标——复制目录要加 -r，如 cp -r projects projects-backup。',
      answer:
        'cp readme.md readme-copy.md 复制文件；cp -r projects projects-backup 整目录复制；mv projects/todo.txt todo.txt 把文件从 projects 搬到家目录；mv todo.txt todo-final.txt 改名。用 ls -R projects-backup 能看到 src/main.py，验证复制成功。',
    },
    completion: {
      solved: '你复制了 readme.md 和整个 projects 目录，并把 todo.txt 移到家目录、改名为 todo-final.txt。',
      clue: '判断依据是关键词"复制""备份""移动""重命名"。',
      why: 'cp（copy）负责复制，目录要加 -r；mv（move）负责移动，同目录内改名只是移动的特殊情况。',
      reuse: '做备份、整理文件、给文件改名字时，cp 和 mv 就是全部答案。',
      relatedCommand: 'rm——清理不需要的文件，和 cp、mv 一起构成文件管理的完整动作。',
    },
  },
  'linux-rm': {
    scenario:
      '家目录里攒了一批没用的东西：一个临时文件 scratch.txt 和整个 trash 目录，里面还装着两个 junk 文件。你要把它们全部清掉，最后还要体验"文件不存在也不报错"的强制模式。',
    whyItMatters: '删除是唯一没有"后悔药"的操作——Linux 没有回收站。学会安全删除（先确认再 rm，目录要加 -r），比学会了再误删强一百倍。',
    observationGuide: ['直接 rm trash 会报 Is a directory，因为它是目录不是文件', 'rm -r trash 连目录带里面的文件一起消失', 'rm -f 对不存在的文件不报错、不询问'],
    reasoningSteps: ['任务关键词是"删除""目录""强制"', '删除文件用 rm（remove）', '删除目录必须加 -r（recursive）', '-f（force）表示强制，文件不存在也不报错'],
    commandSelection: 'rm 是 remove 的缩写，含义直白：移除。r 是 recursive（递归），f 是 force（强制），两个选项正好解决"删目录"和"不报错"两个需求。',
    transferRules: [
      '"删文件" → rm 文件名',
      '"删目录" → rm -r 目录名',
      '"文件不存在也不想看报错" → rm -f',
      '"删除前想确认目标" → 先 ls 看一眼',
      '"删除不可恢复" → 动手前想清楚再回车',
    ],
    reflectionQuestions: ['为什么直接 rm trash 会报 Is a directory？', 'rm -f ghost.txt 和 rm ghost.txt 有什么不同？'],
    hintLevels: {
      goal: '依次删除 scratch.txt、trash 目录里的 junk1.txt、整个 trash 目录，最后用强制模式删除一个不存在的文件且不报错。',
      think: '注意删除的对象有文件也有目录，目录必须配"递归"选项；任务还提到"不存在的文件也不报错"这个关键词。',
      commandType: '一条"删除"命令，分别配合"递归"和"强制"两个选项完成全部任务。',
      syntax: 'rm [选项] 目标——删目录加 -r，不想看到报错加 -f，如 rm -f 不存在的文件名。',
      answer:
        'rm scratch.txt 删掉临时文件；rm trash/junk1.txt 删目录里的单个文件；rm -r trash 连目录带内容一起删；rm -f ghost.txt 删除不存在的文件也不报错。全部执行后步骤自动完成。',
    },
    completion: {
      solved: '你删除了 scratch.txt、trash 目录里的 junk1.txt、整个 trash 目录，并用 rm -f 删了一个不存在的文件而没有报错。',
      clue: '判断依据是关键词"删除""目录""不报错"。',
      why: 'rm（remove）删除文件，-r 递归删除目录，-f 强制且安静。',
      reuse: '清理临时文件、移除废弃目录时使用；删除前养成先 ls 确认的习惯。',
      relatedCommand: 'mv——把不删的文件先移到备份目录，删除前多一层保险。',
    },
  },
  'linux-archive': {
    scenario:
      '你要把 backup 目录整个带走或备份：先单独压缩 file1.txt 看看 gzip 的效果，再把它恢复原样；然后把整个目录打包成一个文件 backup.tar.gz，最后解包到新建的 restore 目录里验证内容完整。',
    whyItMatters: '传输或备份多个文件时，一个包比一堆散文件方便得多。gzip 管单个文件、tar 管整个目录，这是所有服务器资料备份的基础技能。',
    observationGuide: ['gzip 后原文件消失、出现 .gz 文件，这是正常现象', 'tar -czf 后生成 backup.tar.gz 一个文件', '解包后 restore/backup 目录里应有原来的内容'],
    reasoningSteps: ['任务关键词是"压缩单个文件""打包目录""解压恢复"', '单个文件用 gzip，恢复用 gunzip', '多个文件或目录用 tar 打包：-c 创建、-z gzip 压缩、-f 指定包名', '解包用 -x，-C 指定目标目录'],
    commandSelection: 'gzip 是 GNU zip，只处理单个文件；tar 是 tape archive（磁带归档）的缩写，把一堆文件装进一个包，两者常组合使用。',
    transferRules: [
      '"压缩单个文件" → gzip 文件',
      '"恢复被压缩的文件" → gunzip 文件.gz',
      '"打包整个目录" → tar -czf 包名.tar.gz 目录',
      '"查看包内清单" → tar -tf 包名',
      '"解包到指定目录" → tar -xf 包名 -C 目录',
    ],
    reflectionQuestions: ['gzip 之后为什么原文件不见了？要怎样才能保留？', 'tar -czf 里的 z 代表什么？'],
    hintLevels: {
      goal: '先压缩 backup 里的 file1.txt 再恢复它，然后把整个 backup 目录打包成 backup.tar.gz，解包到新建的 restore 目录并确认内容。',
      think: '任务区分"单个文件"和"整个目录"两类对象：单个文件用一种压缩命令，目录要交给"打包"命令；解包前要先建好目标目录。',
      commandType: '两个工具：一个处理"单个文件"的压缩命令（恢复版以 gu 开头），一个负责"打包目录"的命令（选项里有 c、x、f、C）。',
      syntax: 'gzip 文件名；gunzip 文件.gz；tar -czf 包名.tar.gz 目录；tar -xf 包名 -C 目录。',
      answer:
        'gzip backup/file1.txt 生成 file1.txt.gz；gunzip backup/file1.txt.gz 恢复 file1.txt；tar -czf backup.tar.gz backup 打包整个目录；mkdir restore 建目标目录；tar -xf backup.tar.gz -C restore 解包，再 ls -R restore 看到 restore/backup/file1.txt 等内容即成功。',
    },
    completion: {
      solved: '你用 gzip 压缩又恢复了 file1.txt，把 backup 目录打包成 backup.tar.gz，并解包到 restore 目录验证成功。',
      clue: '判断依据是关键词"压缩单个文件""打包目录""解压恢复"。',
      why: 'gzip 压缩单个文件，tar 打包整个目录，-czf 一键打包加压缩，-xf 解包。',
      reuse: '备份、传输、归档任何目录时，tar -czf 加 tar -xf 是最常用的组合。',
      relatedCommand: 'tar -tf——不解包就能查看归档包里的文件清单。',
    },
  },
  'linux-text-view': {
    scenario:
      '服务器上的应用出问题了，日志文件 /var/log/app.log 记录了 INFO、WARN、ERROR 等消息，共 16 行。你要快速看全部内容、看开头几行、看末尾几行，还要用"直播模式"盯着新日志。',
    whyItMatters: '排障全靠日志。cat 看小文件、head 看开头、tail 看末尾、tail -f 盯实时日志——不会这些，系统报错时你只能干瞪眼。',
    observationGuide: ['cat 一口气输出全部 16 行', 'head -5 只显示前 5 行', 'tail -5 只显示末尾 5 行', 'tail -f 之后新写入的行会持续刷出来（本模拟器显示说明文字）'],
    reasoningSteps: ['任务关键词是"全部内容""前几行""末尾""持续跟随"', '全部内容用 cat（concatenate）', '开头用 head，末尾用 tail', '跟随模式是 tail 的 -f（follow）选项'],
    commandSelection: 'cat 是 concatenate（连接）的缩写，能把整个文件打印出来；head 和 tail 字面意思就是"头"和"尾"，一个看开头一个看结尾。',
    transferRules: [
      '"看整个文件" → cat 文件',
      '"只看开头 N 行" → head -N 文件',
      '"只看末尾 N 行" → tail -N 文件',
      '"实时盯日志" → tail -f 文件',
      '"先确认文件在哪" → ls /var/log',
    ],
    reflectionQuestions: ['为什么 cat 不适合看几万行的大文件？', 'tail -f 在真实系统里用什么快捷键退出？'],
    hintLevels: {
      goal: '用四种方式查看 /var/log/app.log：全部内容、前 5 行、末尾 5 行、持续跟随模式。',
      think: '任务问的是"怎么看文件"，注意文件不在家目录，先确认路径；四个动作分别是"全部、开头、末尾、跟随"。',
      commandType: '三条"查看文件内容"的命令：分别管全部、开头、末尾；"跟随"是末尾那条命令的一个选项。',
      syntax: 'cat 文件；head -N 文件；tail -N 文件；tail -f 文件——N 换成数字，-f 表示跟随。',
      answer:
        'cat /var/log/app.log 显示全部 16 行；head -5 /var/log/app.log 显示前 5 行；tail -5 /var/log/app.log 显示末尾 5 行；tail -f /var/log/app.log 进入跟随模式，模拟器会显示说明文字（真实系统按 Ctrl+C 退出）。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你用 cat、head、tail、tail -f 四种方式查看了 /var/log/app.log 的全部、前 5 行、末尾 5 行和实时日志。',
      clue: '判断依据是关键词"全部内容""前几行""末尾""跟随"。',
      why: 'cat 打印整个文件，head 取头、tail 取尾，tail -f 持续跟随新日志。',
      reuse: '看配置文件、日志开头、最新日志时，head 和 tail 随手就用；盯实时日志用 tail -f。',
      relatedCommand: 'grep——在日志里筛选特定关键词，比如只看 ERROR。',
    },
  },
  'linux-redirect': {
    scenario:
      '终端每次执行命令，输出都直接打在屏幕上，一闪而过。你想把命令结果保存成文件：先写入 hello，再追加一行 world，还要把错误信息单独存进 error.txt。',
    whyItMatters: '真实工作中日志、报表都要落盘保存，不可能靠眼睛抄。> 和 >> 是把输出变成文件的日常手段，2> 则能单独捕获报错，排障时全靠它。',
    observationGuide: ['echo hello > output.txt 后，cat output.txt 能看到 hello', '再 >> 追加一行后文件变成两行', 'ls 一个不存在的目录时，错误信息走 stderr，要用 2> 才能接住'],
    reasoningSteps: ['任务关键词是"写入文件""追加""错误信息"', '> 是覆盖写入，>> 是追加写入', '命令有 stdout 和 stderr 两个输出管道，2> 专门接 stderr 的错误信息'],
    commandSelection: '这里的 >、>>、2> 不是命令，而是"重定向符号"，把输出改道。2 指 stderr 这个管道编号（1 是 stdout），所以错误要用 2>。',
    transferRules: [
      '"输出保存成文件（覆盖）" → 命令 > 文件',
      '"输出追加到文件末尾" → 命令 >> 文件',
      '"只想存错误信息" → 命令 2> 文件',
      '"验证文件内容" → cat 文件',
      '"制造一条错误信息" → ls 一个不存在的目录',
    ],
    reflectionQuestions: ['为什么 echo hello 2> error.txt 存不进内容？', '> 和 >> 有什么本质区别？'],
    hintLevels: {
      goal: '把 hello 写进 output.txt，再追加一行变成两行；再把两条错误信息分别用"覆盖"和"追加"的方式存进 error.txt。',
      think: '任务在讲"输出改道"：一个方向是正常输出，另一个方向是错误输出；接错误信息的符号和接正常输出的符号不一样。',
      commandType: '不需要新命令，用三个重定向符号：一个覆盖写入、一个追加写入、一个专门接错误。',
      syntax: '命令 > 文件（覆盖）；命令 >> 文件（追加）；命令 2> 文件（错误）——符号两边分别是命令和文件路径。',
      answer:
        'echo hello > output.txt 创建文件并写入 hello；echo world >> output.txt 追加第二行；ls /nonexistent 2> error.txt 把第一条错误存进文件；cat /nonexistent 2>> error.txt 追加第二条；最后 cat error.txt 能看到两行错误信息。',
    },
    completion: {
      solved: '你把 echo 的输出保存进了 output.txt 并追加成两行，还把错误命令的输出分别用覆盖和追加的方式存进了 error.txt。',
      clue: '判断依据是关键词"写入""追加""错误输出"。',
      why: '> 覆盖写入、>> 追加写入、2> 专门捕获 stderr 错误输出，三条符号分管三种情况。',
      reuse: '任何需要把命令结果落盘保存的场景——日志、报表、临时文件——都用重定向。',
      relatedCommand: '管道 |——把命令输出直接传给下一个命令，是重定向的姊妹技巧。',
    },
  },
  'linux-pipe': {
    scenario:
      '应用日志 /var/log/app.log 里既有 INFO 也有 ERROR，你要数一数 ERROR 有多少行、INFO 有多少行，还要取出前 3 行。每一步都像工厂流水线：上一道工序的输出直接传给下一道。',
    whyItMatters: '单一命令能力有限，管道 | 让命令像积木一样自由组合。这是 Linux 最强大的设计思想，学会后"统计、过滤、截取"一条命令搞定。',
    observationGuide: ['管道符号 | 把左边命令的输出接到右边命令的输入', 'grep ERROR 筛选出含 ERROR 的行', 'wc -l 数行数', 'head -3 取前 3 行'],
    reasoningSteps: ['任务关键词是"统计行数""筛选""组合"', '筛选用 grep，计数用 wc -l（word count）', '用 | 把查看、筛选、计数三段连成一条流水线', '管道末尾也可以挂 head/tail 做截取'],
    commandSelection: '| 是管道（pipe）符号，像流水线传送带；grep 负责挑行，wc -l 负责数数，cat 负责把文件内容送出来。',
    transferRules: [
      '"统计匹配的行数" → cat 文件 | grep 关键词 | wc -l',
      '"只取前几行" → 命令 | head -N',
      '"筛选加统计组合" → 中间用 | 连接',
      '"单独看匹配行" → grep 关键词 文件',
      '"管道写错时" → 分段执行排查哪一段出问题',
    ],
    reflectionQuestions: ['为什么 wc -l /var/log/app.log 回答不了"ERROR 有几行"？', '管道里命令的顺序可以随便换吗？'],
    hintLevels: {
      goal: '统计 app.log 中 ERROR 的行数、INFO 的行数，再取出前 3 行，都要用"流水线"式写法。',
      think: '任务包含两个动作："筛选"和"计数"；注意把它们用符号连成一条命令，而不是分开执行。',
      commandType: '用"管道符号"把三条命令连成一条流水线：查看文件、筛选关键词、数行数。',
      syntax: 'cat 文件 | grep 关键词 | wc -l——竖线 | 就是管道；取前 3 行时把最后一段换成 head -3。',
      answer:
        'cat /var/log/app.log | grep ERROR | wc -l 输出一个数字，即 ERROR 的行数；把 ERROR 换成 INFO 得到另一个数字；cat /var/log/app.log | head -3 显示前 3 行。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你用管道统计了 app.log 中 ERROR 和 INFO 的行数，并取出了前 3 行。',
      clue: '判断依据是关键词"统计行数""筛选""组合"。',
      why: '管道 | 把 cat 的输出传给 grep 筛选、再传给 wc -l 计数，像流水线一样一次完成。',
      reuse: '任何"先筛选再统计""先输出再截取"的组合需求，都用管道串联。',
      relatedCommand: 'sort | uniq -c——排序后统计重复次数，是管道的经典组合。',
    },
  },
  'linux-grep': {
    scenario:
      '日志 /var/log/app.log 里有 ERROR、INFO、WARN 各种行。你要带行号找到 ERROR，忽略大小写再搜一次，统计 ERROR 有几行，还要反着来——找出所有不含 INFO 的行。',
    whyItMatters: '日志动辄几百上千行，肉眼扫不现实。grep 是在文件里找关键词的核心工具，配合 -n、-i、-c、-v 四种参数能应付绝大多数检索需求。',
    observationGuide: ['-n 输出的每行前面带行号', '-i 让 ERROR、error、Error 都能匹配上', '-c 只输出一个数字（匹配行数）', '-v 输出的是所有不包含关键词的行'],
    reasoningSteps: ['任务关键词是"行号""忽略大小写""统计""排除"', 'grep 的格式是：grep 选项 关键词 文件', '四个选项各管一件事：-n 行号、-i 忽略大小写、-c 计数、-v 反向'],
    commandSelection: 'grep 原意是 global regular expression print（全局正则匹配打印），简单理解就是"在文件里找关键词"；参数字母分别是 number、ignore case、count、invert 的首字母。',
    transferRules: [
      '"找关键词" → grep 关键词 文件',
      '"顺便要行号" → grep -n',
      '"不区分大小写" → grep -i',
      '"只数几行" → grep -c',
      '"排除某关键词" → grep -v',
    ],
    reflectionQuestions: ['grep ERROR 和 grep -i error 的结果有什么不同？', 'grep -c ERROR 和 wc -l 的区别是什么？'],
    hintLevels: {
      goal: '用四种参数在 app.log 中搜索：带行号的 ERROR、忽略大小写的 error、只统计行数的 ERROR、排除 INFO 的行。',
      think: '任务是同一个命令的四种"变体"；注意"忽略大小写"和"排除"这两个关键词对应的选项。',
      commandType: '一条"在文件里搜索关键词"的命令，配四个不同的选项。',
      syntax: 'grep 选项 关键词 文件——顺序是选项在前、关键词居中、文件最后，如 grep -n ERROR /var/log/app.log。',
      answer:
        'grep -n ERROR /var/log/app.log 每行前带行号；grep -i error /var/log/app.log 大小写都能匹配；grep -c ERROR /var/log/app.log 只输出一个数字；grep -v INFO /var/log/app.log 输出所有不含 INFO 的行。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你用 grep 的 -n、-i、-c、-v 四个参数，分别实现了带行号、忽略大小写、计数和排除关键词的搜索。',
      clue: '判断依据是关键词"行号""忽略大小写""统计""排除"。',
      why: 'grep 在文件里按关键词逐行筛选，四个选项对应四种常见检索需求。',
      reuse: '在日志、配置、代码里找任何内容时，grep 配上这几个参数几乎够用。',
      relatedCommand: 'grep -r——递归搜索整个目录下的所有文件。',
    },
  },
  'linux-find': {
    scenario:
      '家目录里的文件散落在 projects、data、backup、logs 等好几个子目录里，你记不清 .txt 文件都放在哪了；系统日志目录 /var/log 里，你又想知道哪些是普通文件、哪些是目录。',
    whyItMatters: '文件多了以后，"还记得在哪"靠不住。find 从指定起点自动往下找，比一层层 cd 加 ls 高效得多，也是运维日常必用。',
    observationGuide: ['find 的格式是"起始目录加条件"', '-name 模式里的 * 表示任意字符，建议加引号', '-type f 只列普通文件，-type d 只列目录'],
    reasoningSteps: ['任务关键词是"查找""按名称""文件类型"', '按名称查找用 -name，普通文件用 -type f（file），目录用 -type d（directory）', '起点写 . 表示当前目录，也可以写 /var/log 这样的具体路径'],
    commandSelection: 'find 字面意思就是"找到"，和 grep（找文件里的内容）分工不同：find 找的是文件本身。',
    transferRules: [
      '"按名字找文件" → find . -name "*.txt"',
      '"只找普通文件" → find 路径 -type f',
      '"只找目录" → find 路径 -type d',
      '"模式带 * 要加引号" → "*.txt"',
      '"从哪开始找" → 起点写 . 或具体路径如 /var/log',
    ],
    reflectionQuestions: ['为什么 -name 的模式要加引号？', 'find / -name "*.txt" 为什么不推荐？'],
    hintLevels: {
      goal: '在家目录找所有 .txt 文件，在 /var/log 找所有普通文件，再找当前目录下所有目录。',
      think: '任务区分"按名称"和"按类型"两种找法；类型又分"文件"和"目录"，注意两种写法。',
      commandType: '一条"搜索文件"的命令，格式是"起始路径加条件选项"。',
      syntax: 'find 起始路径 条件——如 find . -name "*.txt"，-type f 找文件、-type d 找目录。',
      answer:
        'find . -name "*.txt" 从当前目录往下列出所有 .txt 文件；find /var/log -type f 列出 /var/log 下所有普通文件；find . -type d 列出当前目录下所有目录。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你用 find 找到了家目录所有 .txt 文件、/var/log 下所有普通文件，以及当前目录下所有目录。',
      clue: '判断依据是关键词"按名称""普通文件""目录"。',
      why: 'find 从起始目录开始递归搜索，-name 按名字、-type f/d 按类型。',
      reuse: '文件多了记不清位置时，find 一条命令就替你翻遍整个目录树。',
      relatedCommand: 'grep——find 找文件本身，grep 找文件里的内容，两者互补。',
    },
  },
  'linux-text-tools': {
    scenario:
      '你拿到三份数据文件：data/names.txt 里名字有重复、data/scores.txt 是 CSV 表格、data/ip.txt 是 IP 列表。你要统计行数、统计每个名字出现几次、把 IP 按数值排序、取出分数列。',
    whyItMatters: '日志分析、报表统计都是这些工具的看家本领。wc、sort、uniq、cut 四件套能完成"数、排、去重、取列"四大基础数据加工。',
    observationGuide: ['uniq 只去相邻的重复行，所以要先 sort 再 uniq 才去得干净', 'sort 默认按字典序，10 会排在 2 前面，IP 排序要加 -n', 'cut 用 -d 指定分隔符、-f 指定列号'],
    reasoningSteps: ['任务关键词是"行数""排序""重复次数""取列"', '行数用 wc -l', '去重计数用 sort 加 uniq -c 的组合', '取列用 cut -d 分隔符 -f 列号'],
    commandSelection: 'wc 是 word count（字数统计），sort 是排序，uniq 是 unique（唯一），cut 是"切"——每个名字都直白地描述了动作。',
    transferRules: [
      '"数行数" → wc -l 文件',
      '"排序" → sort 文件',
      '"按数值排序" → sort -n 文件',
      '"统计重复次数" → sort 文件 | uniq -c',
      '"取 CSV 第 N 列" → cut -d "," -f N 文件',
    ],
    reflectionQuestions: ['为什么 uniq 之前必须先 sort？', 'sort 和 sort -n 对 IP 列表的排序结果差在哪？'],
    hintLevels: {
      goal: '统计 names.txt 的行数、统计每个名字出现的次数、把 ip.txt 按数值排序、从 scores.txt 里取出第 2 列（分数）。',
      think: '任务是"数、排、去重计数、取列"四类加工；注意去重要先排序才有效，取列要告诉命令用什么分隔符。',
      commandType: '四条文本加工命令：数行数、排序、去重统计、切列。',
      syntax: 'wc -l 文件；sort 文件；sort 文件 | uniq -c；cut -d "," -f 2 文件。',
      answer:
        'wc -l data/names.txt 输出总行数；sort data/names.txt | uniq -c 输出每个名字和出现次数；sort -n data/ip.txt 按数值排序；cut -d "," -f 2 data/scores.txt 输出第 2 列（分数）。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你统计了 names.txt 的行数、用 sort 加 uniq -c 得到每个名字的次数、把 ip.txt 按数值排序，并用 cut 取出了 scores.txt 的分数列。',
      clue: '判断依据是关键词"行数""排序""重复次数""取列"。',
      why: 'wc 数行、sort 排序（-n 按数值）、uniq -c 去重计数、cut -d -f 按分隔符取列，四件套各司其职。',
      reuse: '分析日志统计量、清洗数据表、生成报表时，这四件套是最常用的加工工具。',
      relatedCommand: 'awk——更强的文本处理工具，能按条件做计算。',
    },
  },
  'linux-chmod': {
    scenario:
      '家目录里有一份私密文件 secrets.txt，任何用户都能读；scripts/run.sh 是个脚本但还不能执行；shared.txt 的组还是 root 的。你要把私密文件收紧、给脚本执行权限、把组改成自己。',
    whyItMatters: '权限就是文件系统的"门禁"。权限设错，要么机密泄露，要么程序跑不起来。chmod 和 chown 是所有系统管理的基础。',
    observationGuide: ['ls -l 第一列 rwx 三组字符分别表示自己、组、其他人的权限', 'r=4、w=2、x=1，相加得到数字权限', 'chown 冒号前留空表示只改组'],
    reasoningSteps: ['任务关键词是"仅自己可读写""执行权限""修改组"', '数字权限 600 表示 rw-------（仅自己可读写）', '符号方式 chmod +x 加执行权限', 'chown :student 只改组的写法'],
    commandSelection: 'chmod 是 change mode（修改权限模式）的缩写，chown 是 change owner（修改属主）的缩写。rwx 分别代表读、写、执行，4+2+1 拼出数字。',
    transferRules: [
      '"只自己可读写" → chmod 600 文件',
      '"加执行权限" → chmod +x 文件',
      '"只改组" → chown :组名 文件',
      '"查看权限" → ls -l 文件',
      '"数字换算" → r=4、w=2、x=1，相加',
    ],
    reflectionQuestions: ['600 这个数字是怎么从 rwx 换算出来的？', '为什么普通用户不能用 chown student:student shared.txt 改所有者？'],
    hintLevels: {
      goal: '把 secrets.txt 改成仅自己可读写，给 scripts/run.sh 加执行权限，把 shared.txt 的组改成 student，最后验证。',
      think: '任务是两类操作："改权限位"和"改属主组"；注意数字权限与 rwx 字母的对应，改组的写法里冒号前要留空。',
      commandType: '两条命令：一条"修改权限"的命令（支持数字和 +x 两种写法），一条"修改属主组"的命令。',
      syntax: 'chmod 权限 文件；chown :组名 文件——权限可写 600 这样的数字，也可写 +x 这样的符号。',
      answer:
        'chmod 600 secrets.txt 把权限改为 rw-------（仅自己可读写）；chmod +x scripts/run.sh 给脚本加执行权限；chown :student shared.txt 把组改成 student；最后 ls -l 验证：secrets.txt 是 -rw-------，run.sh 带 x，shared.txt 组为 student。',
    },
    completion: {
      solved: '你把 secrets.txt 收紧为 600（仅自己可读写）、给 run.sh 加了执行权限、把 shared.txt 的组改成了 student。',
      clue: '判断依据是关键词"仅自己可读写""执行权限""修改组"。',
      why: 'chmod 用数字或符号修改权限位，chown 修改属主和组，冒号前留空只改组。',
      reuse: '保护私密文件、给脚本加执行权限、修正文件所属组时使用。',
      relatedCommand: 'ls -l——任何权限操作后用长格式确认结果。',
    },
  },
  'linux-env': {
    scenario:
      '你发现程序行为会受到一些"全局便签"的影响：比如 PATH 决定命令去哪里找。这节课你要看看自己的身份（id）、列出所有便签（env）、自己写一张便签（export）再读出来（echo 加 $）。',
    whyItMatters: '环境变量是系统和程序沟通的公共黑板。不懂 id 你可能连自己是谁都搞不清，不懂 export 就无法向程序传配置；PATH 出问题则命令直接"找不到"。',
    observationGuide: ['id 输出 uid、gid 和所属组', 'env 输出一长串 KEY=value 格式的变量', 'echo $MY_VAR 必须带 $ 才能读到值', 'PATH 的值用 : 分隔多个目录'],
    reasoningSteps: ['任务关键词是"用户身份""环境变量""定义变量""读取"', '身份用 id，列出环境变量用 env', '定义并导出用 export 名=值', '读取变量必须加 $，否则只是普通文字'],
    commandSelection: 'id 就是"身份（identity）"，env 是 environment（环境）的缩写，export 表示"导出"到环境，$ 是 shell 里"取变量值"的符号。',
    transferRules: [
      '"我是谁" → id',
      '"列出所有环境变量" → env',
      '"定义变量" → export 名=值',
      '"读取变量" → echo $名（$ 不能少）',
      '"看命令搜索路径" → echo $PATH',
    ],
    reflectionQuestions: ['echo MY_VAR 和 echo $MY_VAR 输出有什么不同？为什么？', 'PATH 里的多个目录用什么符号分隔？'],
    hintLevels: {
      goal: '查看当前用户身份、列出所有环境变量、定义自己的变量并读出来、再查看 PATH 变量的值。',
      think: '任务分"查看"和"定义"两类；注意"读取变量"时必须加一个特殊符号，否则读到的只是普通文字。',
      commandType: '三条命令：查看身份的、列出环境变量的、定义变量的（配合 echo 读取）。',
      syntax: 'id；env；export 名字=值；echo $名字——变量名前面必须加 $ 才是取值。',
      answer:
        'id 输出 uid=1000(student) 和所属组；env 列出所有环境变量；export MY_VAR=hello 定义变量后 echo $MY_VAR 输出 hello；echo $PATH 显示命令搜索路径（多个目录用 : 分隔）。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你查看了用户身份、列出了环境变量、定义了 MY_VAR 并用 echo $MY_VAR 读出来，还查看了 PATH。',
      clue: '判断依据是关键词"身份""环境变量""定义""读取"。',
      why: 'id 查身份，env 列环境变量，export 定义并导出，echo $变量 读取（$ 是取值的钥匙）。',
      reuse: '程序要配置、命令找不到、想确认当前用户时，这三条命令随时可用。',
      relatedCommand: 'unset——删除一个环境变量，和 export 配套。',
    },
  },
  'linux-procs': {
    scenario:
      '系统里跑着一个多余的 sleep 3600 后台进程，白白占着资源。你要先看进程列表找到它的"工号"（PID），再用结束指令让它下班，最后确认它已经消失。',
    whyItMatters: '服务器卡顿、程序卡死都要靠进程管理处理。不会 ps 就找不到目标，不会 kill 就无法止损；每个进程的 PID 就像工号，命令只认号码。',
    observationGuide: ['ps 列出 PID 和 CMD 两列关键信息', 'sleep 3600 这个进程的 PID 是 2345', 'kill 后面跟的是数字 PID 而不是进程名', 'kill 之后再次 ps，进程应消失'],
    reasoningSteps: ['任务关键词是"进程列表""动态视图""结束进程"', '列表用 ps，动态视图用 top', '结束进程用 kill，参数是数字 PID', '完成后用 ps 验证进程已消失'],
    commandSelection: 'ps 是 process status（进程状态）的缩写；kill 字面意思是"杀死"，实则是向进程发送终止信号，让进程有序退出。',
    transferRules: [
      '"看进程列表" → ps',
      '"实时视图" → top',
      '"结束进程" → kill PID（数字编号）',
      '"先找到 PID" → 在 ps 的 PID 列里找',
      '"验证已结束" → 再执行一次 ps',
    ],
    reflectionQuestions: ['为什么 kill sleep 会失败而 kill 2345 可以？', 'PID 和进程名是一回事吗？'],
    hintLevels: {
      goal: '查看进程列表、看动态视图、结束 sleep 3600 进程（PID 是 2345）、再确认它已消失。',
      think: '注意任务提到"编号"——结束进程认的是编号不是名字；编号在列表的哪一列，先看清楚。',
      commandType: '三条命令：列进程的、显示动态视图的、向指定编号发结束信号的。',
      syntax: 'ps；top；kill PID——PID 换成数字，如 kill 2345。',
      answer:
        'ps 看到进程列表，其中 sleep 3600 的 PID 是 2345；top 显示动态视图；kill 2345 结束该进程；再次 ps 确认 sleep 已不在列表中。每步执行后对应步骤勾选。',
    },
    completion: {
      solved: '你查看了进程列表和动态视图，用 kill 结束了 PID 2345（sleep 3600），并确认它已消失。',
      clue: '判断依据是关键词"进程列表""结束进程""PID"。',
      why: 'ps 给进程拍照，top 显示动态视图，kill 按 PID 发送结束信号。',
      reuse: '程序卡死、进程占用资源、需要清理后台任务时，ps 找编号、kill 按编号结束。',
      relatedCommand: 'ps aux——带 aux 参数能看到所有用户的全部进程详情。',
    },
  },
  'linux-network': {
    scenario:
      '你接到一个排查任务：example.com 通不通？本机 8080 端口为什么访问不了？你要按"连通性 → 端口 → 服务"的顺序检查，最后用 systemctl 把 webapp 服务启动起来再验证。',
    whyItMatters: '网络出问题最常见的三大原因：链路不通、端口没监听、服务没启动。不会这四步排查法，遇到"网站打不开"只能干着急。',
    observationGuide: ['ping -c 3 只发 3 次请求（不加 -c 会一直发）', 'curl 的 URL 必须带 http:// 协议头', 'ss -tlnp 查看端口监听情况', 'systemctl start 才真正启动服务'],
    reasoningSteps: ['任务关键词是"连通性""访问网页""端口""启动服务"', '连通性用 ping，HTTP 请求用 curl', '端口监听用 ss -tlnp', '启动服务用 systemctl start'],
    commandSelection: 'ping 模拟"喊一声听回声"；curl 是 Client URL 的缩写，发起网页请求；ss 是 socket statistics（套接字统计）；systemctl 管理 systemd 服务。',
    transferRules: [
      '"测连通性" → ping -c 3 域名',
      '"访问网页" → curl http://域名/',
      '"看端口监听" → ss -tlnp',
      '"启动服务" → systemctl start 服务名',
      '"启动后验证" → 再 curl 一次',
    ],
    reflectionQuestions: ['为什么 curl localhost:8080 不行而 curl http://localhost:8080/ 可以？', 'systemctl status 和 systemctl start 有什么区别？'],
    hintLevels: {
      goal: '测试 example.com 的连通性、访问它、访问本机 8080 端口（会失败）、查 8080 是否被监听、启动 webapp 服务、再次访问验证。',
      think: '任务是一条排查链：先测通不通，再看端口，最后才是启动服务；注意访问网址要带协议头。',
      commandType: '四条命令：测连通性的、发网页请求的、查端口的、管理服务的。',
      syntax: 'ping -c 3 example.com；curl http://localhost:8080/；ss -tlnp；systemctl start webapp。',
      answer:
        'ping -c 3 example.com 显示连通；curl http://example.com/ 返回网页内容；curl http://localhost:8080/ 失败（服务没启动）；ss -tlnp 里看不到 8080 被监听；systemctl start webapp 启动服务；再次 curl http://localhost:8080/ 有响应即成功。',
    },
    completion: {
      solved: '你按"连通性 → 端口 → 服务"的顺序排查，最后用 systemctl start webapp 启动服务并验证 8080 端口恢复访问。',
      clue: '判断依据是关键词"连通性""访问网页""端口监听""启动服务"。',
      why: 'ping 测连通、curl 发 HTTP 请求、ss -tlnp 查端口监听、systemctl 管理服务，四步正好覆盖常见故障。',
      reuse: '网站打不开、服务访问不了时，按这个顺序逐层排查最不容易漏。',
      relatedCommand: 'ss -s——快速汇总当前系统的网络连接统计。',
    },
  },
  'linux-troubleshoot': {
    scenario:
      'webapp 服务启动失败了，你像真正的运维一样在现场：先看服务状态找失败原因，翻日志看到 Permission denied，再检查日志文件权限——果然只有读权限没有写权限，修复权限后启动服务，最后验证网站恢复。',
    whyItMatters: '排障是运维的日常核心。系统报错时最忌讳瞎试，按"状态 → 日志 → 权限 → 修复 → 验证"的流程走，才能又快又稳地解决问题。',
    observationGuide: ['systemctl status 显示 failed 和 Permission denied 字样', '日志在 /var/log/webapp/app.log', 'ls -l 显示 -r--r--r--（没有写权限）', 'chmod 644 补上写权限'],
    reasoningSteps: ['任务关键词是"为什么失败""报错信息""权限"', '状态用 systemctl status，报错信息用 tail 或 grep 翻日志', '权限用 ls -l 查看、chmod 修改', '修复后 systemctl start 启动，再用 curl 验证'],
    commandSelection: '这节课是你学过的命令的组合拳：systemctl 看服务、tail/grep 看日志、ls -l 看权限、chmod 修权限、curl 验证，环环相扣。',
    transferRules: [
      '"服务为什么挂" → systemctl status 服务名',
      '"看具体报错" → tail -N 日志文件',
      '"怀疑权限" → ls -l 文件',
      '"修权限" → chmod 644 文件',
      '"修复后验证" → systemctl start 服务名 再 curl',
    ],
    reflectionQuestions: ['日志里出现 Permission denied，问题大概率出在哪？', '为什么先看状态和日志再动手改东西？'],
    hintLevels: {
      goal: '找到 webapp 启动失败的原因，修复它，然后启动服务并验证恢复。',
      think: '任务给了一条线索链：服务状态 → 日志报错 → 文件权限；关键词是"只读权限"和"无法写入日志"。',
      commandType: '五个工具按顺序用：看服务状态、翻日志、查权限、改权限、启动并验证。',
      syntax: 'systemctl status webapp；tail -5 /var/log/webapp/app.log；ls -l /var/log/webapp/app.log；chmod 644 /var/log/webapp/app.log；systemctl start webapp；curl http://localhost:8080/。',
      answer:
        'systemctl status webapp 显示 failed 和 Permission denied；tail -5 /var/log/webapp/app.log 看到 Failed to open log file 的报错；ls -l 显示 -r--r--r--（只有读权限）；chmod 644 /var/log/webapp/app.log 补上写权限；systemctl start webapp 启动成功；curl http://localhost:8080/ 有响应即完全恢复。',
    },
    completion: {
      solved: '你定位到 webapp 失败是因为日志文件只有读权限，用 chmod 644 修复后启动服务并验证恢复。',
      clue: '判断依据是关键词"失败原因""日志报错""权限"。',
      why: '先定位再动手是排障核心：状态给方向、日志给细节、权限是常见根因、chmod 对症下药、curl 闭环验证。',
      reuse: '任何服务起不来的问题，都按"状态 → 日志 → 权限 → 修复 → 验证"的流程走。',
      relatedCommand: 'journalctl——查看 systemd 日志的集中入口，比翻单个文件更全面。',
    },
  },
}
