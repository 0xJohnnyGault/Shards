import { createSignal, createEffect, createMemo, onCleanup, For, Index } from 'solid-js'
import * as bip39 from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

let shardingDepsPromise
let qrScannerPromise
let pdfDepsPromise

async function getShardingDeps() {
	if (!shardingDepsPromise) {
		shardingDepsPromise = Promise.all([import('@bcts/envelope'), import('@bcts/components'), import('qr')]).then(([envelopeMod, componentsMod, qrMod]) => {
			return {
				Envelope: envelopeMod.Envelope,
				SymmetricKey: envelopeMod.SymmetricKey,
				NOTE: envelopeMod.NOTE,
				SSKRSpecCtor: componentsMod.SSKRSpec,
				SSKRGroupSpec: componentsMod.SSKRGroupSpec,
				encodeQR: qrMod.encodeQR,
			}
		})
	}
	return shardingDepsPromise
}

async function getQrScanner() {
	if (!qrScannerPromise) {
		qrScannerPromise = Promise.all([import('qr-scanner'), import('qr-scanner/qr-scanner-worker.min.js?url')]).then(([scannerMod, workerUrl]) => {
			const Scanner = scannerMod.default
			Scanner.WORKER_PATH = workerUrl.default
			return Scanner
		})
	}
	return qrScannerPromise
}

async function getJsPDF() {
	if (!pdfDepsPromise) {
		pdfDepsPromise = Promise.all([import('jspdf'), import('svg2pdf.js')]).then(([jspdfMod]) => {
			return jspdfMod.jsPDF
		})
	}

	const JsPDF = await pdfDepsPromise
	if (!JsPDF || typeof JsPDF !== 'function') {
		throw new Error('jsPDF is not available')
	}
	if (!JsPDF.API.svg) throw new Error('svg2pdf.js is not available')
	return JsPDF
}

function getAutocomplete(prefix) {
	if (!prefix || prefix.length < 1) return []
	const lower = prefix.toLowerCase()
	return wordlist.filter((w) => w.startsWith(lower)).slice(0, 8)
}

async function generateQRCode(data) {
	const { encodeQR } = await getShardingDeps()
	if (typeof encodeQR !== 'function') {
		throw new Error('QR encoder not available')
	}
	return encodeQR(data, 'svg')
}

function ResetCacheButton() {
	const [isResetting, setIsResetting] = createSignal(false)

	async function handleReset() {
		if (isResetting()) return
		setIsResetting(true)
		try {
			if ('serviceWorker' in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations()
				await Promise.all(registrations.map((registration) => registration.unregister()))
			}
			if ('caches' in window) {
				const keys = await caches.keys()
				await Promise.all(keys.map((key) => caches.delete(key)))
			}
		} catch (error) {
			console.warn('Failed to clear service worker or caches:', error)
		} finally {
			setIsResetting(false)
			location.reload()
		}
	}

	return (
		<button class="btn btn-sm btn-outline-secondary" title="Reset cache and reload" type="button" onClick={handleReset} disabled={isResetting()}>
			{isResetting() ? <span class="spinner-border spinner-border-sm" role="status"></span> : '🔄'}
		</button>
	)
}

