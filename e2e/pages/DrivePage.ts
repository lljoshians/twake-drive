import type { Page, Locator } from '@playwright/test'

export class DrivePage {
  private readonly page: Page
  readonly fileList: Locator

  constructor(page: Page) {
    this.page = page
    this.fileList = page.getByTestId('fil-content-body')
  }

  getFileByName(name: string): Locator {
    return this.fileList
      .getByTestId('fil-file-filename-and-ext')
      .filter({ hasText: name })
  }

  getFileRow(name: string): Locator {
    // Each row is a plain <div> with no semantic role; locate the closest
    // ancestor that contains the per-row "More" button — that's the row.
    return this.getFileByName(name).locator(
      'xpath=ancestor::*[.//button[@aria-label="More"]][1]'
    )
  }

  /** The "More" (kebab) button inside the row for the given file/folder. */
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

  /** Opens the per-row "More" action menu and returns it as a Locator. */
  async openRowActionMenu(name: string): Promise<Locator> {
    await this.getFileByName(name).hover()
    await this.getRowMoreButton(name).click()
    return this.page.getByRole('menu')
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

  /** Moves an item via the row menu → Move to dialog. */
  async moveTo(name: string, targetFolder: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /move to/i }).click()
    const dialog = this.page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog
      .getByRole('button', { name: new RegExp(`^${targetFolder}$`) })
      .first()
      .dblclick()
    await dialog
      .getByRole('button', { name: /^move$/i })
      .click()
    await dialog.waitFor({ state: 'hidden' })
  }

  /** Duplicates an item to the current folder via the row menu. */
  async duplicate(name: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /duplicate/i }).click()
    const dialog = this.page.getByRole('dialog')
    if (await dialog.isVisible().catch(() => false)) {
      await dialog
        .getByRole('button', { name: /duplicate|confirm|ok/i })
        .click()
      await dialog.waitFor({ state: 'hidden' })
    }
  }

  /** Sends an item to Trash via the row menu, confirming the dialog. */
  async sendToTrash(name: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /^remove$/i }).click()
    const dialog = this.page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog.getByRole('button', { name: /^remove$/i }).click()
    await dialog.waitFor({ state: 'hidden' })
    await this.waitForFileHidden(name)
  }

  /** Marks a file as favourite via the row menu. */
  async addToFavorites(name: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /add to favorites/i }).click()
  }

  /** Trash-only: restores a previously-trashed item. */
  async restore(name: string): Promise<void> {
    const menu = await this.openRowActionMenu(name)
    await menu.getByRole('menuitem', { name: /^restore$/i }).click()
    await this.waitForFileHidden(name)
  }

  /** Trash-only: empties the trash via the toolbar. */
  async emptyTrash(): Promise<void> {
    await this.page.getByRole('button', { name: /empty.*trash|delete all/i }).click()
    const dialog = this.page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible' })
    await dialog
      .getByRole('button', { name: /delete all|delete permanently|confirm|ok/i })
      .click()
    await dialog.waitFor({ state: 'hidden' })
  }

  /** Uploads files via the sidebar Upload button's hidden file input.
   *
   * cozy-ui's FileInput spreads extra props onto the underlying <input
   * type=file>, so the `upload-btn` testid lives on the input itself. */
  async uploadFiles(filePaths: string | string[]): Promise<void> {
    await this.page
      .locator('input[data-testid="upload-btn"]')
      .first()
      .setInputFiles(filePaths)
  }
}
