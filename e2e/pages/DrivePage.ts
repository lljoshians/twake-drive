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

  async clickFile(name: string): Promise<void> {
    await this.getFileByName(name).click()
  }

  async waitForFileVisible(name: string): Promise<void> {
    await this.getFileByName(name).waitFor({ state: 'visible' })
  }
}
