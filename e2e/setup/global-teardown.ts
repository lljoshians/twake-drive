import { execSync } from 'child_process'

import { COMPOSE_FILE } from '../helpers/config'

export default async function globalTeardown(): Promise<void> {
  console.log('[e2e] Tearing down Docker containers...')
  execSync(`docker compose -f ${COMPOSE_FILE} down -v`, {
    stdio: 'inherit',
    cwd: process.cwd()
  })
}
