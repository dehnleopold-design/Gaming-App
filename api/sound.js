/**
 * Vercel-Funktion: lädt einen Sound per Link und reicht ihn an den Browser weiter.
 *
 * Warum ein Server nötig ist: Myinstants (und viele andere Seiten) senden keine
 * CORS-Header. Der Browser darf die MP3 deshalb nicht selbst laden.
 *
 * GET /api/sound?url=<Link>
 *   - Direkter Audio-Link (…/sound.mp3)  → Datei wird geladen
 *   - Myinstants-Seite (…/instant/xyz/)  → Sound-Adresse wird aus der Seite gelesen
 * Antwort: die Audiodatei; Name im Header "X-Sound-Name" (URI-kodiert).
 */

const MAX_BYTES = 20 * 1024 * 1024
const MAX_HTML = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const UA = 'Mozilla/5.0 (compatible; SquadNight/1.0)'

function fail(res, status, message) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: message }))
}

/** Nur öffentliche http(s)-Adressen mit Hostnamen – keine IPs, kein localhost. */
function checkUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null // IP-Literale
  if (u.username || u.password) return null
  return u
}

const isMyinstants = (u) => u.hostname === 'myinstants.com' || u.hostname.endsWith('.myinstants.com')

async function readLimited(response, limit) {
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw Object.assign(new Error('Datei ist größer als 20 MB.'), { status: 413 })
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Liest Sound-Adresse und Titel aus einer Myinstants-Seite. */
async function resolveMyinstantsPage(pageUrl) {
  const r = await fetch(pageUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!r.ok) throw Object.assign(new Error(`Seite nicht erreichbar (${r.status}).`), { status: 502 })
  const html = (await readLimited(r, MAX_HTML)).toString('utf8')
  const src =
    html.match(/preloadAudioUrl\s*=\s*'([^']+\.mp3)'/)?.[1] ??
    html.match(/play\('([^']+\.mp3)'/)?.[1] ??
    html.match(/(\/media\/sounds\/[^"'\s]+\.mp3)/)?.[1]
  if (!src) throw Object.assign(new Error('Auf dieser Seite wurde kein Sound gefunden.'), { status: 422 })
  const og = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
  // og:title sieht aus wie "Patrick Jane - Sound-Taste" → Suffix nach dem letzten " - " abschneiden
  const full = og ? decodeEntities(og).trim() : ''
  const cut = full.lastIndexOf(' - ')
  const title = cut > 0 ? full.slice(0, cut).trim() : full
  return { audioUrl: new URL(src, pageUrl), title }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Nur GET erlaubt.')
  const params = new URL(req.url, 'http://localhost').searchParams
  const target = checkUrl(params.get('url') ?? '')
  if (!target) return fail(res, 400, 'Ungültiger Link. Erlaubt sind öffentliche http(s)-Adressen.')

  try {
    let audioUrl = target
    let title = ''
    const looksLikeFile = /\.(mp3|wav|ogg|oga|m4a|aac|webm|flac)$/i.test(target.pathname)
    if (isMyinstants(target) && !looksLikeFile) {
      ;({ audioUrl, title } = await resolveMyinstantsPage(target))
    }
    if (!checkUrl(audioUrl.href)) return fail(res, 400, 'Ungültige Sound-Adresse.')

    const r = await fetch(audioUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r.ok) return fail(res, 502, `Sound nicht erreichbar (${r.status}).`)
    if (r.url && !checkUrl(r.url)) return fail(res, 400, 'Weiterleitung auf eine nicht erlaubte Adresse.')

    const type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const fileLike = /\.(mp3|wav|ogg|oga|m4a|aac|webm|flac)$/i.test(new URL(r.url || audioUrl.href).pathname)
    if (!type.startsWith('audio/') && !(type === 'application/octet-stream' && fileLike)) {
      return fail(res, 415, type.startsWith('text/html')
        ? 'Der Link führt zu einer Webseite, nicht zu einer Audiodatei. Bei Myinstants den Link der Sound-Seite verwenden, sonst einen direkten Link auf die MP3.'
        : `Keine Audiodatei (Typ: ${type || 'unbekannt'}).`)
    }
    const len = Number(r.headers.get('content-length') ?? 0)
    if (len > MAX_BYTES) return fail(res, 413, 'Datei ist größer als 20 MB.')

    const body = await readLimited(r, MAX_BYTES)
    if (!title) {
      title = decodeURIComponent(audioUrl.pathname.split('/').pop() ?? 'Sound')
        .replace(/\.[^.]+$/, '')
        .replace(/_[A-Za-z0-9]{6,8}$/, '')
    }
    res.statusCode = 200
    res.setHeader('Content-Type', type.startsWith('audio/') ? type : 'audio/mpeg')
    res.setHeader('Content-Length', String(body.length))
    res.setHeader('X-Sound-Name', encodeURIComponent(title.slice(0, 60)))
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.end(body)
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    fail(res, e?.status ?? (timeout ? 504 : 502), timeout ? 'Zeitüberschreitung beim Laden.' : e?.message || 'Laden fehlgeschlagen.')
  }
}
