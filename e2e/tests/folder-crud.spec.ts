import { copyFile, unlink } from 'fs/promises'
import path from 'path'

import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { USERS } from '../helpers/config'
import { DrivePage } from '../pages/DrivePage'
import { SidebarPage } from '../pages/SidebarPage'

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'sample.txt')

const ALICE_ROOT = `${USERS.alice.appUrl}/#/folder`
const ALICE_TRASH = `${USERS.alice.appUrl}/#/trash`

const stamp = (): string => Date.now().toString()

test.describe('Folder CRUD', () => {
  test('creates a folder via the Add menu', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const name = `Folder ${stamp()}`
    await drive.createFolder(name)
    await expect(drive.getFileByName(name)).toBeVisible()

    await ctx.close()
  })

  test('renames a folder via the row action menu', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const original = `Old ${stamp()}`
    const renamed = `Renamed ${stamp()}`
    await drive.createFolder(original)
    await drive.rename(original, renamed)
    await expect(drive.getFileByName(renamed)).toBeVisible()

    await ctx.close()
  })

  test('moves a folder into a sibling folder', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const target = `Destination ${stamp()}`
    const moved = `Movable ${stamp()}`
    await drive.createFolder(target)
    await drive.createFolder(moved)
    await drive.moveTo(moved, target)
    await drive.waitForFileHidden(moved)
    await drive.clickFile(target)
    await page.waitForURL(/\/folder\/[^/]+$/)
    await expect(drive.getFileByName(moved)).toBeVisible()

    await ctx.close()
  })

  test('duplicates a file via the row action menu', async ({ browser }) => {
    // Folder duplication isn't a feature (see actions/components/duplicateTo —
    // displayCondition gates the entry on `isFile(...)`); upload a file first.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const fileName = `dup-${stamp()}.txt`
    const stem = fileName.replace(/\.txt$/, '')
    const filePath = path.join(path.dirname(FIXTURE), fileName)
    await copyFile(FIXTURE, filePath)
    try {
      await drive.uploadFiles(filePath)
      await drive.waitForFileVisible(fileName)
      await drive.duplicate(fileName)
      // cozy-drive auto-renames the copy ("dup-XXX (2).txt"); match by stem.
      await expect(
        drive.fileList
          .getByTestId('fil-file-filename-and-ext')
          .filter({ hasText: stem })
      ).toHaveCount(2, { timeout: 10_000 })
    } finally {
      await unlink(filePath).catch(() => undefined)
    }

    await ctx.close()
  })

  test('deletes a folder to trash and restores it', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const sidebar = new SidebarPage(page)
    const name = `Trashable ${stamp()}`

    await drive.createFolder(name)
    await drive.sendToTrash(name)
    await expect(drive.getFileByName(name)).toHaveCount(0)

    await sidebar.goToTrash()
    await page.waitForURL(/\/trash/)
    await drive.waitForFileVisible(name)

    await drive.restore(name)
    await page.goto(ALICE_ROOT)
    await expect(drive.getFileByName(name)).toBeVisible()

    await ctx.close()
  })
})
