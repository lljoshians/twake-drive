import { copyFile, unlink } from 'fs/promises'
import path from 'path'

import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { USERS } from '../helpers/config'
import { DrivePage } from '../pages/DrivePage'
import { SidebarPage } from '../pages/SidebarPage'

const ALICE_ROOT = `${USERS.alice.appUrl}/#/folder`
const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'sample.txt')

const stamp = (): string => Date.now().toString()

test.describe('Navigation surfaces', () => {
  test('Recent: a freshly uploaded file shows up at /#/recent', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const sidebar = new SidebarPage(page)
    const file = path.join(path.dirname(FIXTURE), `recent-${stamp()}.txt`)
    await copyFile(FIXTURE, file)
    try {
      await drive.uploadFiles(file)
      const fileName = path.basename(file)
      await drive.waitForFileVisible(fileName)

      await sidebar.goToRecent()
      await page.waitForURL(/\/recent/)
      await drive.waitForFileVisible(fileName)
    } finally {
      await unlink(file).catch(() => undefined)
    }

    await ctx.close()
  })

  test('Favorites: a favourited file appears in /#/favorites', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const sidebar = new SidebarPage(page)
    const file = path.join(path.dirname(FIXTURE), `fav-${stamp()}.txt`)
    await copyFile(FIXTURE, file)
    try {
      await drive.uploadFiles(file)
      const fileName = path.basename(file)
      await drive.waitForFileVisible(fileName)
      await drive.addToFavorites(fileName)

      await sidebar.goToFavorites()
      await page.waitForURL(/\/favorites/)
      await drive.waitForFileVisible(fileName)
    } finally {
      await unlink(file).catch(() => undefined)
    }

    await ctx.close()
  })

  test('Search: a default folder shows up as a suggestion', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')

    // "Photos" is created on instance bootstrap, so the search index already
    // knows about it — this avoids racing the indexer for a freshly-uploaded
    // fixture.
    await page.goto(`${USERS.alice.appUrl}/#/search`)
    const searchInput = page
      .getByRole('textbox', { name: /search/i })
      .first()
    await searchInput.waitFor({ state: 'visible' })
    await searchInput.fill('Photos')
    // The suggestion list shows the file path as a secondary line — using
    // the full path makes the assertion immune to "Photos" appearing as a
    // breadcrumb label or sidebar shortcut.
    await expect(page.getByText('/Photos').first()).toBeVisible({
      timeout: 15_000
    })

    await ctx.close()
  })

  test('Trash: a deleted folder is reachable from the Bin sidebar entry', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const sidebar = new SidebarPage(page)
    const name = `Trashable ${stamp()}`
    await drive.createFolder(name)
    await drive.sendToTrash(name)

    await sidebar.goToTrash()
    await page.waitForURL(/\/trash/)
    await drive.waitForFileVisible(name)

    await ctx.close()
  })
})
