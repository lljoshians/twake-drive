import { copyFile } from 'fs/promises'
import path from 'path'

import { USERS } from '../helpers/config'
import { test, expect, stamp, safeUnlink } from '../helpers/fixtures'
import { SidebarPage } from '../pages/SidebarPage'

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'sample.txt')
const ALICE_ROOT = `${USERS.alice.appUrl}/#/folder`

test.describe('Folder CRUD', () => {
  test('creates a folder via the Add menu', async ({
    alicePage,
    aliceDrive
  }) => {
    await alicePage.goto(ALICE_ROOT)

    const name = `Folder ${stamp()}`
    await aliceDrive.createFolder(name)
    await expect(aliceDrive.getFileByName(name)).toBeVisible()
  })

  test('renames a folder via the row action menu', async ({
    alicePage,
    aliceDrive
  }) => {
    await alicePage.goto(ALICE_ROOT)

    const original = `Old ${stamp()}`
    const renamed = `Renamed ${stamp()}`
    await aliceDrive.createFolder(original)
    await aliceDrive.rename(original, renamed)
    await expect(aliceDrive.getFileByName(renamed)).toBeVisible()
  })

  test('moves a folder into a sibling folder', async ({
    alicePage,
    aliceDrive
  }) => {
    await alicePage.goto(ALICE_ROOT)

    const target = `Destination ${stamp()}`
    const moved = `Movable ${stamp()}`
    await aliceDrive.createFolder(target)
    await aliceDrive.createFolder(moved)
    await aliceDrive.moveTo(moved, target)
    await aliceDrive.waitForFileHidden(moved)
    await aliceDrive.clickFile(target)
    await alicePage.waitForURL(/\/folder\/[^/]+$/)
    await expect(aliceDrive.getFileByName(moved)).toBeVisible()
  })

  test('duplicates a file via the row action menu', async ({
    alicePage,
    aliceDrive
  }) => {
    // Folder duplication isn't a feature (see actions/components/duplicateTo —
    // displayCondition gates the entry on `isFile(...)`); upload a file first.
    await alicePage.goto(ALICE_ROOT)

    const fileName = `dup-${stamp()}.txt`
    const stem = fileName.replace(/\.txt$/, '')
    const filePath = path.join(path.dirname(FIXTURE), fileName)
    await copyFile(FIXTURE, filePath)
    try {
      await aliceDrive.uploadFiles(filePath)
      await aliceDrive.waitForFileVisible(fileName)
      await aliceDrive.duplicate(fileName)
      // cozy-drive auto-renames the copy ("dup-XXX (2).txt"); match by stem.
      await expect(aliceDrive.getFilesMatching(stem)).toHaveCount(2, {
        timeout: 10_000
      })
    } finally {
      await safeUnlink(filePath)
    }
  })

  test('deletes a folder to trash and restores it', async ({
    alicePage,
    aliceDrive
  }) => {
    await alicePage.goto(ALICE_ROOT)

    const sidebar = new SidebarPage(alicePage)
    const name = `Trashable ${stamp()}`

    await aliceDrive.createFolder(name)
    await aliceDrive.sendToTrash(name)
    await expect(aliceDrive.getFileByName(name)).toHaveCount(0)

    await sidebar.goToTrash()
    await alicePage.waitForURL(/\/trash/)
    await aliceDrive.waitForFileVisible(name)

    await aliceDrive.restore(name)
    await alicePage.goto(ALICE_ROOT)
    await expect(aliceDrive.getFileByName(name)).toBeVisible()
  })
})
