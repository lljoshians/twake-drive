# E2E Testing for Shared Drives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Playwright E2E tests against a real cozy-stack (via Docker Compose) to verify the Shared Drives feature: create, invite, browse.

**Architecture:** Docker Compose spins up CouchDB + cozy-stack. Playwright `globalSetup` creates two instances (Alice, Bob) with trusted sharing context, installs the locally-built Drive app, and obtains session cookies. Tests use two `BrowserContext`s with Page Object Model.

**Tech Stack:** Playwright, Docker Compose, cozy-stack, CouchDB, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-e2e-shared-drives-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `docker-compose.e2e.yml` | CouchDB + cozy-stack services |
| `e2e/cozy.yml` | cozy-stack config (flat subdomains, CouchDB URL, trusted sharing context) |
| `e2e/playwright.config.ts` | Playwright config (globalSetup/Teardown, Chromium, timeouts, traces) |
| `e2e/setup/global-setup.ts` | Start containers, create instances, install app, set flags, get cookies |
| `e2e/setup/global-teardown.ts` | Stop and remove containers |
| `e2e/helpers/auth.ts` | `authenticate(page, user)` — inject session cookie into browser context |
| `e2e/helpers/stack-api.ts` | HTTP helpers to call cozy-stack API (create folders, upload files) |
| `e2e/helpers/flags.ts` | `setFlags(instance, flags)` — set feature flags via CLI |
| `e2e/pages/SidebarPage.ts` | Sidebar navigation — click nav items, find shared drives list |
| `e2e/pages/DrivePage.ts` | File list — check file/folder presence, navigate into folders |
| `e2e/pages/SharedDrivePage.ts` | Create shared drive button, shared drive list in sharings view |
| `e2e/pages/SharedDriveModalPage.ts` | Creation modal — name + create shared drive |
| `e2e/pages/ShareModalPage.ts` | Sharing modal — add members to existing shared drive |
| `e2e/tests/shared-drive.spec.ts` | Serial test: create → invite → browse |

---

### Task 1: Docker Compose & cozy-stack config

**Files:**
- Create: `docker-compose.e2e.yml`
- Create: `e2e/cozy.yml`

- [ ] **Step 1: Create `e2e/cozy.yml`**

```yaml
host: 0.0.0.0
port: 8080

admin:
  host: 0.0.0.0
  port: 6060

subdomains: flat

fs:
  url: file:///var/lib/cozy/storage

couchdb:
  url: http://admin:password@couchdb:5984/

mail:
  disable_tls: true
  skip_certificate_validation: true
  host: localhost
  port: 25
  noreply_address: noreply@cozy.localhost
  noreply_name: Cozy Test

contexts:
  test_default:
    sharing:
      auto_accept_trusted: true
      trusted_domains:
        - localhost
        - cozy.localhost
```

- [ ] **Step 2: Create `docker-compose.e2e.yml`**

```yaml
services:
  couchdb:
    image: couchdb:3
    environment:
      COUCHDB_USER: admin
      COUCHDB_PASSWORD: password
    ports:
      - "5984:5984"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:5984/ || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 10

  cozystack:
    image: cozy/cozy-stack
    depends_on:
      couchdb:
        condition: service_healthy
    volumes:
      - ./build:/app/drive
      - ./e2e/cozy.yml:/etc/cozy/cozy.yml
    ports:
      - "8080:8080"
      - "6060:6060"
```

- [ ] **Step 3: Verify Docker Compose starts correctly**

Run: `docker compose -f docker-compose.e2e.yml up -d --wait && sleep 5 && curl -sf http://localhost:8080/version && docker compose -f docker-compose.e2e.yml down -v`

Expected: cozy-stack version JSON output, clean shutdown.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.e2e.yml e2e/cozy.yml
git commit -m "feat(e2e): add Docker Compose and cozy-stack config"
```

---

### Task 2: Playwright setup & package.json

**Files:**
- Modify: `package.json` (add devDependency + script)
- Create: `e2e/playwright.config.ts`
- Create: `e2e/setup/global-setup.ts` (skeleton)
- Create: `e2e/setup/global-teardown.ts`

- [ ] **Step 1: Install Playwright**

Run: `yarn add -D @playwright/test && npx playwright install chromium`

- [ ] **Step 2: Add `e2e` script to `package.json`**

Add to the `"scripts"` section:

```json
"e2e": "playwright test --config e2e/playwright.config.ts"
```

- [ ] **Step 3: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  globalSetup: './setup/global-setup.ts',
  globalTeardown: './setup/global-teardown.ts',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  timeout: 30_000,
  globalTimeout: 300_000,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
})
```

