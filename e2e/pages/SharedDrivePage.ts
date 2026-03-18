import type { Page, Locator } from '@playwright/test'

export class SharedDrivePage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  getCreateButton(): Locator {
    // The CreateSharedDriveButton renders in the Empty view with label "Create"
    return this.page.getByRole('button', { name: /create/i })
  }

  async clickCreate(): Promise<void> {
    await this.getCreateButton().click()
  }

  getSharedDriveInList(name: string): Locator {
    return this.page
      .getByTestId('fil-content-body')
      .getByTestId('fil-file-filename-and-ext')
      .filter({ hasText: name })
  }
}
