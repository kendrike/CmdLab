import { expect, test } from '@playwright/test'

async function typeCommand(page: import('@playwright/test').Page, cmd: string) {
  await page.locator('[data-testid="terminal"]').click()
  await page.keyboard.type(cmd)
  await page.keyboard.press('Enter')
}

test('桌面端布局：三个区域完整显示', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '桌面端布局仅在 desktop 项目验证')
  await page.goto('/')
  await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
  await expect(page.locator('[data-testid="terminal"]')).toBeVisible()
  await expect(page.locator('[data-testid="task-panel"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar"]')).toBeVisible()
})

test('输入命令并显示输出', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'pwd')
  await expect(page.locator('.xterm-rows')).toContainText('/home/student')
  await typeCommand(page, 'ls')
  await expect(page.locator('.xterm-rows')).toContainText('notes.txt')
})

test('错误命令显示教学提示', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'nosuchcmd')
  await expect(page.locator('.xterm-rows')).toContainText('command not found')
  await typeCommand(page, 'rm -rf /')
  await expect(page.locator('.xterm-rows')).toContainText('dangerous to operate recursively')
})

test('完成实验后可通过检查答案并进入下一个实验', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'whoami')
  await typeCommand(page, 'pwd')
  await typeCommand(page, 'ls')
  await typeCommand(page, 'history')
  await typeCommand(page, 'clear')
  await expect(page.locator('[data-testid="lab-done"]')).toBeVisible()
  await page.locator('[data-testid="check-btn"]').click()
  await expect(page.locator('[data-testid="check-result"]')).toContainText('通过')
  await page.locator('[data-testid="next-btn"]').click()
  await expect(page.locator('[data-testid="lab-title"]')).toHaveText('ls：查看文件列表')
})

test('重置实验恢复初始终端', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'pwd')
  await expect(page.locator('.xterm-rows')).toContainText('/home/student')
  await page.locator('[data-testid="reset-btn"]').click()
  await expect(page.locator('.xterm-rows')).not.toContainText('/home/student')
  await expect(page.locator('.xterm-rows')).toContainText('CmdLab 终端模拟器')
})

test('刷新页面后恢复学习进度', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'whoami')
  await typeCommand(page, 'pwd')
  await typeCommand(page, 'ls')
  await typeCommand(page, 'history')
  await typeCommand(page, 'clear')
  await expect(page.locator('[data-testid="lab-done"]')).toBeVisible()
  await page.locator('[data-testid="next-btn"]').click()
  await expect(page.locator('[data-testid="lab-title"]')).toHaveText('ls：查看文件列表')
  await page.reload()
  await expect(page.locator('[data-testid="lab-title"]')).toHaveText('ls：查看文件列表')
  await expect(page.locator('[data-testid="progress"]')).toContainText('1/50')
  await expect(page.locator('[data-testid="lab-linux-pwd"]')).toBeVisible()
})

test('桌面端无横向溢出', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - window.innerWidth
  })
  expect(overflow).toBeLessThanOrEqual(1)
})

test('帮助弹窗可以打开和关闭', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-testid="help-btn"]').click()
  await expect(page.locator('[data-testid="help-modal"]')).toBeVisible()
  await page.locator('[data-testid="help-close"]').click()
  await expect(page.locator('[data-testid="help-modal"]')).toBeHidden()
})

test('切换主题生效', async ({ page }) => {
  await page.goto('/')
  const before = await page.evaluate(() => document.documentElement.dataset['theme'])
  expect(before).toBe('dark')
  await page.locator('[data-testid="theme-btn"]').click()
  const after = await page.evaluate(() => document.documentElement.dataset['theme'])
  expect(after).toBe('light')
})

test('ll 别名可用', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'll')
  await expect(page.locator('.xterm-rows')).toContainText('notes.txt')
})

test('ls -l 多行输出列对齐（无阶梯排列）', async ({ page }) => {
  await page.goto('/')
  await typeCommand(page, 'ls -l')
  await page.waitForTimeout(200)
  const starts = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.xterm-rows > div'))
    const out = []
    for (const row of rows) {
      const spans = Array.from(row.querySelectorAll('span'))
      const text = spans.map((s) => s.textContent).join('')
      if (!/^(d|-)rw/.test(text)) continue
      const first = spans[0]
      if (first) out.push(Math.round(first.getBoundingClientRect().x))
    }
    return out
  })
  expect(starts.length).toBeGreaterThanOrEqual(2)
  expect(new Set(starts).size).toBe(1)
})

