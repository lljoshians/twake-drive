import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { createFolder, createFile } from '../helpers/stack-api'
import { DrivePage } from '../pages/DrivePage'
import { SharedDriveModalPage } from '../pages/SharedDriveModalPage'
import { ShareModalPage } from '../pages/ShareModalPage'
import { SharedDrivePage } from '../pages/SharedDrivePage'
import { SidebarPage } from '../pages/SidebarPage'

const ALICE_URL = 'http://alice.cozy.localhost:8080'
const BOB_URL = 'http://bob.cozy.localhost:8080'
const SHARED_DRIVE_NAME = `Test Drive ${Date.now()}`

test.describe.serial('Shared Drives', () => {
  test('Alice creates a shared drive', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await authenticate(page, 'alice')

    // Navigate to sharings — fresh instance so the view is empty,
    // which means the CreateSharedDriveButton ("Create") is visible
    await page.goto(`${ALICE_URL}/#/sharings`)
    const sidebar = new SidebarPage(page)
    const sharedDrivePage = new SharedDrivePage(page)
    const modal = new SharedDriveModalPage(page)

    // Click create shared drive
    await sharedDrivePage.clickCreate()
    await modal.waitForOpen()
    await modal.setName(SHARED_DRIVE_NAME)
    await modal.confirm()
    await modal.waitForClose()

    // Verify shared drive appears in sidebar (desktop only — viewport is 1280x720)
    await expect(sidebar.getSharedDriveLink(SHARED_DRIVE_NAME)).toBeVisible()

    await context.close()
  })

  test('Alice invites Bob and sharing is auto-accepted', async ({
    browser,
  }) => {
    // Alice: open the shared drive and share it
    const aliceCtx = await browser.newContext()
    const alicePage = await aliceCtx.newPage()
    await authenticate(alicePage, 'alice')

    await alicePage.goto(`${ALICE_URL}/#/sharings`)
    const aliceSidebar = new SidebarPage(alicePage)
    await aliceSidebar.clickSharedDrive(SHARED_DRIVE_NAME)

    // Click the Share button in the toolbar — this navigates to ../share route
    // which opens the ShareModal (different from SharedDriveModal used for creation)
    await alicePage.getByRole('button', { name: /share/i }).click()

    const shareModal = new ShareModalPage(alicePage)
    await shareModal.waitForOpen()
    await shareModal.addMember('bob@cozy.localhost')
    await shareModal.confirm()
    await shareModal.waitForClose()

    // Bob: verify shared drive appears (auto-accepted via trusted context)
    const bobCtx = await browser.newContext()
    const bobPage = await bobCtx.newPage()
    await authenticate(bobPage, 'bob')

    await bobPage.goto(`${BOB_URL}/#/sharings`)
    const bobSidebar = new SidebarPage(bobPage)

    // Wait for the shared drive to appear — may take a moment for sync
    // Use expect.toPass with page reload to handle async propagation
    await expect(async () => {
      await bobPage.reload()
      await expect(
        bobSidebar.getSharedDriveLink(SHARED_DRIVE_NAME)
      ).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 15_000 })

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('Bob can browse inside the shared drive', async ({ browser }) => {
    // Alice creates test content via API
    // Navigate as Alice to get the shared drive folder ID
    const aliceCtx = await browser.newContext()
    const alicePage = await aliceCtx.newPage()
    await authenticate(alicePage, 'alice')

    await alicePage.goto(`${ALICE_URL}/#/sharings`)
    const aliceSidebar = new SidebarPage(alicePage)
    await aliceSidebar.clickSharedDrive(SHARED_DRIVE_NAME)

    // Extract the folder ID from the URL
    // URL format: http://alice.cozy.localhost:8080/#/shareddrive/:driveId/:folderId
    await alicePage.waitForURL(/shareddrive/)
    const hash = new URL(alicePage.url()).hash // e.g. #/shareddrive/abc123/def456
    const match = hash.match(/\/shareddrive\/[^/]+\/(.+)/)
    if (!match) throw new Error(`Could not parse folder ID from URL: ${alicePage.url()}`)
    const folderId = match[1]

    // Create test data via API
    await createFolder('alice', 'Test Folder', folderId)
    await createFile('alice', 'test-file.txt', 'Hello from Alice', folderId)

    await aliceCtx.close()

    // Bob navigates into the shared drive
    const bobCtx = await browser.newContext()
    const bobPage = await bobCtx.newPage()
    await authenticate(bobPage, 'bob')

    await bobPage.goto(`${BOB_URL}/#/sharings`)
    const bobSidebar = new SidebarPage(bobPage)
    await bobSidebar.clickSharedDrive(SHARED_DRIVE_NAME)

    // Verify Bob can see the contents
    const drive = new DrivePage(bobPage)
    await drive.waitForFileVisible('Test Folder')
    await drive.waitForFileVisible('test-file.txt')

    // Verify Bob can navigate into the folder
    await drive.clickFile('Test Folder')
    await bobPage.waitForURL(/shareddrive/)

    await bobCtx.close()
  })
})
