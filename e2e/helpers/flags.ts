import { execSync } from 'child_process'

const COMPOSE_FILE = 'docker-compose.e2e.yml'

export function setFlags(
  instance: string,
  flags: Record<string, boolean | string | number>
): void {
  const flagsJson = JSON.stringify(flags)
  execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T -e COZY_ADMIN_PASSPHRASE=cozy -e COZY_ADMIN_HOST=localhost cozystack cozy-stack features flags --domain ${instance} '${flagsJson}'`,
    { encoding: 'utf-8', cwd: process.cwd() }
  )
}