function WordInput(props) {
	const [isFocused, setIsFocused] = createSignal(false)
	const [selectedIndex, setSelectedIndex] = createSignal(0)

	const value = () => (typeof props.value === 'function' ? props.value() : props.value)
	const indexValue = () => (typeof props.index === 'function' ? props.index() : props.index)
	const checksumInvalid = () => (typeof props.checksumInvalid === 'function' ? props.checksumInvalid() : props.checksumInvalid)

	const isValid = () => value() && wordlist.includes(value())
	const suggestions = createMemo(() => getAutocomplete(value()))
	const hasPrefixMatch = createMemo(() => {
		const currentValue = value()
		if (!currentValue) return false
		if (wordlist.includes(currentValue)) return true
		return suggestions().length > 0
	})
	const showDropdown = () => isFocused() && suggestions().length > 0 && value() && value().length >= 1

	createEffect(() => {
		suggestions()
		setSelectedIndex(0)
	})

	function handleInput(e) {
		const target = e.target
		const nextValue = target.value.toLowerCase().replace(/[^a-z]/g, '')
		props.onInput(nextValue)
		if (!isFocused()) setIsFocused(true)
	}

	function handleBeforeInput(e) {
		const data = e.data
		if (typeof data === 'string' && /[^a-zA-Z]/.test(data)) {
			e.preventDefault()
		}
	}

	function handlePaste(e) {
		e.preventDefault()
		const pasted = e.clipboardData?.getData('text') ?? ''
		const cleaned = pasted.toLowerCase().replace(/[^a-z]/g, '')
		props.onInput(cleaned)
		if (!isFocused()) setIsFocused(true)
	}

	function focusNextInput() {
		const inputs = Array.from(document.querySelectorAll('.word-input'))
		const currentIndex = indexValue()
		const next = inputs[currentIndex + 1]
		if (next && typeof next.focus === 'function') {
			next.focus()
		}
	}

	function selectWord(word, moveNext = false) {
		props.onInput(word)
		setIsFocused(false)
		if (moveNext) {
			setTimeout(() => focusNextInput(), 0)
		}
	}

	function handleKeyDown(e) {
		if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !/^[a-zA-Z]$/.test(e.key)) {
			e.preventDefault()
			return
		}

		if (!showDropdown()) return

		if (e.key === 'ArrowDown') {
			e.preventDefault()
			setSelectedIndex((i) => Math.min(i + 1, suggestions().length - 1))
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setSelectedIndex((i) => Math.max(i - 1, 0))
		} else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
			e.preventDefault()
			const selected = suggestions()[selectedIndex()]
			if (selected) selectWord(selected, true)
		} else if (e.key === 'Escape') {
			setIsFocused(false)
		}
	}

	function handleBlur() {
		setTimeout(() => setIsFocused(false), 150)
	}

	function handleFocus() {
		setIsFocused(true)
	}

	const inputClass = () => {
		let cls = 'form-control word-input'
		if (checksumInvalid()) {
			cls += ' is-invalid'
		} else if (value()) {
			if (isValid()) {
				cls += ' is-valid'
			} else if (!hasPrefixMatch()) {
				cls += ' is-invalid'
			}
		}
		return cls
	}

		return (
			<div class="position-relative">
				<div class="input-group input-group-sm">
					<span class="input-group-text" style={{ width: '2.5rem', 'justify-content': 'center' }}>
						{indexValue() + 1}
					</span>
					<input
						type="text"
						class={inputClass()}
						value={value()}
						onInput={handleInput}
						onBeforeInput={handleBeforeInput}
						onPaste={handlePaste}
						onKeyDown={handleKeyDown}
						onBlur={handleBlur}
						onFocus={handleFocus}
						placeholder="..."
						autocomplete="off"
						autocapitalize="none"
						spellcheck={false}
					/>
				</div>
				{showDropdown() && (
					<div class="autocomplete-dropdown">
					<For each={suggestions()}>
						{(word, i) => (
							<div class={`autocomplete-item ${i() === selectedIndex() ? 'active' : ''}`} onMouseDown={() => selectWord(word)}>
								{word}
							</div>
						)}
					</For>
				</div>
			)}
		</div>
	)
}

