// Cliente da central: login/chat/historico via Open WebUI (/owui), resto via backend (/api).

// Prefixo onde a central esta publicada (ex: /ayran). Vem do `base` do vite.config.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

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
export type Location = { name: string; region?: string; lat: number; lon: number }
export type Settings = { spotify: string; topics: string[]; location: Location | null }

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
  const res = await fetch(BASE + path, {
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
  const res = await fetch(BASE + '/owui/api/v1/auths/signin', {
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

/** Neste PC (servidor) o backend entra sozinho como admin; de fora retorna null. */
export async function autoLogin(): Promise<User | null> {
  try {
    const res = await fetch(BASE + '/api/auto-login', { method: 'POST' })
    if (!res.ok) return null
    const data = await res.json()
    setToken(data.token)
    return data
  } catch {
    return null
  }
}

// ---------- chat ----------

/** Envia a conversa pro Ayran e chama onDelta a cada pedaco de texto. Retorna o texto completo. */
export async function streamChat(
  messages: ChatMsg[],
  onDelta: (full: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(BASE + '/owui/api/chat/completions', {
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

// ---------- imagem / video ----------

export type MediaCapabilities = {
  comfy_online: boolean
  vram_gb: number
  image: boolean
  video: boolean
  video_min_vram_gb: number
  sizes: string[]
  templates: { id: string; label: string; group: string; width: number; height: number; hint: string }[]
  custom: { min: number; max: number; max_ratio: number }
  styles: string[]
  lora: string
  lora_model: number
  lora_clip: number
}
export type MediaJob = {
  id: string
  kind: 'image' | 'video'
  prompt: string
  final_prompt: string
  params: { size?: string; style?: string; seed?: number; ref?: boolean; strength?: number }
  status: 'na_fila' | 'gerando' | 'pronto' | 'erro'
  error: string
  outputs: string[]
  created_at: number
}

export const getMediaCapabilities = () => request<MediaCapabilities>('/api/media/capabilities')
export const listMedia = () => request<MediaJob[]>('/api/media')
export const createImage = (body: {
  prompt: string
  size?: string
  template?: string
  width?: number
  height?: number
  style: string
  enhance: boolean
  checkpoint?: string | null
  lora_model?: number | null
  lora_clip?: number | null
}) => request<{ id: string }>('/api/media/image', { method: 'POST', body: JSON.stringify(body) })
export const deleteMedia = (id: string) => request(`/api/media/${id}`, { method: 'DELETE' })

/** Imagem nova a partir de uma imagem de referencia (img2img). */
export async function createImageFromRef(form: FormData): Promise<{ id: string }> {
  const res = await fetch(BASE + '/api/media/image-ref', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` }, // sem Content-Type: o navegador monta o multipart
    body: form,
  })
  if (res.status === 401) throw new AuthError('Sessão expirada')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `Erro ${res.status}`)
  }
  return res.json()
}

export async function mediaFileUrl(id: string, n: number): Promise<string> {
  const res = await fetch(BASE + `/api/media/${id}/file/${n}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('Imagem indisponível')
  return URL.createObjectURL(await res.blob())
}

// ---------- equipe (so admin) ----------

export type TeamUser = { id: string; name: string; email: string; role: 'admin' | 'user' | 'pending'; online: boolean; me: boolean }

export const listTeam = () => request<TeamUser[]>('/api/team/users')
export const createTeamUser = (u: { name: string; email: string; password: string; role: 'user' | 'admin' }) =>
  request<{ id: string }>('/api/team/users', { method: 'POST', body: JSON.stringify(u) })
export const updateTeamUser = (id: string, patch: { role?: 'user' | 'admin'; password?: string }) =>
  request(`/api/team/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteTeamUser = (id: string) => request(`/api/team/users/${id}`, { method: 'DELETE' })

/** Senha provisoria legivel (sem 0/O/1/l/I). */
export function generatePassword(length = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

// ---------- clima / servidor ----------

export type Scene = 'praia' | 'dia' | 'sol' | 'nublado' | 'chuva' | 'tempestade' | 'neblina' | 'noite' | 'frio'
export type DayForecast = { date: string; code: number; label: string; max: number; min: number; rain: number | null }
export type Weather = {
  timezone: string
  scene: Scene
  current: { temp: number; feels: number; humidity: number; wind: number; is_day: boolean; code: number; label: string }
  daily: DayForecast[]
}
export type CityResult = { name: string; region: string; country: string; lat: number; lon: number }
export type SystemInfo = {
  cpu: number
  ram: { used_gb: number; total_gb: number; percent: number }
  disk: { free_gb: number; total_gb: number; percent: number }
  gpu: { name: string; used_mb: number; total_mb: number; util: number; temp: number } | null
  model: string | null
  services: { id: string; label: string; hint: string; up: boolean }[]
}

export const getWeather = (lat: number, lon: number) => request<Weather>(`/api/weather?lat=${lat}&lon=${lon}`)
export const searchCities = (q: string) => request<CityResult[]>(`/api/geocode?q=${encodeURIComponent(q)}`)
export const getSystem = () => request<SystemInfo>('/api/system')

export async function health(): Promise<boolean> {
  try {
    return (await fetch(BASE + '/owui/health')).ok
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

// ---------- vista da cidade do usuario (gerada pelo Ayran) ----------

export type CityScene =
  | { status: 'ready'; url: string; city: string }
  | { status: 'generating'; city: string }
  | { status: 'needs-name' | 'nolocation' | 'error' | 'limit' }

export const getCityScene = (scene: Scene) => request<CityScene>(`/api/city-scene?scene=${scene}`)
export const reverseCity = (lat: number, lon: number) =>
  request<{ name: string; region: string; country: string }>(`/api/reverse?lat=${lat}&lon=${lon}`)

export type CityInfo = { name: string; desc: string; custom: boolean; editable: boolean } | { status: 'nolocation' }
export const getCityInfo = () => request<CityInfo>('/api/city-scene/info')
export const setCityInfo = (desc: string) =>
  request('/api/city-scene/info', { method: 'PUT', body: JSON.stringify({ desc }) })

// ---------- minha conta ----------
export const changePassword = (current: string, next: string) =>
  request<{ ok: boolean }>('/api/account/password', { method: 'POST', body: JSON.stringify({ current, new: next }) })

// ---------- tarefas ----------
export type TaskStatus = 'pendente' | 'andamento' | 'concluida'
export type Task = {
  id: string
  title: string
  details: string
  due_date: string | null
  status: TaskStatus
  created_at: number
  updated_at: number
  idea_id: string | null
}
export const listTasks = () => request<Task[]>('/api/tasks')
export const createTask = (t: { title: string; details?: string; due_date?: string | null; idea_id?: string | null }) =>
  request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(t) })
export const updateTask = (id: string, patch: Partial<Pick<Task, 'title' | 'details' | 'due_date' | 'status'>>) =>
  request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteTask = (id: string) => request(`/api/tasks/${id}`, { method: 'DELETE' })

// ---------- voz local (Whisper + Piper no servidor) ----------

export type VoiceStatus = { stt: boolean; tts: boolean; default: string | null; voices: { id: string; name: string }[] }

export const voiceStatus = () => request<VoiceStatus>('/api/voice/status')

async function voiceFetch(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(BASE + path, { ...init, headers: { Authorization: `Bearer ${getToken()}`, ...init.headers } })
  if (res.status === 401) throw new AuthError('Sessão expirada')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `Erro ${res.status}`)
  }
  return res
}

/** Audio gravado -> texto (Whisper no servidor). */
export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const res = await voiceFetch('/api/voice/stt', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'audio/webm' }, signal })
  return ((await res.json()) as { text: string }).text
}

/** Texto -> audio WAV (Piper no servidor). */
export async function synthesizeSpeech(text: string, voice: string, speed: number, signal?: AbortSignal): Promise<Blob> {
  const res = await voiceFetch('/api/voice/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
    signal,
  })
  return res.blob()
}

// ---------- e-mail, agenda e negocio ----------

export type Verdict = 'ok' | 'warn' | 'bad'
export type ScamAnalysis = {
  verdict: Verdict
  label: string
  score: number
  reasons: string[]
  positives: string[]
  action: string
  from: string
  subject: string
}
export type Mail = {
  id: string
  from_addr: string
  from_name: string
  subject: string
  body: string
  received_at: number
  read: boolean
  verdict: Verdict
  score: number
  analysis: ScamAnalysis | null
  demo: boolean
}
export const listMail = () => request<Mail[]>('/api/mail')
export const simulateMail = () => request<Mail>('/api/mail/simulate', { method: 'POST', body: '{}' })
export const markMailRead = (id: string) => request(`/api/mail/${id}/read`, { method: 'POST', body: '{}' })
export const deleteMail = (id: string) => request(`/api/mail/${id}`, { method: 'DELETE' })
export const analyzeEmail = (text: string) => request<ScamAnalysis>('/api/scam/analyze', { method: 'POST', body: JSON.stringify({ text }) })

export type AgendaEvent = {
  id: string
  title: string
  start: string // YYYY-MM-DDTHH:mm, horario local
  end: string
  place: string
  notes: string
  demo: boolean
  conflicts: string[]
}
export type EventInput = { title: string; start: string; end: string; place?: string; notes?: string }
export const listAgenda = (start?: string, days = 14) =>
  request<AgendaEvent[]>(`/api/agenda?days=${days}${start ? `&start=${start}` : ''}`)
export const createEvent = (e: EventInput) => request<AgendaEvent>('/api/agenda', { method: 'POST', body: JSON.stringify(e) })
export const updateEvent = (id: string, e: Partial<EventInput>) =>
  request<AgendaEvent>(`/api/agenda/${id}`, { method: 'PATCH', body: JSON.stringify(e) })
export const deleteEvent = (id: string) => request(`/api/agenda/${id}`, { method: 'DELETE' })

export type InsightAction =
  | { kind: 'go'; tab: string; label: string }
  | { kind: 'ask'; label: string; prompt: string }
  | { kind: 'task'; label: string; title: string }
export type Insight = { id: string; tone: 'bad' | 'warn' | 'info'; source: 'real' | 'exemplo'; title: string; body: string; action?: InsightAction }
export type Insights = {
  items: Insight[]
  kpis: { label: string; value: string; delta: string; source: string }[]
  weekly_sales: { label: string; value: number }[]
}
export const getInsights = () => request<Insights>('/api/insights')

// ---------- resumo do dia e notificacoes ----------

export type BriefingItem = { text: string; tone?: 'bad' | 'warn'; progress?: number; delta?: string }
export type Briefing = {
  greeting: string
  sections: { id: string; title: string; source: 'real' | 'exemplo'; items: BriefingItem[] }[]
  speak: string
  generated_at: number
}
export const getBriefing = () => request<Briefing>('/api/briefing')

export type AppNotification = {
  id: string
  kind: 'mail' | 'tasks' | 'agenda' | 'briefing' | 'business' | 'dev'
  tone: 'bad' | 'warn' | 'info'
  source: 'real' | 'exemplo'
  title: string
  body: string
  ts: number
  target: { tab: string; id?: string }
}
export const listNotifications = () => request<{ items: AppNotification[] }>('/api/notifications').then((r) => r.items)
