# E2E Testing for Shared Drives

**Date:** 2026-03-18
**Status:** Approved

## Goal

Set up end-to-end testing infrastructure for the Shared Drives feature in Twake Drive. Tests must run against a real cozy-stack instance, support multi-user scenarios (Alice and Bob), feature flag toggling, and work both locally and in GitHub Actions CI.

## V1 Scope

Three test scenarios:

1. **Alice creates a shared drive** — verifies it appears in her sidebar
2. **Alice invites Bob, Bob accepts** — Bob receives and accepts the invitation
3. **Bob browses inside the shared drive** — Bob can see files/folders that Alice created

## Architecture

### Infrastructure: Docker Compose

A `docker-compose.e2e.yml` at the project root spins up the test environment:

- **CouchDB** (`couchdb:3`) — database backend for cozy-stack
- **cozy-stack** (`cozy/cozy-stack`) — the Cozy platform server

The cozy-stack service mounts:
- `./build/drive` as the installed Drive app
- `./e2e/cozy.yml` as the stack configuration

Stack configuration uses flat subdomains so instances are addressed as `alice.cozy.localhost:8080` and `bob.cozy.localhost:8080`.

### Test Setup & Instance Management

**Playwright `globalSetup` (`e2e/setup/global-setup.ts`):**

1. Build the app (or skip if `build/drive` exists)
2. Start containers via `docker compose up -d --wait`
3. Poll `http://localhost:8080/version` until cozy-stack is ready
4. Create instances:
   - `cozy-stack instances add alice.cozy.localhost --passphrase alice1234 --apps drive`
   - `cozy-stack instances add bob.cozy.localhost --passphrase bob1234 --apps drive`
5. Generate session tokens via `cozy-stack instances token-cli`, save to shared state file
6. Set feature flags via `cozy-stack features flags` CLI

**Playwright `globalTeardown` (`e2e/setup/global-teardown.ts`):**

- Runs `docker compose down -v` to destroy containers and volumes

### Playwright Configuration

**`e2e/playwright.config.ts`:**

- `globalSetup` and `globalTeardown` wired to the files above
- `baseURL: http://alice.cozy.localhost:8080`
- `testDir: ./e2e/tests`
- Single project: Chromium only (V1)
- Timeouts: 30s per test, 5 min global setup

### Multi-User Pattern

Each test involving multiple users creates two isolated `BrowserContext`s — one per user, each with its own cookies and session state:

```ts
test('Alice creates shared drive and Bob accepts', async ({ browser }) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();

  const alicePage = await alice.newPage();
  const bobPage = await bob.newPage();

  await authenticate(alicePage, 'alice');
  await authenticate(bobPage, 'bob');

  // Test scenario...
});
```

**Authentication:** The `authenticate(page, user)` helper injects session tokens (generated during global setup) as cookies, bypassing the login UI entirely.

### Page Object Model

Page objects in `e2e/pages/` provide thin wrappers over Playwright selectors:

| Page Object | Responsibility |
|---|---|
| `DrivePage.ts` | Navigate folders, view file lists, check file/folder presence |
| `SharedDrivePage.ts` | Create shared drive, invite user, list shared drives |
| `SharingDialogPage.ts` | Sharing/invitation modal interactions |
| `SidebarPage.ts` | Sidebar navigation (Shared Drives section) |

### Test Helpers

Helpers in `e2e/helpers/`:

- **`auth.ts`** — `authenticate(page, user)` injects session cookie
- **`cozy-client.ts`** — thin wrapper for cozy-stack API calls (create folders, upload files) used for test data setup without going through the UI
- **`flags.ts`** — `setFlags(instance, flags)` wraps `docker compose exec cozystack cozy-stack features flags` for toggling feature flags in `test.beforeAll()`

### Test Files

Tests in `e2e/tests/`:

- **`shared-drive-create.spec.ts`** — Alice creates a shared drive, verifies it in sidebar
- **`shared-drive-invite.spec.ts`** — Alice invites Bob, Bob accepts
- **`shared-drive-browse.spec.ts`** — Bob navigates into the shared drive and sees contents

## File Structure

```
e2e/
├── cozy.yml                       # cozy-stack configuration
├── setup/
│   ├── global-setup.ts
│   └── global-teardown.ts
├── helpers/
│   ├── auth.ts
│   ├── cozy-client.ts
│   └── flags.ts
├── pages/
│   ├── DrivePage.ts
│   ├── SharedDrivePage.ts
│   ├── SharingDialogPage.ts
│   └── SidebarPage.ts
├── tests/
│   ├── shared-drive-create.spec.ts
│   ├── shared-drive-invite.spec.ts
│   └── shared-drive-browse.spec.ts
└── playwright.config.ts
docker-compose.e2e.yml
```

## Feature Flags

Feature flags are managed per-instance via `cozy-stack features flags` CLI. The `setFlags()` helper can be called in `test.beforeAll()` to enable or disable flags before a test suite runs. This allows testing different flag combinations without restarting the stack.

## CI: GitHub Actions

A new workflow at `.github/workflows/e2e.yml`, separate from the existing `ci-cd.yml`:

- **Triggers:** Pull requests + manual `workflow_dispatch`
- **Runner:** `ubuntu-latest` (Docker pre-installed)
- **Steps:**
  1. Checkout
  2. Setup Node.js (from `.nvmrc`)
  3. `yarn install`
  4. `yarn build`
  5. `npx playwright install chromium`
  6. `yarn e2e`
  7. Upload Playwright HTML report + trace files as artifacts on failure

The E2E workflow is separate so it doesn't slow down the fast lint/unit/build feedback loop in `ci-cd.yml`. It can be made a required check on PRs once the suite is stable.

## Design Decisions

- **Docker Compose over Testcontainers** — simpler, more debuggable, no extra dependencies
- **Clean state per run** — containers destroyed and recreated rather than snapshot-based, avoids stale state issues
- **Session tokens over login UI** — faster tests, focused on testing sharing flows not authentication
- **Page Object Model** — abstracts selectors from test logic, makes tests resilient to UI changes
- **Chromium only for V1** — keeps the suite fast; Firefox/WebKit can be added later
- **Separate CI workflow** — E2E tests are slow; they shouldn't block fast feedback