- [ ] **Step 4: Create `e2e/setup/global-teardown.ts`**

```ts
import { execSync } from 'child_process'

export default async function globalTeardown(): Promise<void> {
  console.log('[e2e] Tearing down Docker containers...')
  execSync('docker compose -f docker-compose.e2e.yml down -v', {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
}
```

- [ ] **Step 5: Create `e2e/setup/global-setup.ts` (skeleton — will be completed in Task 3)**

```ts
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const COMPOSE_FILE = 'docker-compose.e2e.yml'
const AUTH_STATE_PATH = path.join(__dirname, '..', '.auth-state.json')
const STACK_URL = 'http://localhost:8080'

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim()
}

async function waitForStack(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/version`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`cozy-stack did not become ready within ${timeoutMs}ms`)
}

export default async function globalSetup(): Promise<void> {
  console.log('[e2e] Starting Docker containers...')
  exec(`docker compose -f ${COMPOSE_FILE} up -d --wait`)

  console.log('[e2e] Waiting for cozy-stack...')
  await waitForStack(STACK_URL)

  // TODO: create instances, install app, set flags, get cookies (Task 3)

  console.log('[e2e] Setup complete.')
}
```

- [ ] **Step 6: Commit**

```bash
git add e2e/playwright.config.ts e2e/setup/global-setup.ts e2e/setup/global-teardown.ts package.json yarn.lock
git commit -m "feat(e2e): add Playwright config, global setup/teardown skeleton"
```

---

### Task 3: Global setup — instances, app install, flags, auth

**Files:**
- Modify: `e2e/setup/global-setup.ts`
- Create: `e2e/helpers/auth.ts`
- Create: `e2e/helpers/flags.ts`

- [ ] **Step 1: Create `e2e/helpers/auth.ts`**

```ts
import * as fs from 'fs'
import * as path from 'path'
import type { Page } from '@playwright/test'

const AUTH_STATE_PATH = path.join(__dirname, '..', '.auth-state.json')

interface AuthState {
  [user: string]: {
    domain: string
    cookie: string
  }
}

export function loadAuthState(): AuthState {
  return JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf-8'))
}

export function saveAuthState(state: AuthState): void {
  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2))
}

