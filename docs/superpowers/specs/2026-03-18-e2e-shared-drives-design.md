# E2E Testing for Shared Drives

**Date:** 2026-03-18
**Status:** Approved

## Goal

Set up end-to-end testing infrastructure for the Shared Drives feature in Twake Drive. Tests must run against a real cozy-stack instance, support multi-user scenarios (Alice and Bob), feature flag toggling, and work both locally and in GitHub Actions CI.

## V1 Scope

Three test scenarios, run in serial order (each depends on the previous):

1. **Alice creates a shared drive** — verifies it appears in her sidebar
2. **Alice invites Bob, Bob accepts** — Bob receives and accepts the invitation
3. **Bob browses inside the shared drive** — Alice creates a folder + file via API, Bob navigates and sees them

## Architecture

### Infrastructure: Docker Compose

A `docker-compose.e2e.yml` at the project root spins up the test environment:

- **CouchDB** (`couchdb:3`) — database backend for cozy-stack, with a health check (`curl http://localhost:5984/`)
- **cozy-stack** (`cozy/cozy-stack`) — the Cozy platform server, `depends_on` CouchDB with `condition: service_healthy`

The cozy-stack service mounts:
- `./build` as the built Drive app (build output is at `./build/`, not `./build/drive`)
- `./e2e/cozy.yml` as the stack configuration

**`e2e/cozy.yml` must contain at minimum:**
- `host: 0.0.0.0` and `port: 8080`
- `admin: host: 0.0.0.0, port: 6060`
- `subdomains: flat` (so instances are `alice.cozy.localhost`, `bob.cozy.localhost`)
- `fs: url: file:///var/lib/cozy/storage`
- `couchdb: url: http://admin:password@couchdb:5984/`
- Mail disabled or set to a no-op

**DNS resolution:** Flat subdomains use `*.localhost` which resolves to `127.0.0.1` on Linux (including `ubuntu-latest` CI runners) and modern macOS. Playwright runs on the host (not in a container) and connects to the cozy-stack container via port 8080 exposed to the host. If `*.localhost` doesn't resolve on a given machine, entries must be added to `/etc/hosts`.

### Test Setup & Instance Management

**Playwright `globalSetup` (`e2e/setup/global-setup.ts`):**

1. Build the app (or skip if `build/` already exists)
2. Start containers via `docker compose -f docker-compose.e2e.yml up -d --wait`
3. Poll `http://localhost:8080/version` until cozy-stack is ready
4. Create instances:
   - `docker compose exec cozystack cozy-stack instances add alice.cozy.localhost --passphrase alice1234`
   - `docker compose exec cozystack cozy-stack instances add bob.cozy.localhost --passphrase bob1234`
5. Install the Drive app from the mounted local build:
   - `docker compose exec cozystack cozy-stack apps install drive file:///app/drive --domain alice.cozy.localhost`
   - Same for `bob.cozy.localhost`
6. **Enable required feature flags**, notably `drive.shared-drive.enabled` for both instances:
   - `docker compose exec cozystack cozy-stack features flags alice.cozy.localhost '{"drive.shared-drive.enabled": true}'`
   - Same for `bob.cozy.localhost`
7. **Obtain session cookies** by POSTing to each instance's `/auth/login` endpoint with the passphrase. This returns a `cozysessid` cookie that authenticates the browser session. Save these cookies to a shared state file (e.g., `e2e/.auth-state.json`).

**Note:** `cozy-stack instances token-cli` produces an OAuth Bearer token, not a session cookie. For browser-based E2E tests, we need real session cookies obtained through the login flow.

**Playwright `globalTeardown` (`e2e/setup/global-teardown.ts`):**

- Runs `docker compose -f docker-compose.e2e.yml down -v` to destroy containers and volumes

### Playwright Configuration

**`e2e/playwright.config.ts`:**

- `globalSetup` and `globalTeardown` wired to the files above
- No `baseURL` — tests navigate with absolute URLs since Alice and Bob use different domains
- `testDir: ./e2e/tests`
- Single project: Chromium only (V1)
- Timeouts: 30s per test, 5 min global setup
- `trace: 'on-first-retry'` and `screenshot: 'only-on-failure'` for CI debugging
- The `yarn e2e` script in `package.json` runs `playwright test --config e2e/playwright.config.ts`

