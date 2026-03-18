import { loadAuthState } from './auth'

const STACK_PORT = 8080

async function stackFetch(
  user: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const state = loadAuthState()
  const { domain, cookie } = state[user]

  const res = await fetch(`http://${domain}:${STACK_PORT}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: `cozysessid=${cookie}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Stack API ${path} failed (${res.status}): ${body}`)
  }

  return res
}

export async function createFolder(
  user: string,
  name: string,
  parentId = 'io.cozy.files.root-dir'
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
  parentId = 'io.cozy.files.root-dir'
): Promise<{ id: string }> {
  const res = await stackFetch(
    user,
    `/files/${parentId}?Name=${encodeURIComponent(name)}&Type=file`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: content,
    }
  )
  const json = await res.json()
  return { id: json.data.id }
}
