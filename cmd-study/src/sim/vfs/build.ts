import type { FsNode } from '../types'
import { UID_STUDENT } from './access'

export const APP_LOG = [
  '2026-08-01 08:01:12 INFO  application started',
  '2026-08-01 08:02:30 INFO  connected to database db-primary',
  '2026-08-01 08:03:45 WARN  slow query detected: 2.4s',
  '2026-08-01 08:04:12 ERROR failed to connect to upstream: timeout after 3s',
  '2026-08-01 08:05:01 INFO  retrying connection (attempt 1)',
  '2026-08-01 08:05:47 ERROR upstream still unreachable: connection refused',
  '2026-08-01 08:06:22 INFO  retrying connection (attempt 2)',
  '2026-08-01 08:07:03 ERROR upstream still unreachable: connection refused',
  '2026-08-01 08:07:40 INFO  retrying connection (attempt 3)',
  '2026-08-01 08:08:11 ERROR upstream responded with 502 Bad Gateway',
  '2026-08-01 08:09:00 INFO  recovered connection to upstream',
  '2026-08-01 08:10:15 WARN  high memory usage: 82%',
  '2026-08-01 08:11:33 ERROR disk usage over threshold: /var/log is 91% full',
  '2026-08-01 08:12:05 INFO  scheduled backup completed',
  '2026-08-01 08:13:41 ERROR backup job failed: insufficient permissions',
  '2026-08-01 08:14:20 INFO  daily report generated',
].join('\n')

export const WEBAPP_LOG = [
  '2026-08-01 08:20:00 INFO  webapp starting on port 8080',
  '2026-08-01 08:20:01 INFO  loading configuration from /etc/webapp/config.ini',
  '2026-08-01 08:20:01 ERROR Failed to open log file /var/log/webapp/app.log: Permission denied',
  '2026-08-01 08:20:01 ERROR webapp exiting: cannot initialize logging',
  '2026-08-01 08:20:02 INFO  supervisor: restarting webapp (attempt 1)',
  '2026-08-01 08:20:03 ERROR Failed to open log file /var/log/webapp/app.log: Permission denied',
  '2026-08-01 08:20:04 INFO  supervisor: restarting webapp (attempt 2)',
  '2026-08-01 08:20:05 ERROR webapp exited with code 1',
  '2026-08-01 08:20:06 WARN  supervisor giving up after 3 attempts',
].join('\n')

const LARGE_LOG = Array.from({ length: 40 }, (_, i) => `2026-08-01 ${String(8 + Math.floor(i / 12)).padStart(2, '0')}:${String(i * 2).padStart(2, '0')}:00 INFO  request ${i + 1} completed in ${20 + (i % 7) * 5}ms`).join('\n')

export function dir(
  name: string,
  mode = 0o755,
  uid = 0,
  gid = 0,
  children?: Record<string, FsNode>,
): FsNode {
  return { kind: 'dir', name, content: '', mode, uid, gid, mtime: 0, children }
}

export function file(name: string, content: string, mode = 0o644, uid = 0, gid = 0): FsNode {
  return { kind: 'file', name, content, mode, uid, gid, mtime: 0 }
}