test('侧边栏按模式分组切换', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-testid="lab-linux-pwd"]')).toBeVisible()
  await expect(page.locator('[data-testid="lab-docker-run-nginx"]')).toBeHidden()
  await page.locator('[data-testid="mode-tab-docker"]').click()
  await expect(page.locator('[data-testid="lab-docker-run-nginx"]')).toBeVisible()
  await expect(page.locator('[data-testid="lab-linux-pwd"]')).toBeHidden()
  await expect(page.locator('[data-testid="lab-docker-images"]')).toBeVisible()
  await page.locator('[data-testid="lab-docker-run-nginx"]').click()
  await expect(page.locator('[data-testid="lab-title"]')).toHaveText('启动 nginx 容器')
  await expect(page.locator('[data-testid="mode-badge"]')).toHaveText('Docker')
  await page.locator('[data-testid="mode-tab-kubernetes"]').click()
  await expect(page.locator('[data-testid="lab-k8s-crashloop"]')).toBeVisible()
  await expect(page.locator('[data-testid="lab-docker-images"]')).toBeHidden()
})

test('代码编辑器可以编写 Dockerfile 并保存', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-testid="tab-dockerfile"]').click()
  await expect(page.locator('[data-testid="editor-textarea"]')).toBeVisible()
  await page.locator('[data-testid="editor-textarea"]').fill('FROM nginx\nWORKDIR /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n')
  await page.locator('[data-testid="editor-save"]').click()
  await expect(page.locator('[data-testid="editor-save"]')).toBeVisible()
  await page.locator('[data-testid="tab-terminal"]').click()
  await typeCommand(page, 'cat Dockerfile')
  await expect(page.locator('.xterm-rows')).toContainText('FROM nginx')
  await expect(page.locator('.xterm-rows')).toContainText('daemon off')
})

test('docker 构建与运行完整流程', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-testid="tab-dockerfile"]').click()
  await page.locator('[data-testid="editor-textarea"]').fill('FROM nginx\nCOPY index.html /usr/share/nginx/html/\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n')
  await page.locator('[data-testid="editor-save"]').click()
  await page.locator('[data-testid="tab-terminal"]').click()
  await typeCommand(page, 'echo "<h1>hello docker</h1>" > index.html')
  await typeCommand(page, 'docker build -t myapp:v1 .')
  await expect(page.locator('.xterm-rows')).toContainText('Successfully tagged myapp:v1')
  await typeCommand(page, 'docker run -d --name app -p 8080:80 myapp:v1')
  await typeCommand(page, 'docker ps')
  await expect(page.locator('.xterm-rows')).toContainText('app')
  await typeCommand(page, 'curl http://localhost:8080/')
  await expect(page.locator('.xterm-rows')).toContainText('hello docker')
})

test('kubectl 声明式部署完整流程', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-testid="mode-tab-kubernetes"]').click()
  await expect(page.locator('[data-testid="lab-k8s-intro"]')).toBeVisible()
  await typeCommand(page, 'kubectl cluster-info')
  await expect(page.locator('.xterm-rows')).toContainText('6443')
  await typeCommand(page, 'kubectl config current-context')
  await expect(page.locator('.xterm-rows')).toContainText('kubernetes-admin@kubernetes')
  await typeCommand(page, 'kubectl create deployment web --image=nginx --replicas=2')
  await expect(page.locator('.xterm-rows')).toContainText('deployment.apps/web created')
  await typeCommand(page, 'kubectl get pods')
  await expect(page.locator('.xterm-rows')).toContainText('Running')
  await typeCommand(page, 'kubectl scale deployment web --replicas=3')
  await typeCommand(page, 'kubectl get pods')
  await expect(page.locator('.xterm-rows')).toContainText('web-')
  await typeCommand(page, 'kubectl expose deployment web --port=80 --type=NodePort')
  await expect(page.locator('.xterm-rows')).toContainText('service/web exposed')
  await typeCommand(page, 'kubectl get endpoints')
  await expect(page.locator('.xterm-rows')).toContainText('10.244.0.')
  await typeCommand(page, 'kubectl set image deployment/web web=nginx:1.25')
  await expect(page.locator('.xterm-rows')).toContainText('image updated')
  await typeCommand(page, 'kubectl rollout undo deployment/web')
  await expect(page.locator('.xterm-rows')).toContainText('rolled back')
})
