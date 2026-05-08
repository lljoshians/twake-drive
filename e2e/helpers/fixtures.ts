import { unlink } from 'fs/promises'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { authenticate } from './auth'
import { DrivePage } from '../pages/DrivePage'

type AuthedFixtures = {
  alicePage: Page
  bobPage: Page
  aliceDrive: DrivePage
  bobDrive: DrivePage
}

const userPageFixture =
  (user: 'alice' | 'bob') =>
  async (
    { browser }: { browser: import('@playwright/test').Browser },
    use: (page: Page) => Promise<void>
  ): Promise<void> => {
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      await authenticate(page, user)
      await use(page)
    } finally {
      await ctx.close()
    }
  }

export const test = base.extend<AuthedFixtures>({
  alicePage: userPageFixture('alice'),
  bobPage: userPageFixture('bob'),
  aliceDrive: async ({ alicePage }, use) => {
    await use(new DrivePage(alicePage))
  },
  bobDrive: async ({ bobPage }, use) => {
    await use(new DrivePage(bobPage))
  }
})

export { expect }

let stampCounter = 0
/** Monotonic, collision-resistant identifier for unique fixture names. */
export const stamp = (): string =>
  `${Date.now()}-${process.pid}-${++stampCounter}`

/** Best-effort file deletion — swallows ENOENT so finally-blocks stay clean,
 *  but lets permission / path errors propagate so they aren't silently lost. */
export const safeUnlink = async (filePath: string): Promise<void> => {
  try {
    await unlink(filePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

/** Escape regex metacharacters so a literal name can be used in a RegExp. */
export const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
