import { createSignal, onMount, onCleanup } from 'solid-js'
import { ShardsPdfBuilder } from './pdf.js'

export default function PdfPreview() {
	const [pdfUrl, setPdfUrl] = createSignal(null)

	onMount(async () => {
		const opts = ShardsPdfBuilder.parsePdfPreviewHash(location.hash)
		if (!opts) return
		const blob = await new ShardsPdfBuilder(opts).build()
		setPdfUrl(URL.createObjectURL(blob))
	})

	onCleanup(() => {
		const url = pdfUrl()
		if (url) URL.revokeObjectURL(url)
	})

	return (
		<div class="text-center py-5">
			{pdfUrl() ? (
				<>
					<a href={pdfUrl()} target="_blank" rel="noopener" class="btn btn-primary mb-3">Open PDF</a>
					<br />
					<a href="#" onClick={(e) => { e.preventDefault(); history.back() }}>Go back</a>
				</>
			) : (
				<div class="spinner-border" role="status">
					<span class="visually-hidden">Loading PDF...</span>
				</div>
			)}
		</div>
	)
}
