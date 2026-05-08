import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { USERS } from '../helpers/config'
import { DrivePage } from '../pages/DrivePage'
import { ShareModalPage } from '../pages/ShareModalPage'
import { SharedDriveModalPage } from '../pages/SharedDriveModalPage'
import { SharedDrivePage } from '../pages/SharedDrivePage'

const SHARED_DRIVE_NAME = `Shared Drive ${Date.now()}`
const FOLDER_INSIDE = `Inside Folder ${Date.now()}`

test.describe.serial('Shared Drives', () => {
  test('Alice creates a shared drive and it shows up in Sharings', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')

    await page.goto(`${USERS.alice.appUrl}/#/sharings?tab=1`)
    const sharedDrive = new SharedDrivePage(page)
    const modal = new SharedDriveModalPage(page)
    const drive = new DrivePage(page)

    await sharedDrive.clickCreate()
    await modal.waitForOpen()
    await modal.setName(SHARED_DRIVE_NAME)
    await modal.confirm()
    await modal.waitForClose()

    await expect(drive.getFileByName(SHARED_DRIVE_NAME)).toBeVisible({
      timeout: 15_000
    })

    await ctx.close()
  })

  test('Alice invites Bob and the share auto-accepts on his side', async ({
    browser
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    await authenticate(alice, 'alice')

    await alice.goto(`${USERS.alice.appUrl}/#/sharings?tab=1`)
    const aliceDrive = new DrivePage(alice)
    await aliceDrive.clickFile(SHARED_DRIVE_NAME)
    // Owner-side URL is /folder/<id>; recipient-side is /shareddrive/...
    // Just wait for the drive name to land in the breadcrumb.
    await expect(alice.getByText(SHARED_DRIVE_NAME).first()).toBeVisible()

    await alice.getByRole('button', { name: /share/i }).click()
    const shareModal = new ShareModalPage(alice)
    await shareModal.waitForOpen()
    await shareModal.addMember(USERS.bob.email)
    await shareModal.share()
    await aliceCtx.close()

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await authenticate(bob, 'bob')

    const bobDrive = new DrivePage(bob)
    await expect(async () => {
      await bob.goto(`${USERS.bob.appUrl}/#/sharings?tab=1`)
      await expect(bobDrive.getFileByName(SHARED_DRIVE_NAME)).toBeVisible({
        timeout: 5_000
      })
    }).toPass({ timeout: 30_000 })

    await bobCtx.close()
  })

  test('Bob can browse content Alice puts inside the shared drive', async ({
    browser
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    await authenticate(alice, 'alice')

    await alice.goto(`${USERS.alice.appUrl}/#/sharings?tab=1`)
    const aliceDrive = new DrivePage(alice)
    await aliceDrive.clickFile(SHARED_DRIVE_NAME)
    await expect(alice.getByText(SHARED_DRIVE_NAME).first()).toBeVisible()

    await aliceDrive.createFolder(FOLDER_INSIDE)
    await aliceCtx.close()

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await authenticate(bob, 'bob')

    const bobDrive = new DrivePage(bob)
    await expect(async () => {
      await bob.goto(`${USERS.bob.appUrl}/#/sharings?tab=1`)
      await bobDrive.clickFile(SHARED_DRIVE_NAME)
      await expect(bob.getByText(SHARED_DRIVE_NAME).first()).toBeVisible({
        timeout: 5_000
      })
      await bobDrive.waitForFileVisible(FOLDER_INSIDE)
    }).toPass({ timeout: 30_000 })

    await bobCtx.close()
  })
})
