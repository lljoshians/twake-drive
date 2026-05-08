import { copyFile, unlink } from 'fs/promises'
import path from 'path'

import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { USERS } from '../helpers/config'
import { DrivePage } from '../pages/DrivePage'
import { FileViewerPage } from '../pages/FileViewerPage'
import { UploadQueuePage } from '../pages/UploadQueuePage'

const ALICE_ROOT = `${USERS.alice.appUrl}/#/folder`
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures')
const SAMPLE = path.join(FIXTURE_DIR, 'sample.txt')
const NOTES = path.join(FIXTURE_DIR, 'notes.txt')

const stamp = (): string => Date.now().toString()
const safeUnlink = (p: string): Promise<void> =>
  unlink(p).catch(() => undefined) as Promise<void>

test.describe('Upload & file viewer', () => {
  test('uploads a single file via the Upload button', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const uniqueName = `sample-${stamp()}.txt`
    const fixturePath = path.join(FIXTURE_DIR, uniqueName)
    await copyFile(SAMPLE, fixturePath)
    try {
      await drive.uploadFiles(fixturePath)
      await drive.waitForFileVisible(uniqueName)
    } finally {
      await safeUnlink(fixturePath)
    }

    await ctx.close()
  })

  test('uploads several files and watches the queue', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const queue = new UploadQueuePage(page)
    const a = path.join(FIXTURE_DIR, `a-${stamp()}.txt`)
    const b = path.join(FIXTURE_DIR, `b-${stamp()}.txt`)
    await copyFile(SAMPLE, a)
    await copyFile(NOTES, b)
    try {
      await drive.uploadFiles([a, b])
      await queue.waitForOpen()
      await queue.waitForItem(path.basename(a))
      await queue.waitForItem(path.basename(b))
      await drive.waitForFileVisible(path.basename(a))
      await drive.waitForFileVisible(path.basename(b))
    } finally {
      await Promise.all([safeUnlink(a), safeUnlink(b)])
    }

    await ctx.close()
  })

  test('opens an uploaded file in the viewer and closes it', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await authenticate(page, 'alice')
    await page.goto(ALICE_ROOT)

    const drive = new DrivePage(page)
    const viewer = new FileViewerPage(page)
    const file = path.join(FIXTURE_DIR, `viewable-${stamp()}.txt`)
    await copyFile(SAMPLE, file)
    try {
      const fileName = path.basename(file)
      await drive.uploadFiles(file)
      await drive.waitForFileVisible(fileName)
      await drive.clickFile(fileName)
      await viewer.waitForOpen()
      await viewer.close()
      await expect(drive.getFileByName(fileName)).toBeVisible()
    } finally {
      await safeUnlink(file)
    }

    await ctx.close()
  })
})
