import type { Page, Locator } from '@playwright/test'

export class SidebarPage {
  private readonly page: Page
  private readonly nav: Locator

  constructor(page: Page) {
    this.page = page
    this.nav = page.locator('nav')
  }

  async goToSharings(): Promise<void> {
    await this.nav.getByRole('link', { name: /sharing/i }).click()
  }

  async goToDrive(): Promise<void> {
    await this.nav.getByRole('link', { name: /drive/i }).first().click()
  }

  getSharedDriveLink(name: string): Locator {
    return this.nav.getByRole('link', { name })
  }

  async clickSharedDrive(name: string): Promise<void> {
    await this.getSharedDriveLink(name).click()
  }
}