function QrCodeSvg(props) {
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

function QRScanner(props) {
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

	async function handleStart() {
		const video = videoEl()
		if (!video) return

		setError(null)
		setStatus('Loading scanner...')
		didScan = false

		try {
			const QrScanner = await getQrScanner()
			if (!isActive) return

			setStatus('Requesting camera permission...')
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

export default function App() {
	const [mode, setMode] = createSignal('home')
	const [error, setError] = createSignal(null)

	const [threshold, setThreshold] = createSignal('2-of-3')
	const [wordCount, setWordCount] = createSignal(12)
	const [seedWords, setSeedWords] = createSignal(Array(12).fill(''))
	const [publicNote, setPublicNote] = createSignal('')
	const [privateNote, setPrivateNote] = createSignal('')
	const [shares, setShares] = createSignal([])
	const [shardSetId, setShardSetId] = createSignal(null)
	const [shardSetTimestamp, setShardSetTimestamp] = createSignal(null)

	const [inputShares, setInputShares] = createSignal(['', ''])
	const [reconstructedData, setReconstructedData] = createSignal(null)
	const [scanningIndex, setScanningIndex] = createSignal(null)

	const mnemonic = createMemo(() => seedWords().join(' ').trim())
	const isValidMnemonic = createMemo(() => {
		const words = seedWords()
		if (!words.length || words.length !== wordCount()) return false
		if (!words.every((word) => word && wordlist.includes(word))) return false
		return bip39.validateMnemonic(words.join(' '), wordlist)
	})
	const allWordsValid = createMemo(() => {
		const words = seedWords()
		if (!words.length || words.length !== wordCount()) return false
		return words.every((word) => word && wordlist.includes(word))
	})
	const checksumInvalid = createMemo(() => allWordsValid() && !isValidMnemonic())

	createEffect(() => {
		const count = wordCount()
		const current = seedWords()
		if (current.length !== count) {
			setSeedWords(Array(count).fill(''))
		}
	})

	createEffect(() => {
		const currentMode = mode()
		if (currentMode === 'create' || currentMode === 'reconstruct' || currentMode === 'shares') {
			void getShardingDeps()
		}
		if (currentMode === 'shares') {
			void getJsPDF()
		}
	})

	createEffect(() => {
		if (scanningIndex() !== null) {
			void getQrScanner()
		}
	})

	function goHome() {
		setMode('home')
		setError(null)
		setShares([])
		setShardSetId(null)
		setShardSetTimestamp(null)
		setReconstructedData(null)
		setInputShares(['', ''])
		setPublicNote('')
		setPrivateNote('')
	}

	function doDoneFromShares() {
		setSeedWords(Array(wordCount()).fill(''))
		setPublicNote('')
		setPrivateNote('')
		goHome()
	}

	function handleModeCardKey(nextMode) {
		return (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault()
				setMode(nextMode)
			}
		}
	}

	function doGenerateNewSeed() {
		const strength = wordCount() === 12 ? 128 : 256
		const newMnemonic = bip39.generateMnemonic(wordlist, strength)
		setSeedWords(newMnemonic.split(' '))
	}

	function updateSeedWord(index, value) {
		const words = [...seedWords()]
		words[index] = value
		setSeedWords(words)
	}

	async function computeShardSetId(seedPhrase, unixTimestamp) {
		const subtle = window.crypto?.subtle
		if (!subtle) {
			throw new Error('Web Crypto API is not available')
		}
		const input = `${seedPhrase}|${unixTimestamp}`
		const bytes = new TextEncoder().encode(input)
		const hashBuffer = await subtle.digest('SHA-256', bytes)
		const hashBytes = new Uint8Array(hashBuffer)
		const tail = hashBytes.slice(-3)
		return Array.from(tail)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('')
	}

	async function doCreateShards() {
		try {
			setError(null)

			if (!isValidMnemonic()) {
				setError('Please enter a valid BIP-39 seed phrase')
				return
			}

			const entropy = bip39.mnemonicToEntropy(mnemonic(), wordlist)
			const { Envelope, SymmetricKey, NOTE, SSKRSpecCtor, SSKRGroupSpec } = await getShardingDeps()

			let envelope = Envelope.new(entropy)

			const privateNoteText = privateNote().trim()
			if (privateNoteText) {
				envelope = envelope.addAssertion(NOTE, privateNoteText)
			}

			const contentKey = SymmetricKey.new()
			const encrypted = envelope.wrap().encryptSubject(contentKey)

			const [t, n] = threshold() === '2-of-3' ? [2, 3] : [3, 5]
			const groupSpec = SSKRGroupSpec.new(t, n)
			const spec = SSKRSpecCtor.new(1, [groupSpec])

			const shareGroups = encrypted.sskrSplit(spec, contentKey)
			const shareEnvelopes = shareGroups[0]

			const sharesWithQR = await Promise.all(
				shareEnvelopes.map(async (shareEnvelope, index) => {
					const urString = shareEnvelope.urString()
					const qrSvg = await generateQRCode(urString.toUpperCase())
					return {
						index: index + 1,
						ur: urString,
						qr: qrSvg,
					}
				}),
			)

			const unixTimestamp = Math.floor(Date.now() / 1000)
			const newShardSetId = await computeShardSetId(mnemonic(), unixTimestamp)

			setShardSetId(newShardSetId)
			setShardSetTimestamp(unixTimestamp)
			setShares(sharesWithQR)
			setMode('shares')
		} catch (err) {
			setError('Failed to create shards: ' + err.message)
		}
	}

	function doAddShareInput() {
		setInputShares([...inputShares(), ''])
	}

	function doRemoveShareInput(index) {
		const current = inputShares()
		if (current.length > 2) {
			setInputShares(current.filter((_, i) => i !== index))
		}
	}

	function doUpdateShareInput(index, value) {
		const current = [...inputShares()]
		current[index] = value
		setInputShares(current)
	}

	function doStartScan(index) {
		setScanningIndex(index)
	}

	function doHandleScan(data) {
		const index = scanningIndex()
		if (index !== null) {
			doUpdateShareInput(index, data)
		}
		setScanningIndex(null)
	}

	let robotoMonoBase64 = null
	async function loadRobotoMono(pdf) {
		try {
			if (!robotoMonoBase64) {
				const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
				const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
				const fontUrl = `${normalizedBaseUrl}fonts/RobotoMono-Regular.ttf`
				const response = await fetch(fontUrl)
				if (!response.ok) {
					throw new Error(`Failed to fetch font from ${fontUrl}: ${response.status}`)
				}
				const arrayBuffer = await response.arrayBuffer()
				robotoMonoBase64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
			}

			pdf.addFileToVFS('RobotoMono-Regular.ttf', robotoMonoBase64)
			pdf.addFont('RobotoMono-Regular.ttf', 'RobotoMono', 'normal')
		} catch (e) {
			console.warn('Failed to load Roboto Mono, falling back to Courier', e)
		}
	}

	async function svgToHighResDataUrl(svgString, outputSize = 800) {
		return new Promise((resolve) => {
			const img = new Image()
			img.onload = () => {
				const canvas = document.createElement('canvas')
				canvas.width = outputSize
				canvas.height = outputSize
				const ctx = canvas.getContext('2d')
				if (ctx) {
					ctx.imageSmoothingEnabled = false
					ctx.drawImage(img, 0, 0, outputSize, outputSize)
				}
				resolve(canvas.toDataURL('image/png'))
			}
			const svgWithSize = svgString.replace(/<svg([^>]*)>/, `<svg$1 width="${outputSize}" height="${outputSize}">`)
			img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgWithSize)))
		})
	}

	async function addSvgToPdf(pdf, svgString, x, y, size) {
		if (typeof pdf.svg !== 'function') return false

		const parser = new DOMParser()
		const doc = parser.parseFromString(svgString, 'image/svg+xml')
		const svgEl = doc.documentElement
		if (!svgEl.getAttribute('shape-rendering')) {
			svgEl.setAttribute('shape-rendering', 'crispEdges')
		}

		const wrapper = document.createElement('div')
		wrapper.style.position = 'fixed'
		wrapper.style.left = '-10000px'
		wrapper.style.top = '0'
		wrapper.appendChild(svgEl)
		document.body.appendChild(wrapper)

		try {
			await pdf.svg(svgEl, { x, y, width: size, height: size })
			return true
		} catch (err) {
			console.warn('Failed to render SVG into PDF, falling back to PNG.', err)
			return false
		} finally {
			wrapper.remove()
		}
	}

	async function generateShardPDF(sharesToInclude, filename) {
		const JsPDF = await getJsPDF()
		const pdf = new JsPDF({
			orientation: 'portrait',
			unit: 'mm',
			format: 'a4',
		})

		await loadRobotoMono(pdf)

		const pageWidth = pdf.internal.pageSize.getWidth()
		const pageHeight = pdf.internal.pageSize.getHeight()
		const margin = 20
		const contentWidth = pageWidth - margin * 2

		for (let i = 0; i < sharesToInclude.length; i += 1) {
			const share = sharesToInclude[i]

			if (i > 0) {
				pdf.addPage()
			}

			let yPos = margin

			pdf.setFontSize(24)
			pdf.setFont('helvetica', 'bold')
			pdf.text('Shards Backup', pageWidth / 2, yPos, { align: 'center' })
			yPos += 12

			pdf.setFontSize(14)
			pdf.setFont('helvetica', 'normal')
			pdf.text(`Shard ${share.index} of ${shares().length} — ${threshold()} threshold`, pageWidth / 2, yPos, { align: 'center' })
			yPos += 15

			const shardSetIdValue = shardSetId()
			if (shardSetIdValue) {
				pdf.setFontSize(10)
				pdf.setFont('helvetica', 'normal')
				pdf.setTextColor(90, 90, 90)
				pdf.text(`Shard Set ID: ${shardSetIdValue}`, pageWidth / 2, yPos, { align: 'center' })
				pdf.setTextColor(0, 0, 0)
				yPos += 8
			}

			const qrSize = 80
			const qrX = (pageWidth - qrSize) / 2
			const rendered = await addSvgToPdf(pdf, share.qr, qrX, yPos, qrSize)
			if (!rendered) {
				const qrDataUrl = await svgToHighResDataUrl(share.qr, 800)
				pdf.addImage(qrDataUrl, 'PNG', qrX, yPos, qrSize, qrSize)
			}
			yPos += qrSize + 10

			const publicNoteText = publicNote().trim()
			if (publicNoteText) {
				pdf.setFillColor(240, 240, 240)
				pdf.rect(margin, yPos, contentWidth, 20, 'F')
				pdf.setFontSize(10)
				pdf.setFont('helvetica', 'bold')
				pdf.text('Public Note:', margin + 5, yPos + 6)
				pdf.setFont('helvetica', 'normal')
				const noteLines = pdf.splitTextToSize(publicNoteText, contentWidth - 10)
				pdf.text(noteLines, margin + 5, yPos + 12)
				yPos += 25
			}

			pdf.setFontSize(8)
			try {
				pdf.setFont('RobotoMono', 'normal')
			} catch {
				pdf.setFont('courier', 'normal')
			}
			const charSpacing = 0.3
			pdf.setCharSpace(charSpacing)
			const urText = share.ur.toUpperCase()
			const avgCharsPerLine = 60
			const spacingAdjustment = avgCharsPerLine * charSpacing
			const urLines = pdf.splitTextToSize(urText, contentWidth - 6 - spacingAdjustment)
			pdf.setFillColor(248, 249, 250)
			const urHeight = urLines.length * 4 + 8
			pdf.rect(margin, yPos, contentWidth, urHeight, 'F')
			pdf.setDrawColor(200, 200, 200)
			pdf.rect(margin, yPos, contentWidth, urHeight, 'S')
			pdf.text(urLines, margin + 3, yPos + 5)
			pdf.setCharSpace(0)
			yPos += urHeight + 10

			pdf.setFontSize(9)
			pdf.setFont('helvetica', 'italic')
			pdf.setTextColor(128, 128, 128)
			pdf.text('Store this shard in a separate secure location', pageWidth / 2, pageHeight - margin, { align: 'center' })
			pdf.setTextColor(0, 0, 0)
		}

		const pdfBlob = pdf.output('blob')

		const url = URL.createObjectURL(pdfBlob)
		const a = document.createElement('a')
		a.href = url
		a.download = filename
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	async function doGeneratePDF() {
		const shardIdValue = shardSetId() || 'unknown'
		await generateShardPDF(shares(), `shards-${shardIdValue}-all.pdf`)
	}

	async function doPrintSingleShard(share) {
		const shardIdValue = shardSetId() || 'unknown'
		await generateShardPDF([share], `shards-${shardIdValue}-${share.index}.pdf`)
	}

	async function doReconstructSeed() {
		try {
			setError(null)
			setReconstructedData(null)
			const { Envelope, NOTE } = await getShardingDeps()

			const shareTexts = inputShares().filter((s) => s.trim().length > 0)

			if (shareTexts.length < 2) {
				setError('Please enter at least 2 shares')
				return
			}

			const shareEnvelopes = shareTexts.map((text) => {
				const trimmed = text.trim().toLowerCase()
				return Envelope.fromUrString(trimmed)
			})

			const wrapped = Envelope.sskrJoin(shareEnvelopes)
			const inner = wrapped.unwrap()

			const subjectEnvelope = inner.subject()
			const entropy = subjectEnvelope.extractBytes()

			let recoveredPrivateNote = null
			try {
				const privateNoteObj = inner.objectForPredicate(NOTE)
				if (privateNoteObj) {
					recoveredPrivateNote = privateNoteObj.extractString()
				}
			} catch {
				// No private note
			}

			const recoveredMnemonic = bip39.entropyToMnemonic(entropy, wordlist)

			setReconstructedData({
				mnemonic: recoveredMnemonic,
				privateNote: recoveredPrivateNote,
			})
		} catch (err) {
			setError('Failed to reconstruct seed: ' + err.message)
		}
	}

	return (
		<div>
			<header class="app-header d-flex justify-content-between align-items-center mb-4 pb-3">
				<div class="d-flex align-items-center gap-3">
					<span class="app-icon">🔐</span>
					<div>
						<div class="app-title">Shards</div>
						<div class="app-subtitle">Gordian Envelope SSKR Manager</div>
					</div>
				</div>
				<ResetCacheButton />
			</header>

			{error() ? (
				<div class="alert alert-danger alert-dismissible" role="alert">
					{error()}
					<button type="button" class="btn-close" onClick={() => setError(null)} />
				</div>
			) : null}

			{mode() === 'home' ? (
				<div>
					<section class="text-center hero-section mb-5">
						<h1 class="hero-title mb-3">Shards</h1>
						<p class="hero-subtitle mb-3">Gordian Envelope SSKR Manager</p>
						<p class="hero-copy">Securely split your seed phrase into shares and reconstruct it only when you have enough fragments - powered by battle-tested SSKR.</p>
					</section>

					<section class="row g-4 g-lg-5">
						<div class="col-lg-6">
							<div class="glass card-hover h-100 p-4 p-lg-5 cursor-pointer" role="button" tabIndex="0" onClick={() => setMode('create')} onKeyDown={handleModeCardKey('create')}>
								<div class="display-5 text-accent mb-3">✂️</div>
								<h2 class="h3 fw-bold mb-3">Create Shard Set</h2>
								<p class="text-muted mb-4">Split a seed phrase into multiple secure shares. Distribute them safely - no single point of failure.</p>
								<button class="btn btn-primary btn-lg w-100" type="button" onClick={() => setMode('create')}>
									Start Splitting →
								</button>
							</div>
						</div>
						<div class="col-lg-6">
							<div class="glass card-hover h-100 p-4 p-lg-5 cursor-pointer" role="button" tabIndex="0" onClick={() => setMode('reconstruct')} onKeyDown={handleModeCardKey('reconstruct')}>
								<div class="display-5 text-accent mb-3">🧩</div>
								<h2 class="h3 fw-bold mb-3">Reconstruct Seed</h2>
								<p class="text-muted mb-4">Combine your shares to securely recover the original seed phrase - only when you have the required threshold.</p>
								<button class="btn btn-outline-primary btn-lg w-100" type="button" onClick={() => setMode('reconstruct')}>
									Start Recovery →
								</button>
							</div>
						</div>
					</section>

					<footer class="app-footer text-center mt-5 text-muted small">Powered by Gordian Envelope &amp; SSKR • Open-source security for your seeds</footer>
				</div>
			) : null}

			{mode() === 'create' ? (
				<div>
					<div class="d-flex align-items-center mb-4">
						<button class="btn btn-link text-decoration-none p-0 me-2" onClick={goHome}>
							← Back
						</button>
						<h2 class="h5 mb-0">Create Shard Set</h2>
					</div>

					<div class="mb-4">
						<label class="form-label fw-semibold">Recovery Threshold</label>
						<div class="btn-group w-100" role="group">
							<input type="radio" class="btn-check" name="threshold" id="threshold-2-3" checked={threshold() === '2-of-3'} onChange={() => setThreshold('2-of-3')} />
							<label class="btn btn-outline-primary" for="threshold-2-3">
								2 of 3
							</label>
							<input type="radio" class="btn-check" name="threshold" id="threshold-3-5" checked={threshold() === '3-of-5'} onChange={() => setThreshold('3-of-5')} />
							<label class="btn btn-outline-primary" for="threshold-3-5">
								3 of 5
							</label>
						</div>
						<div class="form-text">{threshold() === '2-of-3' ? 'Creates 3 shares, any 2 can recover the seed' : 'Creates 5 shares, any 3 can recover the seed'}</div>
					</div>

					<div class="mb-4">
						<label class="form-label fw-semibold">Seed Phrase Length</label>
						<div class="btn-group w-100" role="group">
							<input type="radio" class="btn-check" name="wordCount" id="words-12" checked={wordCount() === 12} onChange={() => setWordCount(12)} />
							<label class="btn btn-outline-secondary" for="words-12">
								12 Words
							</label>
							<input type="radio" class="btn-check" name="wordCount" id="words-24" checked={wordCount() === 24} onChange={() => setWordCount(24)} />
							<label class="btn btn-outline-secondary" for="words-24">
								24 Words
							</label>
						</div>
					</div>

					<div class="mb-4">
							<div class="d-flex justify-content-between align-items-center mb-2">
								<label class="form-label fw-semibold mb-0">Seed Phrase</label>
								<button class="btn btn-sm btn-outline-secondary" onClick={doGenerateNewSeed}>
									Generate New
								</button>
							</div>
							<div class="row g-2">
								<Index each={seedWords()}>
									{(word, index) => (
										<div class="col-4 col-md-3">
											<WordInput index={index} value={word} onInput={(v) => updateSeedWord(index, v)} checksumInvalid={() => checksumInvalid() && index === wordCount() - 1} />
										</div>
									)}
								</Index>
							</div>
						<div class="mt-2">{isValidMnemonic() ? <span class="text-success small"> ✓ Valid seed phrase </span> : <span class="text-muted small"> Enter all words for a valid BIP-39 seed phrase </span>}</div>
					</div>

					<div class="mb-4">
						<label class="form-label fw-semibold">Public Note (Optional)</label>
						<textarea class="form-control" rows="2" placeholder="Printed on each shard card (e.g., wallet name, contact info)" value={publicNote()} onInput={(e) => setPublicNote(e.currentTarget.value)} maxLength={255}></textarea>
						<div class="form-text">
							{publicNote().length}/255 characters. Displayed on cards and PDFs only - <strong>not stored in envelope</strong>, not recoverable.
						</div>
					</div>

					<div class="mb-4">
						<label class="form-label fw-semibold">Private Note (Optional)</label>
						<textarea class="form-control" rows="2" placeholder="Only revealed after reconstruction (e.g., derivation path, passphrase hint)" value={privateNote()} onInput={(e) => setPrivateNote(e.currentTarget.value)} maxLength={255}></textarea>
						<div class="form-text">
							{privateNote().length}/255 characters. <strong>Encrypted</strong> - only visible after reconstruction.
						</div>
					</div>

					<div class="d-grid">
						<button class="btn btn-primary btn-lg" onClick={doCreateShards} disabled={!isValidMnemonic()}>
							Create Shards
						</button>
					</div>
				</div>
			) : null}

			{mode() === 'shares' ? (
				<div>
					<div class="print-only print-header">
						<h1>Shards Backup</h1>
						<p>
							<strong>{threshold()}</strong> threshold - need {threshold() === '2-of-3' ? '2' : '3'} of {shares().length} shards to recover
						</p>
					</div>

					<div class="no-print">
						<div class="d-flex align-items-center mb-4">
							<button class="btn btn-link text-decoration-none p-0 me-2" onClick={doDoneFromShares}>
								← Done
							</button>
							<h2 class="h5 mb-0">Your Shards</h2>
						</div>

						<div class="alert alert-info">
							<strong>{threshold()}</strong> threshold: You'll need <strong>{threshold() === '2-of-3' ? ' 2 ' : ' 3 '}</strong> of these&nbsp;
							<strong>{shares().length}</strong> shards to recover your seed.
							{privateNote().trim() ? (
								<>
									<br />
									<small>
										Private note:
										<em>(encrypted, revealed after reconstruction)</em>
									</small>
								</>
							) : null}
						</div>
					</div>

					<div class="row g-3 print-grid">
						<For each={shares()}>
							{(share) => (
								<div class="col-12 col-md-6">
									<div class="card share-card h-100">
										<div class="card-header d-flex justify-content-between align-items-center">
											<span class="fw-semibold">{`Shard ${share.index} of ${shares().length}`}</span>
											<span class="no-print">
												<button class="btn btn-sm btn-outline-secondary me-1" onClick={() => navigator.clipboard.writeText(share.ur)}>
													Copy
												</button>
												<button class="btn btn-sm btn-outline-secondary" onClick={() => doPrintSingleShard(share)}>
													PDF
												</button>
											</span>
											<span class="print-only" style={{ 'font-size': '0.75rem' }}>
												{`${threshold()} threshold`}
											</span>
										</div>
										<div class="card-body">
											{shardSetId() ? (
												<div class="text-muted small mb-2">
													Shard Set ID: <span class="font-monospace">{shardSetId()}</span>
												</div>
											) : null}
											<QrCodeSvg svg={share.qr} />

											{publicNote().trim() ? (
												<div class="alert alert-secondary py-2 mb-3">
													<small class="text-muted d-block">Public Note:</small>
													{publicNote().trim()}
												</div>
											) : null}
											<div class="bytewords bg-light p-2 rounded" style={{ 'font-size': '0.7rem' }}>
												{share.ur}
											</div>
										</div>
									</div>
								</div>
							)}
						</For>
					</div>

					<div class="print-only print-footer">Created with Shards - Store each shard in a separate secure location</div>

					<div class="mt-4 text-center no-print">
						<button class="btn btn-outline-secondary me-2" onClick={doGeneratePDF}>
							Save PDF
						</button>
						<button class="btn btn-primary" onClick={doDoneFromShares}>
							Done
						</button>
					</div>
				</div>
			) : null}

			{scanningIndex() !== null ? <QRScanner onScan={doHandleScan} onClose={() => setScanningIndex(null)} /> : null}

			{mode() === 'reconstruct' ? (
				<div>
					<div class="d-flex align-items-center mb-4">
						<button class="btn btn-link text-decoration-none p-0 me-2" onClick={goHome}>
							← Back
						</button>
						<h2 class="h5 mb-0">Reconstruct Seed</h2>
					</div>

					<p class="text-muted mb-4">Enter the UR strings from your shards or scan QR codes. You need at least 2 shards (for 2-of-3) or 3 shards (for 3-of-5) to reconstruct your seed.</p>

					<div class="mb-4">
						<For each={inputShares()}>
							{(_, index) => (
								<div class="mb-3">
									<div class="d-flex justify-content-between align-items-center mb-1">
										<label class="form-label mb-0 fw-semibold">{`Shard ${index() + 1}`}</label>
										<div>
											<button class="btn btn-sm btn-outline-primary me-2" onClick={() => doStartScan(index())}>
												Scan QR
											</button>
											{inputShares().length > 2 ? (
												<button class="btn btn-sm btn-link text-danger p-0" onClick={() => doRemoveShareInput(index())}>
													Remove
												</button>
											) : null}
										</div>
									</div>
									<textarea
										class="form-control font-monospace"
										rows="3"
										placeholder="Enter UR string (ur:envelope/...) or scan QR code..."
										value={inputShares()[index()]}
										onInput={(e) => doUpdateShareInput(index(), e.currentTarget.value)}
										style={{ 'font-size': '0.8rem' }}
									></textarea>
								</div>
							)}
						</For>

						<button class="btn btn-sm btn-outline-secondary" onClick={doAddShareInput}>
							+ Add Another Shard
						</button>
					</div>

					<div class="d-grid mb-4">
						<button class="btn btn-primary btn-lg" onClick={doReconstructSeed}>
							Reconstruct Seed
						</button>
					</div>

					{reconstructedData() ? (
						<div class="card border-success">
							<div class="card-header bg-success text-white">Recovered Seed Phrase</div>
							<div class="card-body">
								<div class="seed-display">
									<For each={reconstructedData().mnemonic.split(' ')}>
										{(word, i) => (
											<span class="seed-word" data-index={i() + 1}>
												{word}
											</span>
										)}
									</For>
								</div>
								{reconstructedData().privateNote ? (
									<div class="mt-3 p-2 bg-warning-subtle rounded">
										<strong>Private Note:</strong>
										{reconstructedData().privateNote}
									</div>
								) : null}
								<button class="btn btn-outline-success mt-3" onClick={() => navigator.clipboard.writeText(reconstructedData().mnemonic)}>
									Copy to Clipboard
								</button>
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	)
}
