import { loadAuthState } from './auth'
import { STACK_PORT } from './config'

async function stackFetch(
  user: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const state = loadAuthState()
  const { domain, cookieName, cookieValue } = state[user]

  const res = await fetch(`http://${domain}:${STACK_PORT}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: `${cookieName}=${cookieValue}`
    }
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Stack API ${path} failed (${res.status}): ${body}`)
  }

  return res
}

const ROOT_DIR = 'io.cozy.files.root-dir'

export async function createFolder(
  user: string,
  name: string,
  parentId = ROOT_DIR
): Promise<{ id: string; path: string }> {
  const res = await stackFetch(
    user,
    `/files/${parentId}?Name=${encodeURIComponent(name)}&Type=directory`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  )
  const json = await res.json()
  return { id: json.data.id, path: json.data.attributes.path }
}

export async function createFile(
  user: string,
  name: string,
  content: string,
  parentId = ROOT_DIR
): Promise<{ id: string }> {
  const res = await stackFetch(
    user,
    `/files/${parentId}?Name=${encodeURIComponent(name)}&Type=file`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: content
    }
  )
  const json = await res.json()
  return { id: json.data.id }
}
