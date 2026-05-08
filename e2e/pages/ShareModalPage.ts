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

  async share(): Promise<void> {
    await this.dialog
      .getByRole('button', { name: /share|send|confirm|ok/i })
      .click()
  }

  /** Waits for the member to appear in the "Who has access" list */
  async waitForMemberVisible(email: string): Promise<void> {
    await this.dialog
      .getByRole('paragraph')
      .filter({ hasText: new RegExp(email, 'i') })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
  }

  async close(): Promise<void> {
    await this.dialog.getByRole('button', { name: /close/i }).click()
    await this.dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  }
}
