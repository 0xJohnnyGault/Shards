export class ShardsPdfBuilder {
	static _pdfDepsPromise = null
	static _robotoMonoBase64 = null

	// PDF color palette — optimized for B&W laser printing on white paper
	static colors = {
		white: [255, 255, 255],
		black: [0, 0, 0],
		pageBg: [255, 255, 255],
		cardBorder: [200, 200, 200],
		headerBg: [235, 235, 235],
		headerBadgeBg: [210, 210, 210],
		headerText: [0, 0, 0],
		headerTextMuted: [80, 80, 80],
		sidePanelBg: [220, 220, 220],
		qrPanelBg: [250, 250, 250],
		qrPanelBorder: [200, 200, 200],
		qrCardBorder: [180, 180, 180],
		footerBg: [235, 235, 235],
		footerText: [0, 0, 0],
		footerTextMuted: [80, 80, 80],
		captionText: [100, 100, 100],
	}

	static async getJsPDF() {
		if (!ShardsPdfBuilder._pdfDepsPromise) {
			ShardsPdfBuilder._pdfDepsPromise = Promise.all([import('jspdf'), import('svg2pdf.js')]).then(([jspdfMod]) => {
				return jspdfMod.jsPDF
			})
		}

		const JsPDF = await ShardsPdfBuilder._pdfDepsPromise
		if (!JsPDF || typeof JsPDF !== 'function') {
			throw new Error('jsPDF is not available')
		}
		if (!JsPDF.API.svg) throw new Error('svg2pdf.js is not available')
		return JsPDF
	}

	static preloadPdfDeps() {
		void ShardsPdfBuilder.getJsPDF()
	}

	static async loadRobotoMono(pdf) {
		try {
			if (!ShardsPdfBuilder._robotoMonoBase64) {
				const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
				const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
				const fontUrl = `${normalizedBaseUrl}fonts/RobotoMono-Regular.ttf`
				const response = await fetch(fontUrl)
				if (!response.ok) {
					throw new Error(`Failed to fetch font from ${fontUrl}: ${response.status}`)
				}
				const arrayBuffer = await response.arrayBuffer()
				ShardsPdfBuilder._robotoMonoBase64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))
			}

			pdf.addFileToVFS('RobotoMono-Regular.ttf', ShardsPdfBuilder._robotoMonoBase64)
			pdf.addFont('RobotoMono-Regular.ttf', 'RobotoMono', 'normal')
		} catch (e) {
			console.warn('Failed to load Roboto Mono, falling back to Courier', e)
		}
	}

	static svgToHighResDataUrl(svgString, outputSize = 800) {
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

	static async addSvgToPdf(pdf, svgString, x, y, size) {
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

	/**
	 * Build a #/pdf-preview hash URL encoding the given PDF params.
	 * Data is JSON-encoded and base64url-encoded in the hash fragment.
	 */
	static buildPdfPreviewHash(opts) {
		const payload = {
			shares: opts.shares,
			threshold: opts.threshold,
			shardSetId: opts.shardSetId,
			publicNote: opts.publicNote || '',
			appUrl: opts.appUrl || null,
			appUrlQr: opts.appUrlQr || null,
		}
		const json = JSON.stringify(payload)
		const encoded = btoa(unescape(encodeURIComponent(json)))
		return `#/pdf-preview/${encoded}`
	}

	/**
	 * Parse PDF params from a #/pdf-preview hash.
	 * Returns null if the hash doesn't match.
	 */
	static parsePdfPreviewHash(hash) {
		const prefix = '#/pdf-preview/'
		if (!hash || !hash.startsWith(prefix)) return null
		try {
			const encoded = hash.slice(prefix.length)
			const json = decodeURIComponent(escape(atob(encoded)))
			return JSON.parse(json)
		} catch {
			return null
		}
	}

	/**
	 * @param {Object} opts
	 * @param {Array<{index: number, ur: string, qr: string}>} opts.shares - shares to render
	 * @param {string} opts.threshold - e.g. "2-of-3"
	 * @param {string} opts.shardSetId - hex ID
	 * @param {string} [opts.publicNote] - optional public note
	 * @param {string|null} [opts.appUrl] - deployed app URL for footer QR
	 * @param {string|null} [opts.appUrlQr] - SVG string for the app URL QR code
	 * @param {Object|null} [opts.jsPDF] - optional jsPDF instance
	 */
	constructor(opts) {
		this.shares = opts.shares
		this.threshold = opts.threshold
		this.shardSetId = opts.shardSetId
		this.publicNote = opts.publicNote || ''
		this.appUrl = opts.appUrl || null
		this.appUrlQr = opts.appUrlQr || null
		this.jsPDF = opts.jsPDF || null
	}

	/**
	 * Build a PDF blob from an existing jsPDF instance.
	 *
	 * @param {import('jspdf').jsPDF} pdf - a jsPDF document instance
	 * @returns {Promise<Blob>} PDF blob
	 */
	async buildPdfBlob(pdf) {
		const { colors } = ShardsPdfBuilder

		pdf.setDocumentProperties({
			title: `Shards Backup Card Set #${this.shardSetId} (${this.threshold} threshold)`,
			author: 'Shards Web App',
			creator: this.appUrl,
			keywords: 'Shards, SSKR, Sharded Secret Key Reconstruction',
			language: 'en',
		})

		await ShardsPdfBuilder.loadRobotoMono(pdf)

		const pageWidth = pdf.internal.pageSize.getWidth()
		const pageHeight = pdf.internal.pageSize.getHeight()

		for (let i = 0; i < this.shares.length; i += 1) {
			const share = this.shares[i]

			if (i > 0) {
				pdf.addPage()
			}

			const drawRoundedRect = (x, y, w, h, radius, style) => {
				if (typeof pdf.roundedRect === 'function') {
					pdf.roundedRect(x, y, w, h, radius, radius, style)
				} else {
					pdf.rect(x, y, w, h, style)
				}
			}

			pdf.setFillColor(...colors.pageBg)
			pdf.rect(0, 0, pageWidth, pageHeight, 'F')

			const card = { x: 8, y: 8, w: pageWidth - 16, h: pageHeight - 16 }
			const contentX = card.x + 6
			const contentW = card.w - 12
			pdf.setFillColor(...colors.white)
			drawRoundedRect(card.x, card.y, card.w, card.h, 4, 'F')
			pdf.setDrawColor(...colors.cardBorder)
			drawRoundedRect(card.x, card.y, card.w, card.h, 4, 'S')

			const headerY = card.y + 6
			const publicNoteValue = (this.publicNote || '').trim()
			const headerH = publicNoteValue ? 42 : 34
			pdf.setFillColor(...colors.headerBg)
			drawRoundedRect(contentX, headerY, contentW, headerH, 3, 'F')

			pdf.setFontSize(14.5)
			pdf.setTextColor(...colors.headerText)
			pdf.text(`Shard ${i + 1} of ${this.shares.length}`, contentX + 6, headerY + 10.5)
			pdf.setFontSize(8.8)
			pdf.setFont('helvetica', 'normal')
			const shardSetIdValue = this.shardSetId || 'unknown'
			pdf.text(`${this.threshold} threshold - Shard Set ID: ${shardSetIdValue}`, contentX + 6, headerY + 16.5)

			if (publicNoteValue) {
				pdf.setFontSize(8)
				pdf.setTextColor(...colors.headerTextMuted)
				let pubNoteLines = pdf.splitTextToSize(publicNoteValue, contentW - 12)
				if (pubNoteLines.length > 2) {
					pubNoteLines = pubNoteLines.slice(0, 2)
					const last = pubNoteLines[1]
					pubNoteLines[1] = `${last.slice(0, Math.max(0, last.length - 3))}...`
				}
				pdf.text(pubNoteLines, contentX + 6, headerY + 33)
			}

			const sidePanelW = 41
			const sidePanelH = 24
			const sidePanelX = contentX + contentW - sidePanelW - 4
			const sidePanelY = headerY + 4
			pdf.setFillColor(...colors.sidePanelBg)
			drawRoundedRect(sidePanelX, sidePanelY, sidePanelW, sidePanelH, 2, 'F')
			pdf.setFont('helvetica', 'bold')
			pdf.setFontSize(6.6)
			pdf.setTextColor(...colors.headerText)
			pdf.text('ENCRYPTED SHARD', sidePanelX + 3, sidePanelY + 6.5)
			pdf.setFont('helvetica', 'normal')
			pdf.setFontSize(5.6)
			pdf.setTextColor(...colors.headerTextMuted)
			pdf.text('Store each shard in a \nseparate secure location.', sidePanelX + 3, sidePanelY + 18.5)

			// QR code
			const qrCardSize = 88
			const qrCardX = contentX + (contentW - qrCardSize) / 2
			const qrCardY = headerY + headerH + 6 + (101 - qrCardSize) / 2
			pdf.setFillColor(...colors.white)
			drawRoundedRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 2, 'F')
			pdf.setDrawColor(...colors.qrCardBorder)
			drawRoundedRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 2, 'S')

			const qrSize = 76
			const qrX = qrCardX + (qrCardSize - qrSize) / 2
			const qrY = qrCardY + (qrCardSize - qrSize) / 2
			const rendered = await ShardsPdfBuilder.addSvgToPdf(pdf, share.qr, qrX, qrY, qrSize)
			if (!rendered) {
				const qrDataUrl = await ShardsPdfBuilder.svgToHighResDataUrl(share.qr, 1024)
				pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)
			}

			// Footer app panel position (anchored to bottom of card)
			const appPanelH = 28
			const appPanelY = card.y + card.h - 6 - appPanelH

			// Encrypted UR Payload (black on white, no label) — anchored above footer
			pdf.setFontSize(8.6)
			try {
				pdf.setFont('RobotoMono', 'normal')
			} catch {
				pdf.setFont('courier', 'normal')
			}
			const urText = share.ur.toUpperCase()
			const urLineHeight = 3.7
			const urCharSpacing = 0.15
			pdf.setCharSpace(urCharSpacing)
			const urLinesWidth = contentW - 8 - 52 * urCharSpacing
			const urLines = pdf.splitTextToSize(urText, urLinesWidth)
			pdf.setCharSpace(0)
			const urPaddingTop = 5
			const urPaddingBottom = 1.5
			const urBoxH = (urLines.length - 1) * urLineHeight + urPaddingTop + urPaddingBottom
			const urBoxY = appPanelY - 6 - urBoxH

			pdf.setFillColor(...colors.white)
			drawRoundedRect(contentX, urBoxY, contentW, urBoxH, 2, 'F')
			pdf.setDrawColor(...colors.cardBorder)
			drawRoundedRect(contentX, urBoxY, contentW, urBoxH, 2, 'S')

			pdf.setCharSpace(urCharSpacing)
			pdf.setTextColor(...colors.black)
			pdf.text(urLines, contentX + 4, urBoxY + urPaddingTop)
			pdf.setCharSpace(0)

			pdf.setFillColor(...colors.footerBg)
			drawRoundedRect(contentX, appPanelY, contentW, appPanelH, 2.2, 'F')
			pdf.setDrawColor(...colors.cardBorder)
			drawRoundedRect(contentX, appPanelY, contentW, appPanelH, 2.2, 'S')

			if (this.appUrl && this.appUrlQr) {
				pdf.setFont('helvetica', 'bold')
				pdf.setFontSize(8.9)
				pdf.setTextColor(...colors.footerText)
				pdf.text('Return to Shards Web App', contentX + 5, appPanelY + 7.3)

				const appQrPanelSize = 21
				const appQrPanelX = contentX + contentW - appQrPanelSize - 4
				const appQrPanelY = appPanelY + (appPanelH - appQrPanelSize) / 2
				pdf.setFillColor(...colors.white)
				drawRoundedRect(appQrPanelX, appQrPanelY, appQrPanelSize, appQrPanelSize, 1.2, 'F')

				const appQrSize = 16
				const appQrX = appQrPanelX + (appQrPanelSize - appQrSize) / 2
				const appQrY = appQrPanelY + (appQrPanelSize - appQrSize) / 2
				const renderedAppQr = await ShardsPdfBuilder.addSvgToPdf(pdf, this.appUrlQr, appQrX, appQrY, appQrSize)
				if (!renderedAppQr) {
					const appQrDataUrl = await ShardsPdfBuilder.svgToHighResDataUrl(this.appUrlQr, 512)
					pdf.addImage(appQrDataUrl, 'PNG', appQrX, appQrY, appQrSize, appQrSize)
				}

				const appTextWidth = contentW - appQrPanelSize - 12
				pdf.setFont('helvetica', 'normal')
				pdf.setFontSize(6.5)
				const appUrlLines = pdf.splitTextToSize(this.appUrl, appTextWidth)
				pdf.setTextColor(...colors.footerTextMuted)
				pdf.text(appUrlLines, contentX + 5, appPanelY + 12.5)
			} else {
				pdf.setFont('helvetica', 'normal')
				pdf.setFontSize(7.2)
				pdf.setTextColor(...colors.footerTextMuted)
				pdf.text('Set VITE_APP_URL to include a return link and QR code.', contentX + 5, appPanelY + 11)
			}
		}

		return pdf.output('blob')
	}

	/**
	 * Create a new jsPDF instance and build the PDF blob.
	 * Convenience method that handles jsPDF instantiation internally.
	 *
	 * @returns {Promise<Blob>} PDF blob
	 */
	async build() {
		const JsPDF = this.jsPDF || (await ShardsPdfBuilder.getJsPDF())
		const pdf = new JsPDF({
			orientation: 'portrait',
			unit: 'mm',
			format: 'a4',
		})
		return this.buildPdfBlob(pdf)
	}

	/**
	 * Build and trigger download of the PDF.
	 */
	async download(filename) {
		const pdfBlob = await this.build()
		const url = URL.createObjectURL(pdfBlob)
		const a = document.createElement('a')
		a.href = url
		a.download = filename
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}
}
