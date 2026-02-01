import 'bootstrap/dist/css/bootstrap.min.css'
import { render } from 'solid-js/web'
import './style.css'

if (typeof global === 'undefined') {
	window.global = globalThis
}

async function bootstrapApp() {
	const { default: App } = await import('./App.js')
	const root = document.getElementById('app')
	if (!root) {
		throw new Error('App container not found')
	}
	root.replaceChildren()
	render(App, root)
}

bootstrapApp().catch((error) => {
	console.error('Failed to bootstrap application:', error)
})

const APP_BUILD_ID = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev'
const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		let refreshTriggered = false
		const baseUrl = import.meta.env.BASE_URL
		const swUrl = `${baseUrl}sw.js?build=${encodeURIComponent(APP_BUILD_ID)}`
		const versionUrl = `${baseUrl}version.json`

		function showUpdateBanner({ title, message, applyLabel, onApply }) {
			document.getElementById('sw-update-banner')?.remove()
			const banner = document.createElement('div')
			banner.id = 'sw-update-banner'
			banner.className = 'sw-update-banner'
			banner.innerHTML = `
					<div class="sw-update-title">${title}</div>
					<div class="small text-muted">${message}</div>
					<div class="sw-update-actions">
						<button type="button" class="btn btn-sm btn-primary" id="sw-update-apply">${applyLabel}</button>
						<button type="button" class="btn btn-sm btn-outline-secondary" id="sw-update-dismiss">Later</button>
					</div>
				`
			document.body.appendChild(banner)

			const applyButton = banner.querySelector('#sw-update-apply')
			const dismissButton = banner.querySelector('#sw-update-dismiss')

			applyButton?.addEventListener('click', () => {
				onApply()
			})

			dismissButton?.addEventListener('click', () => {
				banner.remove()
			})
		}

		function showServiceWorkerUpdateBanner(registration) {
			showUpdateBanner({
				title: 'Update available',
				message: 'A new version is ready to install.',
				applyLabel: 'Update',
				onApply: () => {
					if (!registration.waiting) return
					registration.waiting.postMessage({ type: 'SKIP_WAITING' })
				},
			})
		}

		async function checkVersionMismatch(registration) {
			try {
				const response = await fetch(`${versionUrl}?t=${Date.now()}`, {
					cache: 'no-store',
				})
				if (!response.ok) return
				const payload = await response.json()
				const latestBuildId = typeof payload?.buildId === 'string' ? payload.buildId : null
				if (!latestBuildId || latestBuildId === APP_BUILD_ID) return

				await registration.update()
				if (registration.waiting) {
					showServiceWorkerUpdateBanner(registration)
					return
				}

				showUpdateBanner({
					title: 'Update available',
					message: 'A newer deployment was detected. Reload to use the latest build.',
					applyLabel: 'Reload',
					onApply: () => window.location.reload(),
				})
			} catch (error) {
				console.debug('Build version check failed:', error)
			}
		}

		async function runUpdateChecks(registration) {
			try {
				await registration.update()
			} catch (error) {
				console.debug('Service worker update check failed:', error)
			}

			if (registration.waiting) {
				showServiceWorkerUpdateBanner(registration)
			}

			await checkVersionMismatch(registration)
		}

		function trackUpdates(registration) {
			if (!registration) return

			if (registration.waiting) {
				showServiceWorkerUpdateBanner(registration)
			}

			registration.addEventListener('updatefound', () => {
				const newWorker = registration.installing
				if (!newWorker) return
				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						showServiceWorkerUpdateBanner(registration)
					}
				})
			})
		}

		navigator.serviceWorker
			.register(swUrl, { updateViaCache: 'none' })
			.then((registration) => {
				trackUpdates(registration)
				void runUpdateChecks(registration)
				window.setInterval(() => {
					void runUpdateChecks(registration)
				}, UPDATE_CHECK_INTERVAL_MS)

				window.addEventListener('focus', () => {
					void runUpdateChecks(registration)
				})

				document.addEventListener('visibilitychange', () => {
					if (document.visibilityState === 'visible') {
						void runUpdateChecks(registration)
					}
				})
			})
			.catch((error) => {
				console.error('Service worker registration failed:', error)
			})

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (refreshTriggered) return
			refreshTriggered = true
			window.location.reload()
		})
	})
}
