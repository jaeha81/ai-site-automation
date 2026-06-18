const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

export interface ThreadsUser {
  id: string
  username: string
  name: string
  threads_profile_picture_url?: string
  threads_biography?: string
  followers_count?: number
}

export interface ThreadsPostResult {
  id: string
}

export interface ThreadsMediaContainer {
  id: string
}

export interface ThreadsInsights {
  views: number
  likes: number
  replies: number
  reposts: number
  quotes: number
}

async function threadsRequest<T>(
  path: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, string | number>
): Promise<T> {
  const url = `${THREADS_API_BASE}${path}`
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }

  if (method === 'GET') {
    const params = new URLSearchParams({ access_token: accessToken })
    const res = await fetch(`${url}?${params}`, opts)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Threads API GET ${path} failed ${res.status}: ${err}`)
    }
    return res.json() as Promise<T>
  }

  const params = new URLSearchParams({ access_token: accessToken })
  const res = await fetch(`${url}?${params}`, {
    ...opts,
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Threads API POST ${path} failed ${res.status}: ${err}`)
  }
  return res.json() as Promise<T>
}

export async function getThreadsUser(accessToken: string): Promise<ThreadsUser> {
  return threadsRequest<ThreadsUser>(
    '/me?fields=id,username,name,threads_profile_picture_url,threads_biography,followers_count',
    accessToken
  )
}

export async function createTextPost(
  userId: string,
  accessToken: string,
  text: string
): Promise<ThreadsMediaContainer> {
  return threadsRequest<ThreadsMediaContainer>(
    `/${userId}/threads`,
    accessToken,
    'POST',
    { media_type: 'TEXT', text }
  )
}

export async function publishMediaContainer(
  userId: string,
  accessToken: string,
  creationId: string
): Promise<ThreadsPostResult> {
  return threadsRequest<ThreadsPostResult>(
    `/${userId}/threads_publish`,
    accessToken,
    'POST',
    { creation_id: creationId }
  )
}

export async function postToThreads(
  userId: string,
  accessToken: string,
  text: string
): Promise<string> {
  const container = await createTextPost(userId, accessToken, text)
  // Threads requires a short wait between container creation and publish
  await new Promise(r => setTimeout(r, 1000))
  const result = await publishMediaContainer(userId, accessToken, container.id)
  return result.id
}

export async function replyToPost(
  userId: string,
  accessToken: string,
  replyToId: string,
  text: string
): Promise<string> {
  const container = await threadsRequest<ThreadsMediaContainer>(
    `/${userId}/threads`,
    accessToken,
    'POST',
    { media_type: 'TEXT', text, reply_to_id: replyToId }
  )
  await new Promise(r => setTimeout(r, 1000))
  const result = await publishMediaContainer(userId, accessToken, container.id)
  return result.id
}

export async function getPostInsights(
  postId: string,
  accessToken: string
): Promise<ThreadsInsights> {
  const data = await threadsRequest<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
    `/${postId}/insights?metric=views,likes,replies,reposts,quotes`,
    accessToken
  )
  const map: Record<string, number> = {}
  for (const metric of data.data ?? []) {
    map[metric.name] = metric.values?.[0]?.value ?? 0
  }
  return {
    views: map.views ?? 0,
    likes: map.likes ?? 0,
    replies: map.replies ?? 0,
    reposts: map.reposts ?? 0,
    quotes: map.quotes ?? 0,
  }
}

// Exchange short-lived token for long-lived token (60 days)
export async function exchangeLongLivedToken(
  shortLivedToken: string,
  appSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: appSecret,
    access_token: shortLivedToken,
  })
  const res = await fetch(`${THREADS_API_BASE}/access_token?${params}`)
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

export async function refreshLongLivedToken(
  longLivedToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: 'th_refresh_token',
    access_token: longLivedToken,
  })
  const res = await fetch(`${THREADS_API_BASE}/refresh_access_token?${params}`)
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}
