export const MAN_PAGES: Record<string, string> = {
  ls: `NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs (the current directory by default).

       -a, --all          do not ignore entries starting with .
       -l                 use a long listing format
       -h, --human-readable
                          with -l, print sizes in human readable format

EXAMPLES
       ls -la
       ls -lh /var/log
`,
  cd: `NAME
       cd - change the current working directory

SYNOPSIS
       cd [DIRECTORY]

DESCRIPTION
       Change the current directory to DIRECTORY.  The default is the
       user's home directory.  Use '..' for the parent directory, '~' for
       the home directory, and '-' for the previous directory.
`,
  pwd: `NAME
       pwd - print name of current/working directory

SYNOPSIS
       pwd

DESCRIPTION
       Print the full filename of the current working directory.
`,
  cat: `NAME
       cat - concatenate files and print on the standard output

SYNOPSIS
       cat [FILE]...

DESCRIPTION
       Concatenate FILE(s) to standard output.  With no FILE, read from
       standard input (for example, from a pipe).
`,
  echo: `NAME
       echo - display a line of text

SYNOPSIS
       echo [-n] [STRING]...

DESCRIPTION
       Echo the STRING(s) to standard output.

       -n     do not output the trailing newline
`,
  mkdir: `NAME
       mkdir - make directories

SYNOPSIS
       mkdir [OPTION]... DIRECTORY...

DESCRIPTION
       Create the DIRECTORY(ies), if they do not already exist.

       -p, --parents      no error if existing, make parent directories as needed
`,
  touch: `NAME
       touch - change file timestamps / create empty files

SYNOPSIS
       touch [OPTION]... FILE...

DESCRIPTION
       Update the access and modification times of each FILE to the
       current time.  A FILE argument that does not exist is created empty.
`,
  cp: `NAME
       cp - copy files and directories

SYNOPSIS
       cp [OPTION]... SOURCE... DEST

DESCRIPTION
       Copy SOURCE to DEST, or multiple SOURCE(s) to a directory.

       -r, -R, --recursive   copy directories recursively
`,
  mv: `NAME
       mv - move (rename) files

SYNOPSIS
       mv [OPTION]... SOURCE... DEST

DESCRIPTION
       Rename SOURCE to DEST, or move SOURCE(s) to a directory.
`,
  rm: `NAME
       rm - remove files or directories

SYNOPSIS
       rm [OPTION]... FILE...

DESCRIPTION
       This manual page documents the GNU version of rm.

       -f, --force     ignore nonexistent files, never prompt
       -r, -R, --recursive
                       remove directories and their contents recursively

       Simulator safety note: removal of the root directory '/' is blocked.
`,
  grep: `NAME
       grep - print lines that match patterns

SYNOPSIS
       grep [OPTION]... PATTERN [FILE]...

DESCRIPTION
       grep searches the named input FILEs for lines containing a match
       to the given PATTERN (a regular expression).  With no FILE, read
       from standard input.

       -i        ignore case distinctions
       -n        print line number with output lines
       -c        print only a count of matching lines
       -v        select non-matching lines
       -r        read all files under each directory, recursively
       -w        match only whole words

EXAMPLES
       grep ERROR /var/log/app.log
       grep -in error /var/log/app.log
       cat /var/log/app.log | grep ERROR | wc -l
`,
  find: `NAME
       find - search for files in a directory hierarchy

SYNOPSIS
       find [path...] [expression]

DESCRIPTION
       Walk the directory tree under each path (default '.') and print
       every entry.

       -name PATTERN   file name matches PATTERN (supports * and ?)
       -type f|d       only files / only directories
`,
  head: `NAME
       head - output the first part of files

SYNOPSIS
       head [OPTION]... [FILE]...

DESCRIPTION
       Print the first 10 lines of each FILE to standard output.

       -n, --lines=N   print the first N lines instead of 10
`,
  tail: `NAME
       tail - output the last part of files

SYNOPSIS
       tail [OPTION]... [FILE]...

DESCRIPTION
       Print the last 10 lines of each FILE to standard output.

       -n, --lines=N   output the last N lines instead of 10
`,
  wc: `NAME
       wc - print newline, word, and byte counts

SYNOPSIS
       wc [OPTION]... [FILE]...

DESCRIPTION
       Print newline, word, and byte counts for each FILE.  With no FILE,
       read from standard input.

       -l     print only the newline counts
       -w     print only the word counts
       -c     print only the byte counts
`,
  sort: `NAME
       sort - sort lines of text files

SYNOPSIS
       sort [OPTION]... [FILE]...

DESCRIPTION
       Write sorted concatenation of all FILE(s) to standard output.

       -r     reverse the result of comparisons
       -n     compare according to string numerical value
`,
  uniq: `NAME
       uniq - report or omit repeated lines

SYNOPSIS
       uniq [OPTION]... [INPUT [OUTPUT]]

DESCRIPTION
       Filter adjacent matching lines from INPUT.

       -c     prefix lines by the number of occurrences
`,
  chmod: `NAME
       chmod - change file mode bits

SYNOPSIS
       chmod MODE FILE...

DESCRIPTION
       Change the permissions of each FILE to MODE.  MODE can be octal
       (e.g. 755, 600) or symbolic (e.g. u+x, g-w, o=r, a+x).

EXAMPLES
       chmod 600 secrets.txt
       chmod u+x run.sh
`,
  chown: `NAME
       chown - change file owner and group

SYNOPSIS
       chown [OWNER][:[GROUP]] FILE...

DESCRIPTION
       Change the owner and/or group of each FILE.  Only root can change
       the owner; a normal user may change the group of a file they own
       to one of their own groups.

EXAMPLES
       chown :student shared.txt   (change group only)
       chown student:student f     (requires root, Operation not permitted)
`,
  env: `NAME
       env - run a program in a modified environment

SYNOPSIS
       env

DESCRIPTION
       Print all environment variables (NAME=VALUE), one per line.
       Combine with a pipe to filter, e.g. env | grep PATH.
`,
  export: `NAME
       export - set an environment variable

SYNOPSIS
       export NAME[=VALUE]...

DESCRIPTION
       Define environment variables.  Variables are read with $NAME,
       e.g. echo $PATH.  With no arguments, print all exported variables.
`,
  cut: `NAME
       cut - remove sections from each line of files

SYNOPSIS
       cut -d DELIM -f FIELDS [FILE]...
       cut -c LIST [FILE]...

DESCRIPTION
       Extract columns from lines.  FIELDS is a comma-separated list of
       field numbers (1-based), e.g. 2 or 1,3 or 2-4.

EXAMPLES
       cut -d "," -f 2 data/scores.txt
       cat data/scores.txt | cut -d, -f1,2
`,
  top: `NAME
       top - display Linux processes (simulated snapshot)

SYNOPSIS
       top

DESCRIPTION
       Display a snapshot of processes with CPU and memory columns.
       In the real system top refreshes every 3 seconds; here it shows
       a static snapshot.
`,
  gzip: `NAME
       gzip - compress or decompress files

SYNOPSIS
       gzip [OPTION]... [FILE]...
       gunzip [OPTION]... [FILE.gz]...

DESCRIPTION
       gzip compresses FILE to FILE.gz and removes FILE.  gunzip (or
       gzip -d) restores FILE.gz back to FILE.

       -k, --keep     keep the input file
       -d, --decompress  decompress
`,
  tar: `NAME
       tar - an archiving utility

SYNOPSIS
       tar [-c|-t|-x] [-z] -f ARCHIVE [FILE]... [-C DIR]

DESCRIPTION
       -c     create an archive
       -t     list archive contents
       -x     extract files from an archive
       -z     compress with gzip (use -czf / -xzf)
       -f     archive file name
       -C DIR change to DIR before extracting

EXAMPLES
       tar -czf backup.tar.gz backup/
       tar -tf backup.tar.gz
       tar -xf backup.tar.gz -C restore/
`,
  ping: `NAME
       ping - send ICMP ECHO_REQUEST to network hosts

SYNOPSIS
       ping [-c COUNT] HOST

DESCRIPTION
       Send ICMP echo requests to HOST and report the replies.
       Host names are resolved from /etc/hosts and a built-in table.

EXAMPLES
       ping -c 3 example.com
       ping localhost
`,
  curl: `NAME
       curl - transfer a URL (simulated)

SYNOPSIS
       curl [OPTION]... URL

DESCRIPTION
       Fetch a URL and print the response.  Known sites (example.com,
       httpbin.org) and local services (localhost) are simulated.

       -s, --silent   quiet mode (no error messages)
       -I, --head     show response headers only
       -o FILE        write output to FILE

EXAMPLES
       curl http://example.com
       curl -I http://localhost:8080/
       curl -s -o page.html http://example.com
`,
  ss: `NAME
       ss - display socket statistics

SYNOPSIS
       ss [OPTION]...

DESCRIPTION
       Show listening sockets and connections.

       -t     display TCP sockets
       -l     display listening sockets
       -n     do not resolve names
       -p     show process using the socket

EXAMPLES
       ss -tlnp
`,
  systemctl: `NAME
       systemctl - control the systemd system and service manager (simulated)

SYNOPSIS
       systemctl COMMAND SERVICE

COMMANDS
       status    show service status and recent log lines
       start     start the service
       stop      stop the service
       restart   restart the service
       enable    enable the service at boot
       disable   disable the service at boot
       is-active check whether the service is active
`,
  whoami: `NAME
       whoami - print effective user name

SYNOPSIS
       whoami
`,
  id: `NAME
       id - print user and group information

SYNOPSIS
       id
`,
  ps: `NAME
       ps - report a snapshot of the current processes

SYNOPSIS
       ps

DESCRIPTION
       Display information about active processes.
`,
  kill: `NAME
       kill - terminate a process

SYNOPSIS
       kill [-SIGNAL] PID...

DESCRIPTION
       Send a signal to a process by PID.  The default signal is TERM.

EXAMPLES
       ps
       kill 2345
`,
  history: `NAME
       history - show the command history list

SYNOPSIS
       history

DESCRIPTION
       Display the shell command history with line numbers.
       Use the Up/Down arrow keys to browse it interactively.
`,
  man: `NAME
       man - an interface to the system reference manuals

SYNOPSIS
       man [COMMAND]

DESCRIPTION
       Display the manual page for COMMAND, e.g. 'man ls'.
       Run 'help' to list all available commands.
`,
  help: `NAME
       help - list simulator commands

SYNOPSIS
       help
`,
  alias: `NAME
       alias - define or display aliases

SYNOPSIS
       alias [NAME[=VALUE] ...]

DESCRIPTION
       Without arguments, print the list of aliases.  With arguments,
       define aliases (persisted into ~/.bashrc).

       The simulator predefines the Ubuntu defaults:
         ll='ls -alF'   la='ls -A'   l='ls -CF'
`,
  docker: `NAME
       docker - interact with the Docker container engine (simulated)

SYNOPSIS
       docker COMMAND [OPTIONS]

COMMANDS
       version        show version information
       info           show system-wide information
       images         list local images
       pull           pull an image (simulated download)
       ps             list containers
       run            run a command in a new container
       start          start a stopped container
       stop           stop a running container
       restart        restart a container
       rm             remove one or more containers
       rmi            remove one or more images
       logs           fetch the logs of a container
       exec           run a command in a running container
       inspect        return low-level information on objects
       network ls     list networks
       volume ls      list volumes
`,
  kubectl: `NAME
       kubectl - command line tool for Kubernetes (simulated)

SYNOPSIS
       kubectl COMMAND [OPTIONS]

COMMANDS
       version          print client and server version info
       cluster-info     display cluster info
       config           modify kubeconfig (current-context / view)
       get              display one or many resources
       describe         show details of a resource
       logs             print the logs of a pod
       exec             execute a command in a container
       create           create a resource (e.g. deployment, configmap)
       apply            apply a configuration from a YAML file
       edit             edit a resource on the server
       label            update labels on a resource
       annotate         update annotations on a resource
       expose           expose a deployment as a Service
       scale            set the replica count of a deployment
       set              set a field, e.g. the container image
       rollout          manage the rollout (status/history/undo/restart)
       delete           delete resources
       top              display resource usage (nodes/pods)
       taint            update taints on nodes

OPTIONS
       -n, --namespace      specify the namespace
       -A, --all-namespaces list resources in all namespaces
       -l, --label          filter by label selector
       -o wide|yaml|name    output format
       -f, --filename       YAML file for apply/create

RESOURCES
       pods/po, deployments/deploy, services/svc, configmaps/cm, secrets,
       namespaces/ns, nodes/no, replicasets/rs, jobs, cronjobs/cj,
       persistentvolumes/pv, persistentvolumeclaims/pvc, endpoints/ep, events/ev, all
`,
  help_all: `可用命令列表（当前模拟器支持）

文件与目录:
  pwd   查看当前目录       ls   列出目录内容（-a -l -h -R 递归）
  cd    切换目录           mkdir 创建目录（-p）
  touch 创建空文件/更新时间 cp    复制（-r 复制目录）
  mv    移动或重命名       rm    删除（-r 目录，-f 强制）
  cat   查看文件内容       head  查看开头 10 行（-n）
  tail  查看末尾 10 行（-n，-f 跟随） find  查找文件（-name -type）
  chmod 修改权限（数字/符号） chown 修改所有者/组
  wc    统计行/词/字节     sort  排序（-r -n）
  uniq  去重（-c）         cut   按列截取（-d -f -c）

打包压缩:
  gzip  压缩/解压（-d）    gunzip 解压
  tar   归档（-czf 打包压缩，-xf 解包，-tf 查看，-C 指定目录）

文本与用户:
  echo   输出文本（-n）    grep  搜索（-i -n -c -v -r）
  whoami 当前用户          id    用户与组信息
  env    环境变量          export 定义环境变量
  ps     进程列表          top   进程视图
  kill   结束进程          history 命令历史
  man    查看命令手册      clear  清屏
  help   本帮助

网络与服务:
  ping       连通性测试（-c）
  curl       HTTP 请求（-s -I -o）
  ss         查看端口/连接（-tlnp）
  systemctl  服务管理（status/start/stop/restart）

别名:
  ll = ls -alF    la = ls -A    l = ls -CF
  alias 查看或定义别名（写入 ~/.bashrc）

管道与重定向:
  |     管道（如 cat a | grep x | wc -l）
  >     重定向到文件       >>    追加到文件
  2>    错误输出到文件     2>>   错误输出追加
  <<EOF heredoc 多行输入   <     从文件读入

Docker（模拟）:
  docker version / info / images / pull / run / ps / start / stop / restart
  docker rm / rmi / tag / history / logs / exec / inspect / build
  docker network create / ls / inspect / connect
  docker volume create / ls / inspect / rm
  docker compose up / ps / logs / stop / down
  docker run 支持：-d -p -e -v --name --network --restart --rm --health-cmd --memory --cpus

Kubernetes（模拟）:
  kubectl version / cluster-info / config current-context / get / describe / logs / exec
  kubectl create / apply -f file.yaml / edit / label / annotate / expose
  kubectl scale / set image / rollout status|history|undo|restart / delete
  kubectl top nodes|pods / taint nodes
  get 支持：-n -A -l -o wide|yaml；资源：pod/deployment/service/cm/secret/ns/node/rs/job/cronjob/pv/pvc/endpoints/event
  编辑器可编写多文档 YAML（--- 分隔），kubectl apply -f k8s.yaml 应用

其他:
  Tab 补全命令与路径       ↑/↓ 浏览历史     Ctrl+L 清屏     Ctrl+C 取消输入
`,
}
