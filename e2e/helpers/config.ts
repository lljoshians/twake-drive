import { execSync } from 'child_process'

export const COMPOSE_FILE = 'docker-compose.e2e.yml'
export const STACK_HOST = 'localhost'
export const STACK_PORT = 80
export const STACK_URL = `http://${STACK_HOST}:${STACK_PORT}`

export interface User {
  instance: string
  appUrl: string
  email: string
  passphrase: string
}

export const USERS: Record<'alice' | 'bob', User> = {
  alice: {
    instance: 'alice.cozy.localhost',
    appUrl: 'http://alice-drive.cozy.localhost',
    email: 'alice@cozy.localhost',
    passphrase: 'alice1234'
  },
  bob: {
    instance: 'bob.cozy.localhost',
    appUrl: 'http://bob-drive.cozy.localhost',
    email: 'bob@cozy.localhost',
    passphrase: 'bob1234'
  }
}

export function stackExec(cmd: string): string {
  return execSync(
    `docker compose -f ${COMPOSE_FILE} exec -T -e COZY_ADMIN_PASSPHRASE=cozy -e COZY_ADMIN_HOST=${STACK_HOST} cozystack cozy-stack ${cmd}`,
    { encoding: 'utf-8', cwd: process.cwd() }
  ).trim()
}