**Required `package.json` changes:**
- Add `@playwright/test` as a `devDependency`
- Add script: `"e2e": "playwright test --config e2e/playwright.config.ts"`

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

**Authentication:** The `authenticate(page, user)` helper reads the `cozysessid` cookie from the shared state file (populated during global setup) and injects it into the browser context via `context.addCookies()`. This bypasses the login UI entirely.

### Page Object Model

Page objects in `e2e/pages/` provide thin wrappers over Playwright selectors:

| Page Object | Responsibility |
|---|---|
| `DrivePage.ts` | Navigate folders, view file lists, check file/folder presence |
| `SharedDrivePage.ts` | Create shared drive, invite user, list shared drives |
| `SharedDriveModalPage.ts` | The sharing/invitation modal (from `cozy-sharing` package — selectors depend on external package DOM structure) |
| `SidebarPage.ts` | Sidebar navigation (Shared Drives section) |

### Test Helpers

Helpers in `e2e/helpers/`:

- **`auth.ts`** — `authenticate(page, user)` injects `cozysessid` cookie into browser context
- **`stack-api.ts`** — thin wrapper for cozy-stack HTTP API calls (create folders, upload files) used for test data setup without going through the UI. Named `stack-api` to avoid confusion with the `cozy-client` npm package.
- **`flags.ts`** — `setFlags(instance, flags)` wraps `docker compose exec cozystack cozy-stack features flags` for toggling feature flags in `test.beforeAll()`

### Test Files

Tests in `e2e/tests/`, run in **serial mode** (Playwright `test.describe.serial`) since scenario 3 depends on 2 which depends on 1:

- **`shared-drive.spec.ts`** — single file with serial describe block:
  1. Alice creates a shared drive, verifies it in sidebar
  2. Alice invites Bob, Bob accepts (uses `page.waitForSelector` / polling to handle async invitation delivery)
  3. Alice creates a folder + file via `stack-api.ts`, Bob navigates into the shared drive and sees them

### Async Wait Strategy

Sharing operations (invitation delivery, acceptance sync) are asynchronous between instances. Tests use:
- Playwright's built-in `waitForSelector` / `waitForResponse` for UI elements appearing
- Short polling with `expect.poll()` for state that may take a moment to propagate
- Reasonable timeouts (10-15s) for cross-instance operations

## File Structure

```
e2e/
├── cozy.yml                       # cozy-stack configuration
├── setup/
│   ├── global-setup.ts
│   └── global-teardown.ts
├── helpers/
│   ├── auth.ts
│   ├── stack-api.ts
│   └── flags.ts
├── pages/
│   ├── DrivePage.ts
│   ├── SharedDrivePage.ts
│   ├── SharedDriveModalPage.ts
│   └── SidebarPage.ts
├── tests/
│   └── shared-drive.spec.ts
└── playwright.config.ts
docker-compose.e2e.yml
```

## Feature Flags

Feature flags are managed per-instance via `cozy-stack features flags` CLI.

**Required for V1:** `drive.shared-drive.enabled` must be set to `true` for both Alice and Bob instances during global setup. Without this flag, the Shared Drives UI is not rendered (guarded in `AppRoute.jsx`, `Sharings/index.jsx`, and `Empty.jsx`).

The `setFlags()` helper can also be called in `test.beforeAll()` to enable or disable additional flags before a specific test suite runs.

## CI: GitHub Actions

A new workflow at `.github/workflows/e2e.yml`, separate from the existing `ci-cd.yml`:

- **Triggers:** Pull requests + manual `workflow_dispatch`
- **Runner:** `ubuntu-latest` (Docker pre-installed, `*.localhost` resolves natively)
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
- **Session cookies via `/auth/login`** — `token-cli` produces OAuth tokens, not session cookies; for browser-based tests we need real `cozysessid` cookies obtained through the login endpoint
- **Local app install via `file://`** — `--apps drive` during instance creation fetches from the registry; instead we install from the locally mounted build with `cozy-stack apps install drive file:///app/drive`
- **Page Object Model** — abstracts selectors from test logic, makes tests resilient to UI changes
- **Serial test execution** — V1 scenarios are dependent (create → invite → browse), so they run in a single `test.describe.serial` block
- **Chromium only for V1** — keeps the suite fast; Firefox/WebKit can be added later
- **Separate CI workflow** — E2E tests are slow; they shouldn't block fast feedback
