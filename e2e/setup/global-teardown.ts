import { execSync } from 'child_process'

export default async function globalTeardown(): Promise<void> {
  console.log('[e2e] Tearing down Docker containers...')
  execSync('docker compose -f docker-compose.e2e.yml down -v', {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
}
