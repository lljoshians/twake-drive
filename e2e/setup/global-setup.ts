import { execSync } from 'child_process'

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
    `docker compose -f ${COMPOSE_FILE} exec -T -e COZY_ADMIN_PASSPHRASE=cozy cozystack cozy-stack ${cmd}`
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
