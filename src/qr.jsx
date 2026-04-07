import { encodeQR } from 'qr'
import QrScanner from 'qr-scanner'
import { createSignal, createEffect, onCleanup } from 'solid-js'

export function generateQRCode(data) {
	return encodeQR(data, 'svg')
}

export function QrCodeSvg(props) {
	let containerEl
	const svg = () => (typeof props.svg === 'function' ? props.svg() : props.svg)

	createEffect(() => {
		const host = containerEl
		const svgMarkup = svg()

		if (!host) return
		if (!svgMarkup) {
			host.replaceChildren()
			return
		}

		const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml')
		const root = doc.documentElement
		const hasParseError = !!doc.querySelector('parsererror')
		const isSvg = root?.tagName?.toLowerCase() === 'svg'

		if (hasParseError || !isSvg) {
			host.replaceChildren()
			return
		}

		host.replaceChildren(document.importNode(root, true))
	})

	return <div ref={containerEl} class="qr-code text-center mb-3" />
}

export function QRScanner(props) {
	const [videoEl, setVideoEl] = createSignal(null)
	const [error, setError] = createSignal(null)
	const [status, setStatus] = createSignal('Requesting camera permission...')
	const [scanned, setScanned] = createSignal(false)
	const [fadingOut, setFadingOut] = createSignal(false)
	let scanner = null
	let didScan = false
	let scannedData = null
	let isActive = true

	function stopScanner() {
		scannedData = null
		if (!scanner) return
		try {
			scanner.stop().catch(() => {})
		} catch {
			// ignore
		}
		scanner.destroy()
		scanner = null
	}

	function handleClose() {
		stopScanner()
		if (typeof props.onClose === 'function') {
			props.onClose()
		}
	}

	function finishScan() {
		setFadingOut(true)
		setTimeout(() => {
			if (typeof props.onScan === 'function' && scannedData) {
				props.onScan(scannedData)
			}
		}, 300)
	}

	function handleStart() {
		const video = videoEl()
		if (!video) return

		setError(null)
		setStatus('Requesting camera permission...')
		didScan = false

		try {
			scanner = new QrScanner(
				video,
				(result) => {
					if (didScan) return
					const data = typeof result === 'string' ? result : result?.data
					if (!data) return
					didScan = true
					scannedData = data
					stopScanner()
					setScanned(true)
					setTimeout(finishScan, 400)
				},
				{
					returnDetailedScanResult: true,
					preferredCamera: 'environment',
					onDecodeError: () => {},
				},
			)

			scanner
				.start()
				.then(() => {
					if (!isActive) return
					setStatus('Point the camera at the QR code.')
				})
				.catch((err) => {
					if (!isActive) return
					const message = err?.message ? err.message : String(err)
					setError(message)
					stopScanner()
				})
		} catch (err) {
			if (!isActive) return
			const message = err?.message ? err.message : String(err)
			setError(message)
		}
	}

	createEffect(() => {
		const video = videoEl()
		if (!video) return

		video.setAttribute('playsinline', '')
		video.setAttribute('webkit-playsinline', '')
		video.playsInline = true
		if ('webkitPlaysInline' in video) {
			video.webkitPlaysInline = true
		}

		handleStart()

		onCleanup(() => {
			isActive = false
			stopScanner()
		})
	})

	const overlayClass = () => `qr-scanner-overlay${fadingOut() ? ' fade-out' : ''}`

	return (
		<div class={overlayClass()}>
			<div class="qr-scanner-modal">
				<div class="d-flex justify-content-between align-items-center mb-2">
					<div class="fw-semibold">Scan QR Code</div>
					<button class="btn btn-sm btn-outline-secondary" onClick={handleClose} disabled={scanned()}>
						Close
					</button>
				</div>
				{error() ? <div class="alert alert-danger py-2 mb-2">{error()}</div> : null}
				<div id="qr-reader" class="mb-2">
					<video ref={setVideoEl} muted playsinline autoplay></video>
					{scanned() ? (
						<div class="qr-scanner-success">
							<div class="qr-scanner-success-icon">✓</div>
						</div>
					) : null}
				</div>
				{scanned() ? <div class="small text-success fw-semibold">QR code scanned!</div> : !error() ? <div class="small text-muted">{status()}</div> : null}
			</div>
		</div>
	)
}
