import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { DrivePage } from '../pages/DrivePage'
import { ShareModalPage } from '../pages/ShareModalPage'

const ALICE_URL = 'http://alice-drive.cozy.localhost'
const BOB_URL = 'http://bob-drive.cozy.localhost'
const FOLDER_NAME = `Shared Folder ${Date.now()}`

test.describe.serial('Folder sharing', () => {
  test('Alice creates a folder, enters it, and shares it with Bob', async ({
    browser
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await authenticate(page, 'alice')

    // Navigate to Alice's Drive root
    await page.goto(`${ALICE_URL}/#/folder`)
    const drive = new DrivePage(page)

    // Create the folder via UI
    await drive.createFolder(FOLDER_NAME)

    // Enter the folder
    await drive.clickFile(FOLDER_NAME)
    await page.waitForURL(/\/folder\/[^/]+$/)

    // Share the folder with Bob
    await page.getByRole('button', { name: /share/i }).click()

    const shareModal = new ShareModalPage(page)
    await shareModal.waitForOpen()
    await shareModal.addMember('bob@cozy.localhost')
    await shareModal.share()
    await shareModal.waitForMemberVisible('bob@cozy.localhost')
    await shareModal.close()

    await context.close()
  })

  test('Bob sees the shared folder in his Sharings section', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await authenticate(page, 'bob')

    await page.goto(`${BOB_URL}/#/sharings`)
    const drive = new DrivePage(page)

    // The sharing may take a moment to propagate — reload until it appears
    await expect(async () => {
      await page.reload()
      await drive.waitForFileVisible(FOLDER_NAME)
    }).toPass({ timeout: 30_000 })


    await context.close()
  })
})