export function buildBaseFs(): FsNode {
  const student = UID_STUDENT
  const studentDir: Record<string, FsNode> = {
    projects: dir('projects', 0o755, student, student, {
      'readme.md': file('readme.md', '# my projects\n\n- web-app\n- scripts\n', 0o644, student, student),
      'todo.txt': file('todo.txt', '1. learn docker\n2. learn kubernetes\n3. write a blog post\n', 0o644, student, student),
      src: dir('src', 0o755, student, student, {
        'main.py': file('main.py', '#!/usr/bin/env python3\nprint("hello from main")\n', 0o755, student, student),
        'utils.py': file('utils.py', 'def helper():\n    return 42\n', 0o644, student, student),
      }),
    }),
    data: dir('data', 0o755, student, student, {
      'names.txt': file(
        'names.txt',
        'alice\nbob\nalice\ncarol\nalice\nbob\ndave\n',
      ),
      'scores.txt': file(
        'scores.txt',
        'alice,92\nbob,78\nalice,85\ncarol,99\ndave,67\n',
      ),
      'ip.txt': file('ip.txt', '10.0.0.1\n10.0.0.10\n192.168.1.5\n10.0.0.2\n172.16.0.9\n', 0o644, student, student),
    }),
    backup: dir('backup', 0o755, student, student, {
      'file1.txt': file('file1.txt', 'backup content one\n', 0o644, student, student),
      'file2.txt': file('file2.txt', 'backup content two\n', 0o644, student, student),
      'notes.md': file('notes.md', '# Backup notes\n', 0o644, student, student),
    }),
    scripts: dir('scripts', 0o755, student, student, {
      'run.sh': file('run.sh', '#!/bin/bash\necho "running script"\n', 0o644, student, student),
      'deploy.sh': file('deploy.sh', '#!/bin/bash\necho "deploying"\n', 0o755, student, student),
    }),
    logs: dir('logs', 0o755, student, student, {
      'access.log': file(
        'access.log',
        '192.168.1.10 - - [01/Aug/2026:08:00:01] "GET / HTTP/1.1" 200 612\n192.168.1.11 - - [01/Aug/2026:08:00:05] "GET /index.html HTTP/1.1" 200 612\n192.168.1.10 - - [01/Aug/2026:08:00:09] "POST /api/login HTTP/1.1" 401 120\n192.168.1.12 - - [01/Aug/2026:08:00:12] "GET /api/users HTTP/1.1" 200 452\n192.168.1.10 - - [01/Aug/2026:08:00:20] "POST /api/login HTTP/1.1" 200 340\n',
      ),
      'error.log': file('error.log', 'ERROR connection reset by peer\nWARN slow handler /api/users\nERROR timeout waiting for db\n', 0o644, student, student),
    }),
    'notes.txt': file('notes.txt', 'Study notes\n\n- remember: ls -la shows hidden files\n- pipes are powerful: cat a | grep b | wc -l\n', 0o644, student, student),
    'secrets.txt': file('secrets.txt', 'Do not share this file.\npassword-hint: never store secrets in plain text\n', 0o644, student, student),
    '.bashrc': file('.bashrc', '# ~/.bashrc\nexport PS1="\\u@\\h:\\w$ "\nalias ll="ls -l"\n', 0o644, student, student),
    '.profile': file('.profile', '# ~/.profile\nPATH=$PATH:$HOME/.local/bin\nexport PATH\n', 0o644, student, student),
  }
  return dir('', 0o755, 0, 0, {
    home: dir('home', 0o755, 0, 0, {
      student: dir('student', 0o755, student, student, studentDir),
    }),
    etc: dir('etc', 0o755, 0, 0, {
      hosts: file(
        'hosts',
        '127.0.0.1   localhost\n127.0.1.1   lab-host\n\n# The following lines are desirable for IPv6 capable hosts\n::1         ip6-localhost ip6-loopback\nfe00::0     ip6-localnet\nff02::1     ip6-allnodes\nff02::2     ip6-allrouters\n',
      ),
      passwd: file('passwd', 'root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000:student,,,:/home/student:/bin/bash\n', 0o644, 0, 0),
      group: file('group', 'root:x:0:\nstudent:x:1000:\nsudo:x:27:student\n', 0o644, 0, 0),
      'os-release': file('os-release', 'PRETTY_NAME="CmdLab Linux 1.0"\nVERSION_ID="1.0"\n', 0o644, 0, 0),
      nginx: dir('nginx', 0o755, 0, 0, {
        'nginx.conf': file(
          'nginx.conf',
          'worker_processes auto;\n\nevents {\n    worker_connections 1024;\n}\n\nhttp {\n    include mime.types;\n    server {\n        listen 80;\n        server_name localhost;\n        location / {\n            root /usr/share/nginx/html;\n        }\n    }\n}\n',
          0o644,
          0,
          0,
        ),
      }),
    }),
    opt: dir('opt', 0o755, 0, 0, {
      webapp: dir('webapp', 0o755, 0, 0, {
        app: file('app', '#!/bin/bash\necho "webapp started"\n', 0o755, 0, 0),
        'config.ini': file('config.ini', 'port=8080\nlog_file=/var/log/webapp/app.log\n', 0o644, 0, 0),
      }),
    }),
    var: dir('var', 0o755, 0, 0, {
      log: dir('log', 0o755, 0, 0, {
        syslog: file(
          'syslog',
          'Aug  1 08:00:01 lab kernel: Linux version 6.1.0 (build@lab) (gcc 12.2.0)\nAug  1 08:00:01 lab kernel: Command line: BOOT_IMAGE=/vmlinuz root=/dev/vda1\nAug  1 08:00:02 lab systemd[1]: Starting systemd-journald.service...\nAug  1 08:00:03 lab systemd[1]: Started systemd-journald.service.\nAug  1 08:00:05 lab systemd[1]: Started Login Service.\nAug  1 08:00:06 lab systemd[1]: Reached target Multi-User System.\nAug  1 08:05:12 lab cron[890]: (root) CMD (run-parts /etc/cron.hourly)\nAug  1 08:15:03 lab sshd[912]: Accepted publickey for student from 192.168.1.20\nAug  1 08:15:03 lab sshd[912]: session opened for user student\nAug  1 08:20:41 lab systemd[1]: Started Session 3 of user student.\n',
          0o644,
          0,
          0,
        ),
        'app.log': file('app.log', APP_LOG + '\n', 0o644, 0, 0),
        'big.log': file('big.log', LARGE_LOG + '\n', 0o644, 0, 0),
        webapp: dir('webapp', 0o755, 0, 0, {
          'app.log': file('app.log', WEBAPP_LOG + '\n', 0o444, 1000, 1000),
        }),
      }),
    }),
    tmp: dir('tmp', 0o1777, 0, 0, {}),
    usr: dir('usr', 0o755, 0, 0, {
      bin: dir('bin', 0o755, 0, 0, {}),
      local: dir('local', 0o755, 0, 0, { bin: dir('bin', 0o755, 0, 0, {}) }),
    }),
    root: dir('root', 0o700, 0, 0, {}),
  })
}
