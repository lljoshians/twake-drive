import type { Page, Locator } from '@playwright/test'

/**
 * Page object for the Drive file list view (My Drive, Trash, inside a folder
 * or shared drive — anything that renders the standard fil-content-body).
 *
 * Note on locale: every menuitem regex below assumes the UI is in English.
 * Tests run against an instance created with Locale=en in global-setup.
 */
export class DrivePage {
  private readonly page: Page
  private readonly fileList: Locator

  constructor(page: Page) {
    this.page = page
    this.fileList = page.getByTestId('fil-content-body')
  }

  getFileByName(name: string): Locator {
    return this.fileList
      .getByTestId('fil-file-filename-and-ext')
      .filter({ hasText: name })
  }

  /** Matches every row whose filename cell contains the given substring —
   *  use for "the original and its (1) copy" style assertions. */
  getFilesMatching(stem: string): Locator {
    return this.fileList
      .getByTestId('fil-file-filename-and-ext')
      .filter({ hasText: stem })
  }

  getFileRow(name: string): Locator {
    // Each row is a plain <div> with no semantic role; locate the closest
    // ancestor that contains the per-row "More" button — that's the row.
    return this.getFileByName(name).locator(
      'xpath=ancestor::*[.//button[@aria-label="More"]][1]'
    )
  }

  getRowMoreButton(name: string): Locator {
    return this.getFileRow(name).getByRole('button', { name: 'More' })
  }

  async clickFile(name: string): Promise<void> {
    // cozy-drive desktop semantics: single-click selects the row, double-click
    // navigates / opens. See src/hooks/useOnLongPress/helpers.js handleClick.
    await this.fileList
      .getByRole('link')
      .filter({ hasText: name })
      .first()
      .dblclick()
  }

  async waitForFileVisible(name: string): Promise<void> {
    await this.getFileByName(name).waitFor({ state: 'visible' })
  }

  async waitForFileHidden(name: string): Promise<void> {
    await this.getFileByName(name).waitFor({ state: 'hidden' })
  }

  async createFolder(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Create' }).click()
    await this.page.getByTestId('add-folder-link').click()
    const input = this.page.getByTestId('name-input').locator('input')
    await input.waitFor({ state: 'visible' })
    await input.fill(name)
    await input.press('Enter')
    await this.waitForFileVisible(name)
  }

  async openRowActionMenu(name: string): Promise<Locator> {
    await this.getRowMoreButton(name).click()
    return this.page.getByRole('menu')
  }

  /** Pick a row action and dismiss its confirmation dialog (if any).
   *
   * `confirm: 'required'` waits for the dialog to appear; `'optional'`
   * proceeds only if it's already visible (some actions skip the confirm
   * when there's nothing to warn about). */
  private async runRowAction(
    name: string,
    menuItem: RegExp,
    confirm?: { button: RegExp; wait: 'required' | 'optional' }
  ): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: menuItem }).click()
    if (!confirm) return

    const dialog = this.page.getByRole('dialog')
    if (confirm.wait === 'required') {
      await dialog.waitFor({ state: 'visible' })
    } else if (!(await dialog.isVisible().catch(() => false))) {
      return
    }
    await dialog.getByRole('button', { name: confirm.button }).click()
    await dialog.waitFor({ state: 'hidden' })
  }

  async rename(oldName: string, newName: string): Promise<void> {
    const menu = await this.openRowActionMenu(oldName)
    await menu.getByRole('menuitem', { name: /^rename$/i }).click()
    const input = this.page.getByTestId('name-input').locator('input')
    await input.waitFor({ state: 'visible' })
    await input.fill(newName)
    await input.press('Enter')
    await this.waitForFileVisible(newName)
  }

  async moveTo(name: string, targetFolder: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /move to/i }).click()
    const dialog = this.page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog
      .getByRole('button', { name: new RegExp(`^${targetFolder}$`) })
      .first()
      .dblclick()
    await dialog.getByRole('button', { name: /^move$/i }).click()
    await dialog.waitFor({ state: 'hidden' })
  }

  async duplicate(name: string): Promise<void> {
    await this.runRowAction(name, /duplicate/i, {
      button: /duplicate|confirm|ok/i,
      wait: 'optional'
    })
  }

  async sendToTrash(name: string): Promise<void> {
    await this.runRowAction(name, /^remove$/i, {
      button: /^remove$/i,
      wait: 'required'
    })
    await this.waitForFileHidden(name)
  }

  async addToFavorites(name: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /add to favorites/i }).click()
  }

  async restore(name: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /^restore$/i }).click()
    await this.waitForFileHidden(name)
  }

  /** cozy-ui's FileInput spreads extra props onto the underlying <input
   * type=file>, so the `upload-btn` testid lives on the input itself. */
  async uploadFiles(filePaths: string | string[]): Promise<void> {
    await this.page
      .locator('input[data-testid="upload-btn"]')
      .first()
      .setInputFiles(filePaths)
  }
}