export async function authenticate(page: Page, user: string): Promise<void> {
  const state = loadAuthState()
  const { domain, cookie } = state[user]
  await page.context().addCookies([
    {
      name: 'cozysessid',
      value: cookie,
      domain,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}
```

- [ ] **Step 2: Create `e2e/helpers/flags.ts`**

```ts
import { execSync } from 'child_process'

const COMPOSE_FILE = 'docker-compose.e2e.yml'

export function setFlags(
  instance: string,
  flags: Record<string, boolean | string | number>
): void {
  const flagsJson = JSON.stringify(flags)
  execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T cozystack cozy-stack features flags ${instance} '${flagsJson}'`,
    { encoding: 'utf-8', cwd: process.cwd() }
  )
}
```

- [ ] **Step 3: Complete `e2e/setup/global-setup.ts` — instance creation, app install, flags, cookies**

Replace the TODO section in global-setup.ts with the full implementation:

```ts
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { saveAuthState } from '../helpers/auth'
import { setFlags } from '../helpers/flags'

const COMPOSE_FILE = 'docker-compose.e2e.yml'
const STACK_URL = 'http://localhost:8080'

const USERS = {
  alice: { domain: 'alice.cozy.localhost', passphrase: 'alice1234' },
  bob: { domain: 'bob.cozy.localhost', passphrase: 'bob1234' },
}

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim()
}

function stackExec(cmd: string): string {
  return exec(
    `docker compose -f ${COMPOSE_FILE} exec -T cozystack cozy-stack ${cmd}`
  )
}

async function waitForStack(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/version`)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`cozy-stack did not become ready within ${timeoutMs}ms`)
}

async function getSessionCookie(
  domain: string,
  passphrase: string
): Promise<string> {
  // Get the CSRF token first
  const loginPageRes = await fetch(`http://${domain}:8080/auth/login`)
  const html = await loginPageRes.text()
  const csrfMatch = html.match(/name="csrf_token"\s+value="([^"]+)"/)
  if (!csrfMatch) throw new Error(`Could not find CSRF token for ${domain}`)
  const csrfToken = csrfMatch[1]

  // Extract cookies from the login page response
  const initialCookies = loginPageRes.headers.getSetCookie?.() || []

  // POST to /auth/login with the passphrase
  const res = await fetch(`http://${domain}:8080/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initialCookies.map(c => c.split(';')[0]).join('; '),
    },
    body: new URLSearchParams({
      passphrase: passphrase,
      csrf_token: csrfToken,
    }),
    redirect: 'manual',
  })

  const setCookies = res.headers.getSetCookie?.() || []
  const sessionCookie = setCookies
    .find(c => c.startsWith('cozysessid='))
    ?.match(/cozysessid=([^;]+)/)?.[1]

  if (!sessionCookie) {
    throw new Error(`Failed to get session cookie for ${domain}`)
  }

  return sessionCookie
}

export default async function globalSetup(): Promise<void> {
  console.log('[e2e] Starting Docker containers...')
  exec(`docker compose -f ${COMPOSE_FILE} up -d --wait`)

  console.log('[e2e] Waiting for cozy-stack...')
  await waitForStack(STACK_URL)

  // Create instances
  for (const [name, { domain, passphrase }] of Object.entries(USERS)) {
    console.log(`[e2e] Creating instance for ${name} (${domain})...`)
    stackExec(
      `instances add ${domain} --passphrase ${passphrase} --context-name test_default`
    )
  }

  // Install Drive app from local build
  for (const [name, { domain }] of Object.entries(USERS)) {
    console.log(`[e2e] Installing Drive app for ${name}...`)
    stackExec(
      `apps install drive file:///app/drive --domain ${domain}`
    )
  }

  // Set feature flags
  for (const [name, { domain }] of Object.entries(USERS)) {
    console.log(`[e2e] Setting feature flags for ${name}...`)
    setFlags(domain, { 'drive.shared-drive.enabled': true })
  }

  // Obtain session cookies
  const authState: Record<string, { domain: string; cookie: string }> = {}
  for (const [name, { domain, passphrase }] of Object.entries(USERS)) {
    console.log(`[e2e] Getting session cookie for ${name}...`)
    const cookie = await getSessionCookie(domain, passphrase)
    authState[name] = { domain, cookie }
  }
  saveAuthState(authState)

  console.log('[e2e] Setup complete.')
}
```

- [ ] **Step 4: Add `e2e/.auth-state.json` to `.gitignore`**

Append to `.gitignore`:
```
e2e/.auth-state.json
```

- [ ] **Step 5: Verify the full setup runs end-to-end**

Run: `yarn build && docker compose -f docker-compose.e2e.yml down -v && npx ts-node e2e/setup/global-setup.ts`

Expected: containers start, instances created, app installed, flags set, cookies obtained, `.auth-state.json` written.

Then clean up: `docker compose -f docker-compose.e2e.yml down -v`

- [ ] **Step 6: Commit**

```bash
git add e2e/setup/global-setup.ts e2e/helpers/auth.ts e2e/helpers/flags.ts .gitignore
git commit -m "feat(e2e): complete global setup — instances, app, flags, auth"
```

---

### Task 4: stack-api helper

**Files:**
- Create: `e2e/helpers/stack-api.ts`

- [ ] **Step 1: Create `e2e/helpers/stack-api.ts`**

This helper makes authenticated HTTP calls to cozy-stack for test data setup (create folders, upload files).

```ts
import { loadAuthState } from './auth'

const STACK_PORT = 8080

interface StackApiOptions {
  user: string
}

