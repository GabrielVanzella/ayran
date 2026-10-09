// Cliente da central: login/chat/historico via Open WebUI (/owui), resto via backend (/api).

const TOKEN_KEY = 'ayran.token'

export type User = { id: string; name: string; email: string; role: string; profile_image_url?: string }
export type ChatMsg = { role: 'user' | 'assistant'; content: string }
export type ChatSummary = { id: string; title: string; updated_at: number }
export type NewsItem = { title: string; link: string; source: string; published: number; topic: string }
export type Idea = {
  id: string
  title: string
  body: string
  tag: string
  status: 'nova' | 'andamento' | 'feita'
  created_at: number
  updated_at: number
}
export type Settings = { spotify: string; topics: string[] }

export const AYRAN_MODEL = 'ayran'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* navegador sem storage: sessao so dura ate recarregar */
  }
}

export class AuthError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 401) throw new AuthError('Sessão expirada')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Erro ${res.status}`)
  }
  return res.json()
}

// ---------- conta ----------

export async function signin(email: string, password: string): Promise<User> {
  const res = await fetch('/owui/api/v1/auths/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || 'E-mail ou senha incorretos')
  }
  const data = await res.json()
  if (data.role === 'pending') throw new Error('Sua conta ainda está aguardando aprovação do admin.')
  setToken(data.token)
  return data
}

export const me = () => request<User>('/owui/api/v1/auths/')

// ---------- chat ----------

/** Envia a conversa pro Ayran e chama onDelta a cada pedaco de texto. Retorna o texto completo. */
export async function streamChat(
  messages: ChatMsg[],
  onDelta: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/owui/api/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ model: AYRAN_MODEL, messages, stream: true }),
  })
  if (res.status === 401) throw new AuthError('Sessão expirada')
  if (!res.ok || !res.body) throw new Error(`O Ayran não respondeu (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      let json
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      if (json.error) throw new Error(json.error.detail || 'Erro no Ayran')
      const delta = json.choices?.[0]?.delta?.content
      if (delta) {
        full += delta
        onDelta(full)
      }
    }
  }
  return full
}

/** Separa o raciocinio (<think>) da resposta final. */
export function splitThinking(text: string): { thinking: string; answer: string; thinkingOpen: boolean } {
  const start = text.indexOf('<think>')
  if (start === -1) return { thinking: '', answer: text, thinkingOpen: false }
  const end = text.indexOf('</think>', start)
  if (end === -1) return { thinking: text.slice(start + 7), answer: text.slice(0, start), thinkingOpen: true }
  return {
    thinking: text.slice(start + 7, end).trim(),
    answer: (text.slice(0, start) + text.slice(end + 8)).trim(),
    thinkingOpen: false,
  }
}

// ---------- historico (salvo no Open WebUI, aparece la tambem) ----------

function toOwuiChat(title: string, messages: ChatMsg[]) {
  const now = Math.floor(Date.now() / 1000)
  const ids = messages.map(() => crypto.randomUUID())
  const list = messages.map((m, i) => ({
    id: ids[i],
    parentId: i ? ids[i - 1] : null,
    childrenIds: i < ids.length - 1 ? [ids[i + 1]] : [],
    role: m.role,
    content: m.content,
    timestamp: now,
    ...(m.role === 'user' ? { models: [AYRAN_MODEL] } : { model: AYRAN_MODEL, modelName: 'Ayran', done: true }),
  }))
  return {
    title,
    models: [AYRAN_MODEL],
    messages: list,
    history: { messages: Object.fromEntries(list.map((m) => [m.id, m])), currentId: ids[ids.length - 1] ?? null },
    timestamp: now * 1000,
  }
}

export async function saveChat(id: string | null, title: string, messages: ChatMsg[]): Promise<string> {
  const chat = toOwuiChat(title, messages)
  const path = id ? `/owui/api/v1/chats/${id}` : '/owui/api/v1/chats/new'
  const saved = await request<{ id: string }>(path, { method: 'POST', body: JSON.stringify({ chat }) })
  return saved.id
}

export const listChats = () => request<ChatSummary[]>('/owui/api/v1/chats/list?page=1')

export async function loadChat(id: string): Promise<ChatMsg[]> {
  const data = await request<{ chat: { messages?: { role: string; content: string }[] } }>(
    `/owui/api/v1/chats/${id}`,
  )
  return (data.chat.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as ChatMsg['role'], content: m.content }))
}

export const deleteChat = (id: string) => request(`/owui/api/v1/chats/${id}`, { method: 'DELETE' })

// ---------- noticias / ideias / preferencias ----------

export const getNewsTopics = () => request<{ id: string; label: string }[]>('/api/news/topics')
export const getNews = (topic = 'all') => request<NewsItem[]>(`/api/news?topic=${encodeURIComponent(topic)}`)

export const listIdeas = () => request<Idea[]>('/api/ideas')
export const createIdea = (idea: Partial<Idea>) =>
  request<Idea>('/api/ideas', { method: 'POST', body: JSON.stringify(idea) })
export const updateIdea = (id: string, patch: Partial<Idea>) =>
  request<Idea>(`/api/ideas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteIdea = (id: string) => request(`/api/ideas/${id}`, { method: 'DELETE' })

export const getSettings = () => request<Settings>('/api/settings')
export const putSettings = (s: Partial<Settings>) =>
  request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(s) })

export async function health(): Promise<boolean> {
  try {
    return (await fetch('/owui/health')).ok
  } catch {
    return false
  }
}

export function timeAgo(unix: number): string {
  if (!unix) return ''
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} d`
}
