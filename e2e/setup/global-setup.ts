import { execSync } from 'child_process'
import { pbkdf2Sync } from 'crypto'

import { saveAuthState } from '../helpers/auth'
import {
  COMPOSE_FILE,
  STACK_URL,
  USERS,
  User,
  stackExec
} from '../helpers/config'
import { setFlags } from '../helpers/flags'

const FEATURE_FLAGS = {
  'cozy.hide-sharing-cozy-to-cozy': true,
  'drive.shared-drive.enabled': true,
  'drive.federated-shared-folder.enabled': true,
  'drive.federated-shared-modal.enabled': true
}

async function waitForStack(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/version`)
      if (res.ok) return
    } catch {
      // stack not up yet
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`cozy-stack did not become ready within ${timeoutMs}ms`)
}

async function getSessionCookie(
  user: User
): Promise<{ name: string; value: string }> {
  const { instance, passphrase } = user
  const loginPageRes = await fetch(`http://${instance}:80/auth/login`)
  const html = await loginPageRes.text()

  const csrfMatch = html.match(/name="csrf_token"\s+value="([^"]+)"/)
  if (!csrfMatch) throw new Error(`Could not find CSRF token for ${instance}`)
  const csrfToken = csrfMatch[1]

  const iterMatch = html.match(/data-iterations="(\d+)"/)
  const saltMatch = html.match(/data-salt="([^"]+)"/)
  if (!iterMatch || !saltMatch)
    throw new Error(`Could not find PBKDF2 params for ${instance}`)
  const iterations = parseInt(iterMatch[1], 10)
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

  const initialCookies = loginPageRes.headers.getSetCookie?.() || []

  const res = await fetch(`http://${instance}:80/auth/login`, {
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
      `Failed to get session cookie for ${instance} (status ${res.status})`
    )
  }

  const nameMatch = sessCookie.match(/^([^=]+)=([^;]+)/)
  if (!nameMatch)
    throw new Error(`Could not parse session cookie for ${instance}`)

  return { name: nameMatch[1], value: nameMatch[2] }
}

async function setupUser(
  label: string,
  user: User
): Promise<{ cookieName: string; cookieValue: string }> {
  console.log(`[e2e] Creating instance for ${label} (${user.instance})...`)
  stackExec(
    `instances add ${user.instance} --passphrase ${user.passphrase} --context-name test_default`
  )

  console.log(`[e2e] Installing Drive app for ${label}...`)
  stackExec(`apps install drive file:///app/drive --domain ${user.instance}`)

  console.log(`[e2e] Setting feature flags for ${label}...`)
  setFlags(user.instance, FEATURE_FLAGS)

  console.log(`[e2e] Getting session cookie for ${label}...`)
  const cookie = await getSessionCookie(user)
  return { cookieName: cookie.name, cookieValue: cookie.value }
}

export default async function globalSetup(): Promise<void> {
  console.log('[e2e] Cleaning up previous containers...')
  execSync(`docker compose -f ${COMPOSE_FILE} down -v`, {
    encoding: 'utf-8',
    cwd: process.cwd()
  })

  console.log('[e2e] Starting Docker containers...')
  execSync(`docker compose -f ${COMPOSE_FILE} up -d --wait`, {
    encoding: 'utf-8',
    cwd: process.cwd()
  })

  console.log('[e2e] Waiting for cozy-stack...')
  await waitForStack(STACK_URL)

  const results = await Promise.all(
    Object.entries(USERS).map(async ([label, user]) => {
      const cookie = await setupUser(label, user)
      return [label, { domain: user.instance, ...cookie }] as const
    })
  )
  saveAuthState(Object.fromEntries(results))

  console.log('[e2e] Setup complete.')
}