async function stackFetch(
  user: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const state = loadAuthState()
  const { domain, cookie } = state[user]

  const res = await fetch(`http://${domain}:${STACK_PORT}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: `cozysessid=${cookie}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Stack API ${path} failed (${res.status}): ${body}`)
  }

  return res
}

export async function createFolder(
  user: string,
  name: string,
  parentId = 'io.cozy.files.root-dir'
): Promise<{ id: string; path: string }> {
  const res = await stackFetch(
    user,
    `/files/${parentId}?Name=${encodeURIComponent(name)}&Type=directory`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  )
  const json = await res.json()
  return { id: json.data.id, path: json.data.attributes.path }
}

export async function createFile(
  user: string,
  name: string,
  content: string,
  parentId = 'io.cozy.files.root-dir'
): Promise<{ id: string }> {
  const res = await stackFetch(
    user,
    `/files/${parentId}?Name=${encodeURIComponent(name)}&Type=file`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    }
  )
  const json = await res.json()
  return { id: json.data.id }
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/helpers/stack-api.ts
git commit -m "feat(e2e): add stack-api helper for test data setup"
```

---

### Task 5: Page objects

**Files:**
- Create: `e2e/pages/SidebarPage.ts`
- Create: `e2e/pages/DrivePage.ts`
- Create: `e2e/pages/SharedDrivePage.ts`
- Create: `e2e/pages/SharedDriveModalPage.ts`
- Create: `e2e/pages/ShareModalPage.ts`

**Context for selectors:**
- Sidebar nav uses `<nav>` element with `NavItem` components. Sharings link text from i18n key `Nav.item_sharings`. Shared drives listed under `ListSubheader` with i18n key `Nav.item_external_drives`.
- File list rows have `data-testid="fil-file-filename-and-ext"` for filename text.
- File list body has `data-testid="fil-content-body"`.
- Create shared drive button has a Plus icon and dispatches `SharedDriveModal`.
- Toolbar has `data-testid="fil-toolbar-files"`.

- [ ] **Step 1: Create `e2e/pages/SidebarPage.ts`**

```ts
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
```

- [ ] **Step 2: Create `e2e/pages/DrivePage.ts`**

```ts
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
```

- [ ] **Step 3: Create `e2e/pages/SharedDrivePage.ts`**

The "Create" button only appears in the Empty sharings view (when no shared items exist). Since we use fresh instances, the view starts empty. The button label is the i18n key `button.create` which resolves to "Create".

```ts
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
```

- [ ] **Step 4: Create `e2e/pages/SharedDriveModalPage.ts`**

The `SharedDriveModal` comes from the `cozy-sharing` package. This is the **creation** modal (name the drive + create). Selectors may need adjustment based on the actual DOM rendered by this external component.

```ts
import type { Page, Locator } from '@playwright/test'

export class SharedDriveModalPage {
  private readonly page: Page
  private readonly dialog: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByRole('dialog')
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' })
  }

  async setName(name: string): Promise<void> {
    const input = this.dialog.getByRole('textbox').first()
    await input.fill(name)
  }

  async confirm(): Promise<void> {
    await this.dialog
      .getByRole('button', { name: /create|confirm|ok/i })
      .click()
  }

  async waitForClose(): Promise<void> {
    await this.dialog.waitFor({ state: 'hidden', timeout: 15_000 })
  }
}
```

- [ ] **Step 5: Create `e2e/pages/ShareModalPage.ts`**

This is the **sharing** modal (add members to an existing shared drive). It's a different component (`ShareModal`) from `cozy-sharing`, opened by clicking the Share button in the toolbar. The Share button navigates to a `../share` route which renders the modal.

```ts
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

  async confirm(): Promise<void> {
    await this.dialog
      .getByRole('button', { name: /share|send|confirm|ok/i })
      .click()
  }

  async waitForClose(): Promise<void> {
    await this.dialog.waitFor({ state: 'hidden', timeout: 15_000 })
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add e2e/pages/
git commit -m "feat(e2e): add page objects — Sidebar, Drive, SharedDrive, Modals"
```

---

### Task 6: Write the E2E test spec

**Files:**
- Create: `e2e/tests/shared-drive.spec.ts`

- [ ] **Step 1: Create `e2e/tests/shared-drive.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

import { authenticate } from '../helpers/auth'
import { createFolder, createFile } from '../helpers/stack-api'
import { DrivePage } from '../pages/DrivePage'
import { SharedDriveModalPage } from '../pages/SharedDriveModalPage'
import { ShareModalPage } from '../pages/ShareModalPage'
import { SharedDrivePage } from '../pages/SharedDrivePage'
import { SidebarPage } from '../pages/SidebarPage'

const ALICE_URL = 'http://alice.cozy.localhost:8080'
const BOB_URL = 'http://bob.cozy.localhost:8080'
const SHARED_DRIVE_NAME = `Test Drive ${Date.now()}`

test.describe.serial('Shared Drives', () => {
  test('Alice creates a shared drive', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await authenticate(page, 'alice')

    // Navigate to sharings — fresh instance so the view is empty,
    // which means the CreateSharedDriveButton ("Create") is visible
    await page.goto(`${ALICE_URL}/#/sharings`)
    const sidebar = new SidebarPage(page)
    const sharedDrivePage = new SharedDrivePage(page)
    const modal = new SharedDriveModalPage(page)

    // Click create shared drive
    await sharedDrivePage.clickCreate()
    await modal.waitForOpen()
    await modal.setName(SHARED_DRIVE_NAME)
    await modal.confirm()
    await modal.waitForClose()

    // Verify shared drive appears in sidebar (desktop only — viewport is 1280x720)
    await expect(sidebar.getSharedDriveLink(SHARED_DRIVE_NAME)).toBeVisible()

    await context.close()
  })

  test('Alice invites Bob and sharing is auto-accepted', async ({
    browser,
  }) => {
    // Alice: open the shared drive and share it
    const aliceCtx = await browser.newContext()
    const alicePage = await aliceCtx.newPage()
    await authenticate(alicePage, 'alice')

    await alicePage.goto(`${ALICE_URL}/#/sharings`)
    const aliceSidebar = new SidebarPage(alicePage)
    await aliceSidebar.clickSharedDrive(SHARED_DRIVE_NAME)

    // Click the Share button in the toolbar — this navigates to ../share route
    // which opens the ShareModal (different from SharedDriveModal used for creation)
    await alicePage.getByRole('button', { name: /share/i }).click()

    const shareModal = new ShareModalPage(alicePage)
    await shareModal.waitForOpen()
    await shareModal.addMember('bob@cozy.localhost')
    await shareModal.confirm()
    await shareModal.waitForClose()

    // Bob: verify shared drive appears (auto-accepted via trusted context)
    const bobCtx = await browser.newContext()
    const bobPage = await bobCtx.newPage()
    await authenticate(bobPage, 'bob')

    await bobPage.goto(`${BOB_URL}/#/sharings`)
    const bobSidebar = new SidebarPage(bobPage)

    // Wait for the shared drive to appear — may take a moment for sync
    // Use expect.poll with page reload to handle async propagation
    await expect(async () => {
      await bobPage.reload()
      await expect(
        bobSidebar.getSharedDriveLink(SHARED_DRIVE_NAME)
      ).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 15_000 })

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('Bob can browse inside the shared drive', async ({ browser }) => {
    // Alice creates test content via API
    // Navigate as Alice to get the shared drive folder ID
    const aliceCtx = await browser.newContext()
    const alicePage = await aliceCtx.newPage()
    await authenticate(alicePage, 'alice')

    await alicePage.goto(`${ALICE_URL}/#/sharings`)
    const aliceSidebar = new SidebarPage(alicePage)
    await aliceSidebar.clickSharedDrive(SHARED_DRIVE_NAME)

    // Extract the folder ID from the URL
    // URL format: http://alice.cozy.localhost:8080/#/shareddrive/:driveId/:folderId
    await alicePage.waitForURL(/shareddrive/)
    const hash = new URL(alicePage.url()).hash // e.g. #/shareddrive/abc123/def456
    const match = hash.match(/\/shareddrive\/[^/]+\/(.+)/)
    if (!match) throw new Error(`Could not parse folder ID from URL: ${alicePage.url()}`)
    const folderId = match[1]

    // Create test data via API
    await createFolder('alice', 'Test Folder', folderId)
    await createFile('alice', 'test-file.txt', 'Hello from Alice', folderId)

    await aliceCtx.close()

    // Bob navigates into the shared drive
    const bobCtx = await browser.newContext()
    const bobPage = await bobCtx.newPage()
    await authenticate(bobPage, 'bob')

    await bobPage.goto(`${BOB_URL}/#/sharings`)
    const bobSidebar = new SidebarPage(bobPage)
    await bobSidebar.clickSharedDrive(SHARED_DRIVE_NAME)

    // Verify Bob can see the contents
    const drive = new DrivePage(bobPage)
    await drive.waitForFileVisible('Test Folder')
    await drive.waitForFileVisible('test-file.txt')

    // Verify Bob can navigate into the folder
    await drive.clickFile('Test Folder')
    await bobPage.waitForURL(/shareddrive/)

    await bobCtx.close()
  })
})
```

- [ ] **Step 2: Run the tests locally**

Run: `yarn build && yarn e2e`

Expected: All 3 tests pass. If selectors don't match, adjust page objects based on actual DOM. Use `npx playwright test --headed` to debug visually.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/shared-drive.spec.ts
git commit -m "feat(e2e): add shared drive test scenarios — create, invite, browse"
```

---

### Task 7: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create `.github/workflows/e2e.yml`**

```yaml
name: E2E Tests

on:
  pull_request:
  workflow_dispatch:

jobs:
  e2e:
    name: Shared Drives E2E
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Build Drive app
        run: yarn build

      - name: Install Playwright browsers
        run: npx playwright install chromium

      - name: Run E2E tests
        run: yarn e2e

      - name: Upload test report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

      - name: Upload test traces
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: test-results/
          retention-days: 14
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "feat(e2e): add GitHub Actions workflow for E2E tests"
```

---

### Task 8: Final cleanup & verification

- [ ] **Step 1: Add Playwright output directories to `.gitignore`**

Append:
```
playwright-report/
test-results/
```

- [ ] **Step 2: Run the full E2E suite end-to-end one final time**

Run: `yarn build && yarn e2e`

Expected: All 3 tests pass cleanly. Docker containers start, instances are created, tests run, containers are torn down.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add Playwright output dirs to gitignore"
```
