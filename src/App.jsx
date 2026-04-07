import { createSignal, createEffect, createMemo, For, Index } from 'solid-js'
import * as bip39 from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { Envelope, SymmetricKey, NOTE } from '@bcts/envelope'
import { SSKRSpec, SSKRGroupSpec } from '@bcts/components'
import { ShardsPdfBuilder } from './pdf.js'
import { generateQRCode, QrCodeSvg, QRScanner } from './qr.jsx'

const APP_ICON_SRC = `${import.meta.env.BASE_URL}app-icon.svg`
const GITHUB_REPO_URL = 'https://github.com/0xJohnnyGault/Shards'

function getAutocomplete(prefix) {
	if (!prefix || prefix.length < 1) return []
	const lower = prefix.toLowerCase()
	return wordlist.filter((w) => w.startsWith(lower)).slice(0, 8)
}

function normalizeAppUrl(rawValue) {
	const value = typeof rawValue === 'string' ? rawValue.trim() : ''
	if (!value) return null
	try {
		const url = new URL(value)
		url.hash = ''
		return url.toString()
	} catch {
		return null
	}
}

function getDeployedAppUrl() {
	const envValue = typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.VITE_APP_URL === 'string' ? import.meta.env.VITE_APP_URL : ''
	const envUrl = normalizeAppUrl(envValue)
	if (envValue && !envUrl) {
		console.warn('Ignoring invalid VITE_APP_URL. Falling back to current origin and base path.')
	}
	if (envUrl) return envUrl

	if (typeof window !== 'undefined' && window.location) {
		const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
		try {
			return new URL(baseUrl, window.location.origin).toString()
		} catch {
			return window.location.origin
		}
	}

	return null
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

export default function App() {
	const [mode, setMode] = createSignal('home')
	const [error, setError] = createSignal(null)

	const [threshold, setThreshold] = createSignal('2-of-3')
	const [includeSeed, setIncludeSeed] = createSignal(true)
	const [includeSecretText, setIncludeSecretText] = createSignal(false)
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
		if (mode() === 'shares') {
			ShardsPdfBuilder.preloadPdfDeps()
		}
	})

	function clearSecrets() {
		// Overwrite seed words array in place before replacing the signal
		const oldWords = seedWords()
		for (let i = 0; i < oldWords.length; i++) oldWords[i] = ''

		// Overwrite share UR strings in place before replacing the signal
		for (const share of shares()) {
			if (share.ur) share.ur = ''
			if (share.qr) share.qr = ''
		}

		// Overwrite input share strings in place
		const oldInputs = inputShares()
		for (let i = 0; i < oldInputs.length; i++) oldInputs[i] = ''

		// Overwrite reconstructed data fields
		const rd = reconstructedData()
		if (rd) {
			if (rd.mnemonic) rd.mnemonic = ''
			if (rd.secretText) rd.secretText = ''
			if (rd.privateNote) rd.privateNote = ''
		}

		setSeedWords(Array(wordCount()).fill(''))
		setShares([])
		setInputShares(['', ''])
		setReconstructedData(null)
		setPublicNote('')
		setPrivateNote('')
	}

	function goHome() {
		clearSecrets()
		setMode('home')
		setError(null)
		setShardSetId(null)
		setShardSetTimestamp(null)
		setIncludeSeed(true)
		setIncludeSecretText(false)
	}

	function doDoneFromShares() {
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
		bytes.fill(0)
		const hashBytes = new Uint8Array(hashBuffer)
		const tail = hashBytes.slice(-3)
		const result = Array.from(tail)
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('')
		hashBytes.fill(0)
		return result
	}

	async function doCreateShards() {
		try {
			setError(null)

			if (includeSeed()) {
				if (!isValidMnemonic()) {
					setError('Please enter a valid BIP-39 seed phrase')
					return
				}
			} else if (!includeSecretText() || !privateNote().trim()) {
				setError('Please enter secret text to shard')
				return
			}

			let entropy
			let envelope
			if (includeSeed()) {
				entropy = bip39.mnemonicToEntropy(mnemonic(), wordlist)
				envelope = Envelope.new(entropy)
				const secretText = includeSecretText() ? privateNote().trim() : ''
				if (secretText) {
					envelope = envelope.addAssertion(NOTE, secretText)
				}
			} else {
				envelope = Envelope.new(privateNote().trim())
			}

			const contentKey = SymmetricKey.new()
			const encrypted = envelope.wrap().encryptSubject(contentKey)
			envelope = null
			if (entropy) entropy.fill(0)

			const [t, n] = threshold() === '2-of-3' ? [2, 3] : [3, 5]
			const groupSpec = SSKRGroupSpec.new(t, n)
			const spec = SSKRSpec.new(1, [groupSpec])

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
			const idInput = includeSeed() ? mnemonic() : privateNote().trim()
			const newShardSetId = await computeShardSetId(idInput, unixTimestamp)

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

	function getPdfOpts(sharesToInclude) {
		return {
			shares: sharesToInclude,
			threshold: threshold(),
			shardSetId: shardSetId() || 'unknown',
			publicNote: publicNote(),
			appUrl: getDeployedAppUrl(),
			appUrlQr: null, // generated lazily inside buildPdfBlob via appUrl
		}
	}

	async function getPdfOptsWithQr(sharesToInclude) {
		const opts = getPdfOpts(sharesToInclude)
		if (opts.appUrl) {
			opts.appUrlQr = await generateQRCode(opts.appUrl)
		}
		return opts
	}

	async function doGeneratePDF() {
		const opts = await getPdfOptsWithQr(shares())
		const shardIdValue = shardSetId() || 'unknown'
		await new ShardsPdfBuilder(opts).download(`shards-${shardIdValue}-all.pdf`)
	}

	async function doPrintSingleShard(share) {
		const opts = await getPdfOptsWithQr([share])
		const shardIdValue = shardSetId() || 'unknown'
		await new ShardsPdfBuilder(opts).download(`shards-${shardIdValue}-${share.index}.pdf`)
	}

	async function doPreviewPDF() {
		const opts = await getPdfOptsWithQr(shares())
		const hash = ShardsPdfBuilder.buildPdfPreviewHash(opts)
		window.open(location.pathname + hash, '_blank')
	}

	async function doReconstructSeed() {
		try {
			setError(null)
			setReconstructedData(null)
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

			// Try extracting bytes (seed phrase case) first, fall back to string (text-only case)
			let recoveredMnemonic = null
			let recoveredSecretText = null
			let recoveredPrivateNote = null

			try {
				const entropy = subjectEnvelope.extractBytes()
				recoveredMnemonic = bip39.entropyToMnemonic(entropy, wordlist)
				entropy.fill(0)

				try {
					const privateNoteObj = inner.objectForPredicate(NOTE)
					if (privateNoteObj) {
						recoveredPrivateNote = privateNoteObj.extractString()
					}
				} catch {
					// No private note
				}
			} catch {
				// No seed entropy — subject is secret text
				recoveredSecretText = subjectEnvelope.extractString()
			}

			setReconstructedData({
				mnemonic: recoveredMnemonic,
				secretText: recoveredSecretText,
				privateNote: recoveredPrivateNote,
			})
		} catch (err) {
			setError('Failed to reconstruct: ' + err.message)
		}
	}

	return (
		<div>
			<header class="app-header d-flex justify-content-between align-items-center mb-4 pb-3">
				<div class="d-flex align-items-center gap-3">
					<img class="app-icon" src={APP_ICON_SRC} alt="" aria-hidden="true" />
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
						<p class="hero-copy">Securely split a seed phrase or secret text into shares and reconstruct it only when you have enough fragments.</p>
					</section>

					<section class="row g-4 g-lg-5">
						<div class="col-lg-6">
							<div class="glass card-hover h-100 p-4 p-lg-5 cursor-pointer" role="button" tabIndex="0" onClick={() => setMode('create')} onKeyDown={handleModeCardKey('create')}>
								<div class="display-5 text-accent mb-3">✂️</div>
								<h2 class="h3 fw-bold mb-3">Create Shard Set</h2>
								<p class="text-muted mb-4">Split a seed phrase or secret text into multiple secure shares. Distribute them safely - no single point of failure.</p>
								<button class="btn btn-primary btn-lg w-100" type="button" onClick={() => setMode('create')}>
									Start Splitting →
								</button>
							</div>
						</div>
						<div class="col-lg-6">
							<div class="glass card-hover h-100 p-4 p-lg-5 cursor-pointer" role="button" tabIndex="0" onClick={() => setMode('reconstruct')} onKeyDown={handleModeCardKey('reconstruct')}>
								<div class="display-5 text-accent mb-3">🧩</div>
								<h2 class="h3 fw-bold mb-3">Reconstruct</h2>
								<p class="text-muted mb-4">Combine your shares to securely recover the original seed phrase or secret text - only when you have the required threshold.</p>
								<button class="btn btn-outline-primary btn-lg w-100" type="button" onClick={() => setMode('reconstruct')}>
									Start Recovery →
								</button>
							</div>
						</div>
					</section>

					<footer class="app-footer text-center mt-5 text-muted small">
						<span>Powered by Gordian Envelope &amp; SSKR • Open-source security for your seeds</span>
						<span aria-hidden="true">•</span>
						<a class="app-footer-link" href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="View Shards source on GitHub" title="View Shards source on GitHub">
							<svg class="app-footer-github-icon" viewBox="0 0 16 16" aria-hidden="true">
								<path
									fill="currentColor"
									d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.49c-2.23.48-2.7-.95-2.7-.95-.36-.92-.89-1.17-.89-1.17-.72-.5.06-.49.06-.49.8.06 1.22.83 1.22.83.71 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.88.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.14.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
								/>
							</svg>
							<span class="visually-hidden">GitHub repository</span>
						</a>
					</footer>
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
						<label class="form-label fw-semibold">Public Note (Optional)</label>
						<textarea class="form-control" rows="2" placeholder="Printed on each shard card (e.g., wallet name, contact info)" value={publicNote()} onInput={(e) => setPublicNote(e.currentTarget.value)} maxLength={255}></textarea>
						<div class="form-text">
							{publicNote().length}/255 characters. Displayed on cards and PDFs only - <strong>not stored in envelope</strong>, not recoverable.
						</div>
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
						<div class="form-text">{threshold() === '2-of-3' ? 'Creates 3 shares, any 2 can recover' : 'Creates 5 shares, any 3 can recover'}</div>
					</div>

					<div class="mb-4">
						<div class="form-check form-switch">
							<input class="form-check-input" type="checkbox" role="switch" id="includeSeedToggle" checked={includeSeed()} onChange={(e) => setIncludeSeed(e.currentTarget.checked)} />
							<label class="form-check-label fw-semibold" for="includeSeedToggle">
								Include Seed Phrase
							</label>
						</div>
						<div class="form-text">{includeSeed() ? 'Seed phrase entropy will be encrypted in each shard.' : 'No seed phrase — only your secret text will be sharded.'}</div>
					</div>

					{includeSeed() ? (
						<>
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
						</>
					) : null}

					<div class="mb-4">
						<div class="form-check form-switch mb-2">
							<input class="form-check-input" type="checkbox" role="switch" id="includeSecretTextToggle" checked={includeSecretText()} onChange={(e) => setIncludeSecretText(e.currentTarget.checked)} />
							<label class="form-check-label fw-semibold" for="includeSecretTextToggle">
								Include Secret Text
							</label>
						</div>
						{includeSecretText() ? (
							<>
								<textarea
									class="form-control"
									rows={includeSeed() ? 2 : 4}
									placeholder="Only revealed after reconstruction (e.g., derivation path, passphrase hint)"
									value={privateNote()}
									onInput={(e) => setPrivateNote(e.currentTarget.value)}
									maxLength={includeSeed() ? 255 : 1000}
								></textarea>
								<div class="form-text">
									{privateNote().length}/{includeSeed() ? 255 : 1000} characters. <strong>Encrypted</strong> - only visible after reconstruction.
								</div>
							</>
						) : null}
					</div>

					<div class="d-grid">
						<button class="btn btn-primary btn-lg" onClick={doCreateShards} disabled={includeSeed() ? !isValidMnemonic() : !(includeSecretText() && privateNote().trim())}>
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
							<strong>{shares().length}</strong> shards to recover your {includeSeed() ? 'seed' : 'secret text'}.
							{includeSeed() && includeSecretText() && privateNote().trim() ? (
								<>
									<br />
									<small>
										Secret text:
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
						<button class="btn btn-outline-secondary me-2" onClick={doPreviewPDF}>
							Preview PDF
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
						<h2 class="h5 mb-0">Reconstruct</h2>
					</div>

					<p class="text-muted mb-4">Enter the UR strings from your shards or scan QR codes. You need at least 2 shards (for 2-of-3) or 3 shards (for 3-of-5) to reconstruct your secret.</p>

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
							Reconstruct
						</button>
					</div>

					{reconstructedData() ? (
						<div class="card border-success">
							<div class="card-header bg-success text-white">{reconstructedData().mnemonic ? 'Recovered Seed Phrase' : 'Recovered Secret Text'}</div>
							<div class="card-body">
								{reconstructedData().mnemonic ? (
									<>
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
												<strong>Secret Text: </strong>
												{reconstructedData().privateNote}
											</div>
										) : null}
										<button class="btn btn-outline-success mt-3" onClick={() => navigator.clipboard.writeText(reconstructedData().mnemonic)}>
											Copy to Clipboard
										</button>
									</>
								) : (
									<>
										<div class="p-3 bg-light rounded font-monospace" style={{ 'white-space': 'pre-wrap' }}>
											{reconstructedData().secretText}
										</div>
										<button class="btn btn-outline-success mt-3" onClick={() => navigator.clipboard.writeText(reconstructedData().secretText)}>
											Copy to Clipboard
										</button>
									</>
								)}
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	)
}
