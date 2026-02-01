const CACHE_PREFIX = 'shards-cache-'
const BUILD_ID = new URL(self.location.href).searchParams.get('build') || 'dev'
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`
const BASE_PATH = new URL(self.registration.scope).pathname
const APP_SHELL = `${BASE_PATH}index.html`
const PRECACHE_ASSETS = [BASE_PATH, APP_SHELL, `${BASE_PATH}fonts/RobotoMono-Regular.ttf`, `${BASE_PATH}manifest.json`]
const PRECACHE_PATHS = new Set(PRECACHE_ASSETS.map((asset) => new URL(asset, self.location.origin).pathname))
const STATIC_DESTINATIONS = new Set(['style', 'script', 'font', 'image', 'worker'])

function isCacheableResponse(response) {
	if (!response) return false
	if (!(response.ok || response.type === 'opaque')) return false
	if (response.status === 206) return false
	const cacheControl = response.headers.get('Cache-Control') || ''
	return !cacheControl.includes('no-store')
}

async function putInCache(request, response) {
	if (!isCacheableResponse(response)) return
	const cache = await caches.open(CACHE_NAME)
	await cache.put(request, response)
}

async function fetchAndCache(request) {
	const response = await fetch(request)
	await putInCache(request, response.clone())
	return response
}

async function cacheFirst(request) {
	const cached = await caches.match(request)
	if (cached) return cached
	return fetchAndCache(request)
}

async function networkFirstForNavigation(event) {
	try {
		const preload = await event.preloadResponse
		if (preload) {
			await putInCache(event.request, preload.clone())
			return preload
		}
		return await fetchAndCache(event.request)
	} catch {
		const cached = await caches.match(event.request)
		if (cached) return cached
		const appShell = await caches.match(APP_SHELL)
		if (appShell) return appShell
		throw new Error('Navigation failed and no offline fallback available')
	}
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME)
			await cache.addAll(PRECACHE_ASSETS)
		})(),
	)
})

self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting()
	}
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys()
			await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))
			if (self.registration.navigationPreload) {
				await self.registration.navigationPreload.enable()
			}
			await self.clients.claim()
		})(),
	)
})

self.addEventListener('fetch', (event) => {
	const { request } = event
	if (request.method !== 'GET') return
	if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

	const url = new URL(request.url)
	const isSameOrigin = url.origin === self.location.origin
	const isStaticDestination = STATIC_DESTINATIONS.has(request.destination)
	const isPrecachedAssetPath = isSameOrigin && PRECACHE_PATHS.has(url.pathname)

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstForNavigation(event))
		return
	}

	if (isSameOrigin && (isStaticDestination || isPrecachedAssetPath)) {
		event.respondWith(cacheFirst(request))
		return
	}
})
