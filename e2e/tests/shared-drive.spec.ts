import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { USERS } from '../helpers/config'
import { DrivePage } from '../pages/DrivePage'
import { ShareModalPage } from '../pages/ShareModalPage'

const FOLDER_NAME = `Shared Folder ${Date.now()}`

test.describe.serial('Folder sharing', () => {
  test('Alice creates a folder, enters it, and shares it with Bob', async ({
    browser
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await authenticate(page, 'alice')

    await page.goto(`${USERS.alice.appUrl}/#/folder`)
    const drive = new DrivePage(page)

    await drive.createFolder(FOLDER_NAME)

    await drive.clickFile(FOLDER_NAME)
    await page.waitForURL(/\/folder\/[^/]+$/)

    await page.getByRole('button', { name: /share/i }).click()

    const shareModal = new ShareModalPage(page)
    await shareModal.waitForOpen()
    await shareModal.addMember(USERS.bob.email)
    await shareModal.share()
    await shareModal.waitForMemberVisible(USERS.bob.email)

    await context.close()
  })

  test('Bob sees the shared folder in his Sharings section', async ({
    browser
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await authenticate(page, 'bob')

    await page.goto(`${USERS.bob.appUrl}/#/sharings`)
    const drive = new DrivePage(page)

    // Sharing propagates asynchronously across instances; reload until it lands.
    await expect(async () => {
      await page.reload()
      await drive.waitForFileVisible(FOLDER_NAME)
    }).toPass({ timeout: 30_000 })

    await context.close()
  })
})
