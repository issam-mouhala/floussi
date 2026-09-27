/* Floussi service worker — minimal & safe.
 * Strategy: network-first for everything; only same-origin GETs of static
 * assets get a cache fallback so the app shell opens offline.
 * Never caches API responses or HTML navigations (data must be fresh). */
const CACHE = 'floussi-static-v1'
const STATIC_OK = /\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$/i

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/icon-192.png', '/icon-512.png']).catch(() => {})))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // always live data

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && STATIC_OK.test(url.pathname)) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => STATIC_OK.test(url.pathname) ? caches.match(req).then((r) => r || Response.error()) : Response.error())
  )
})
