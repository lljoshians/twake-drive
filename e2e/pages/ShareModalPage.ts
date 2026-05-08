import type { Page, Locator } from '@playwright/test'

export class ShareModalPage {
  private readonly page: Page
  private readonly dialog: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByRole('dialog')
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' })
  }

  async addMember(email: string): Promise<void> {
    const contactInput = this.dialog.getByRole('textbox').first()
    await contactInput.fill(email)
    // Wait for autocomplete suggestion and select it
    await this.page
      .getByRole('option', { name: new RegExp(email, 'i') })
      .click()
  }

  /** Submits the share form and waits for the modal to close (success). */
  async share(): Promise<void> {
    await this.dialog
      .getByRole('button', { name: /share|send|confirm|ok/i })
      .click()
    await this.dialog.waitFor({ state: 'hidden', timeout: 15_000 })
  }

  async close(): Promise<void> {
    await this.dialog.getByRole('button', { name: /close/i }).click()
    await this.dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  }
}
