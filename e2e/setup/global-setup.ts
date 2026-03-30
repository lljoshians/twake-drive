import { execSync } from 'child_process'
import { pbkdf2Sync } from 'crypto'

import { saveAuthState } from '../helpers/auth'
import { setFlags } from '../helpers/flags'

const COMPOSE_FILE = 'docker-compose.e2e.yml'
const STACK_URL = 'http://localhost:80'

const USERS = {
  alice: { domain: 'alice.cozy.localhost', passphrase: 'alice1234' },
  bob: { domain: 'bob.cozy.localhost', passphrase: 'bob1234' }
}

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim()
}

function stackExec(cmd: string): string {
  return exec(
    `docker compose -f ${COMPOSE_FILE} exec -T -e COZY_ADMIN_PASSPHRASE=cozy -e COZY_ADMIN_HOST=localhost cozystack cozy-stack ${cmd}`
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
): Promise<{ name: string; value: string }> {
  // Get the login page to extract CSRF token and PBKDF2 parameters
  const loginPageRes = await fetch(`http://${domain}:80/auth/login`)
  const html = await loginPageRes.text()

  const csrfMatch = html.match(/name="csrf_token"\s+value="([^"]+)"/)
  if (!csrfMatch) throw new Error(`Could not find CSRF token for ${domain}`)
  const csrfToken = csrfMatch[1]

  const iterMatch = html.match(/data-iterations="(\d+)"/)
  const saltMatch = html.match(/data-salt="([^"]+)"/)
  if (!iterMatch || !saltMatch)
    throw new Error(`Could not find PBKDF2 params for ${domain}`)
  const iterations = parseInt(iterMatch[1])
  const salt = saltMatch[1]

  // Two-step PBKDF2 hash matching cozy-stack's password-helpers.js:
  // 1. master = PBKDF2(password, salt, iterations, 32, sha256)
  // 2. hashed = PBKDF2(master, password, 1, 32, sha256)  — base64 encoded
  const master = pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256')
  const hashed = pbkdf2Sync(
    Uint8Array.from(master),
    passphrase,
    1,
    32,
    'sha256'
  )
  const hashedB64 = hashed.toString('base64')

  // Extract cookies from the login page response
  const initialCookies = loginPageRes.headers.getSetCookie?.() || []

  // POST to /auth/login with the hashed passphrase
  const res = await fetch(`http://${domain}:80/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: initialCookies.map(c => c.split(';')[0]).join('; ')
    },
    body: new URLSearchParams({
      passphrase: hashedB64,
      csrf_token: csrfToken
    }),
    redirect: 'manual'
  })

  // Session cookie name is dynamic: sess-<hash> with Domain=cozy.localhost
  const setCookies = res.headers.getSetCookie?.() || []
  const sessCookie = setCookies.find(c => c.startsWith('sess-'))
  if (!sessCookie) {
    throw new Error(
      `Failed to get session cookie for ${domain} (status ${res.status})`
    )
  }

  const nameMatch = sessCookie.match(/^([^=]+)=([^;]+)/)
  if (!nameMatch)
    throw new Error(`Could not parse session cookie for ${domain}`)

  return { name: nameMatch[1], value: nameMatch[2] }
}

export default async function globalSetup(): Promise<void> {
  console.log('[e2e] Cleaning up previous containers...')
  exec(`docker compose -f ${COMPOSE_FILE} down -v`)

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
    stackExec(`apps install drive file:///app/drive --domain ${domain}`)
  }

  // Set feature flags
  for (const [name, { domain }] of Object.entries(USERS)) {
    console.log(`[e2e] Setting feature flags for ${name}...`)
    setFlags(domain, {
      'cozy.hide-sharing-cozy-to-cozy': true,
      'drive.shared-drive.enabled': true,
      'drive.federated-shared-folder.enabled': true,
      'drive.federated-shared-modal.enabled': true
    })
  }

  // Obtain session cookies
  const authState: Record<
    string,
    { domain: string; cookieName: string; cookieValue: string }
  > = {}
  for (const [name, { domain, passphrase }] of Object.entries(USERS)) {
    console.log(`[e2e] Getting session cookie for ${name}...`)
    const { name: cookieName, value: cookieValue } = await getSessionCookie(
      domain,
      passphrase
    )
    authState[name] = { domain, cookieName, cookieValue }
  }
  saveAuthState(authState)

  console.log('[e2e] Setup complete.')
}
