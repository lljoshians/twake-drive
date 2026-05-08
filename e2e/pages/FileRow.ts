import type { Page, Locator } from '@playwright/test'

interface ConfirmDialog {
  button: RegExp
  /** `required`: the dialog always shows up. `optional`: only confirm when
   * a dialog is visible (some actions skip it when there's nothing to
   * warn about). */
  wait: 'required' | 'optional'
}

/**
 * Handle for a single row in the Drive file list. Returned from
 * `DrivePage.row(name)` so per-name action methods need only the values
 * specific to the action — the row already knows which file it is.
 *
 * Note: every menuitem regex below assumes the UI is in English.
 */
export class FileRow {
  constructor(
    private readonly page: Page,
    private readonly fileList: Locator,
    private readonly name: string
  ) {}

  /** Locator for the row's filename cell — exposed so tests can assert
   * visibility / count without going through a wrapper method. */
  get cell(): Locator {
    return this.fileList
      .getByTestId('fil-file-filename-and-ext')
      .filter({ hasText: this.name })
  }

  private get rowEl(): Locator {
    // Each row is a plain <div> with no semantic role; locate the closest
    // ancestor that contains the per-row "More" button — that's the row.
    return this.cell.locator(
      'xpath=ancestor::*[.//button[@aria-label="More"]][1]'
    )
  }

  async waitVisible(): Promise<void> {
    await this.cell.waitFor({ state: 'visible' })
  }

  async waitHidden(): Promise<void> {
    await this.cell.waitFor({ state: 'hidden' })
  }

  /** cozy-drive desktop semantics: single-click selects, double-click
   * navigates / opens. See src/hooks/useOnLongPress/helpers.js handleClick. */
  async open(): Promise<void> {
    await this.fileList
      .getByRole('link')
      .filter({ hasText: this.name })
      .first()
      .dblclick()
  }

  async openMenu(): Promise<Locator> {
    await this.rowEl.getByRole('button', { name: 'More' }).click()
    return this.page.getByRole('menu')
  }

  private async runAction(
    menuItem: RegExp,
    confirm?: ConfirmDialog
  ): Promise<void> {
    const menu = await this.openMenu()
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

  async rename(newName: string): Promise<void> {
    const menu = await this.openMenu()
    await menu.getByRole('menuitem', { name: /^rename$/i }).click()
    const input = this.page.getByTestId('name-input').locator('input')
    await input.waitFor({ state: 'visible' })
    await input.fill(newName)
    await input.press('Enter')
    await this.fileList
      .getByTestId('fil-file-filename-and-ext')
      .filter({ hasText: newName })
      .waitFor({ state: 'visible' })
  }

  async moveTo(targetFolder: string): Promise<void> {
    const menu = await this.openMenu()
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

  async duplicate(): Promise<void> {
    await this.runAction(/duplicate/i, {
      button: /duplicate|confirm|ok/i,
      wait: 'optional'
    })
  }

  async sendToTrash(): Promise<void> {
    await this.runAction(/^remove$/i, {
      button: /^remove$/i,
      wait: 'required'
    })
    await this.waitHidden()
  }

  async addToFavorites(): Promise<void> {
    await this.runAction(/add to favorites/i)
  }

  async restore(): Promise<void> {
    await this.runAction(/^restore$/i)
    await this.waitHidden()
  }
}
