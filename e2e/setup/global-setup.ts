import { execSync } from 'child_process'

const COMPOSE_FILE = 'docker-compose.e2e.yml'
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
