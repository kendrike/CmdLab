import { expect, test } from '@playwright/test'

test.describe('mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('移动端无横向溢出', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      return {
        docOverflow: doc.scrollWidth - window.innerWidth,
        bodyOverflow: document.body.scrollWidth - window.innerWidth,
      }
    })
    expect(overflow.docOverflow).toBeLessThanOrEqual(1)
    expect(overflow.bodyOverflow).toBeLessThanOrEqual(1)
  })

  test('课程导航默认隐藏，抽屉可打开关闭', async ({ page }) => {
    await expect(page.locator('[data-testid="drawer-nav"]')).toBeHidden()
    await page.locator('[data-testid="open-nav"]').click()
    await expect(page.locator('[data-testid="drawer-nav"]')).toBeVisible()
    await expect(page.locator('[data-testid="lab-linux-pwd"]')).toBeVisible()
    await page.locator('.drawer-backdrop').click({ position: { x: 380, y: 300 } })
    await expect(page.locator('[data-testid="drawer-nav"]')).toBeHidden()
  })

  test('任务面板抽屉可打开且不遮挡终端输入', async ({ page }) => {
    await page.locator('[data-testid="open-task"]').click()
    await expect(page.locator('[data-testid="drawer-task"]')).toBeVisible()
    await expect(page.locator('[data-testid="lab-title"]')).toHaveText('认识终端：whoami / pwd / history')
    await page.locator('.drawer-backdrop').click({ position: { x: 10, y: 300 } })
    await expect(page.locator('[data-testid="drawer-task"]')).toBeHidden()
    await page.locator('[data-testid="terminal"]').click()
    await page.keyboard.type('pwd')
    await page.keyboard.press('Enter')
    await expect(page.locator('.xterm-rows')).toContainText('/home/student')
  })

  test('移动端输入命令显示输出', async ({ page }) => {
    await page.locator('[data-testid="terminal"]').click()
    await page.keyboard.type('ls')
    await page.keyboard.press('Enter')
    await expect(page.locator('.xterm-rows')).toContainText('notes.txt')
  })

  test('移动端各面板内容可完整滚动、无重叠元素遮挡', async ({ page }) => {
    await page.locator('[data-testid="open-nav"]').click()
    const navOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="drawer-nav"]')
      if (!el) return 0
      return el.scrollWidth - el.clientWidth
    })
    expect(navOverflow).toBeLessThanOrEqual(1)
    await page.locator('.drawer-backdrop').click({ position: { x: 380, y: 300 } })
    await page.locator('[data-testid="open-task"]').click()
    const taskOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="drawer-task"]')
      if (!el) return 0
      return el.scrollWidth - el.clientWidth
    })
    expect(taskOverflow).toBeLessThanOrEqual(1)
    await page.locator('[data-testid="next-btn"]').isDisabled()
  })

  test('移动端完整完成一个实验（自动勾选 + 进入下一实验）', async ({ page }) => {
    await page.locator('[data-testid="terminal"]').click()
    for (const cmd of ['whoami', 'pwd', 'ls', 'history', 'clear']) {
      await page.keyboard.type(cmd)
      await page.keyboard.press('Enter')
    }
    await page.locator('[data-testid="open-task"]').click()
    await expect(page.locator('[data-testid="lab-done"]')).toBeVisible()
    await page.locator('[data-testid="check-btn"]').click()
    await expect(page.locator('[data-testid="check-result"]')).toContainText('通过')
    await page.locator('[data-testid="next-btn"]').click()
    await expect(page.locator('[data-testid="lab-title"]')).toHaveText('ls：查看文件列表')
  })
})
