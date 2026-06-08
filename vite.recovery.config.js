import path from 'node:path'
import { defineConfig } from 'vite'

function inlineRecoveryPage() {
	return {
		name: 'inline-recovery-page',
		enforce: 'post',
		generateBundle(_options, bundle) {
			const htmlAsset = Object.values(bundle).find((item) => item.type === 'asset' && item.fileName.endsWith('.html'))
			if (!htmlAsset || typeof htmlAsset.source !== 'string') {
				throw new Error('Recovery HTML asset was not generated')
			}

			let html = htmlAsset.source
			for (const [fileName, item] of Object.entries(bundle)) {
				if (item === htmlAsset) continue
				if (item.type === 'chunk') {
					const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
					const inlineCode = item.code.replace(/<\/script/gi, '<\\/script')
					html = html.replace(new RegExp(`<script[^>]+src="[./]*${escapedFileName}"[^>]*></script>`), () => `<script type="module">${inlineCode}</script>`)
					delete bundle[fileName]
				} else if (fileName.endsWith('.css')) {
					const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
					const inlineCss = String(item.source).replace(/<\/style/gi, '<\\/style')
					html = html.replace(new RegExp(`<link[^>]+href="[./]*${escapedFileName}"[^>]*>`), () => `<style>${inlineCss}</style>`)
					delete bundle[fileName]
				}
			}

			htmlAsset.source = html
			htmlAsset.fileName = 'recovery.html'
		},
	}
}

export default defineConfig({
	base: './',
	plugins: [inlineRecoveryPage()],
	define: {
		global: 'globalThis',
	},
	resolve: {
		alias: {
			'@bcts/known-values': path.resolve(__dirname, 'src/vendor/bcts-known-values-lite.js'),
		},
	},
	build: {
		emptyOutDir: false,
		assetsInlineLimit: Number.MAX_SAFE_INTEGER,
		cssCodeSplit: false,
		rollupOptions: {
			input: path.resolve(__dirname, 'recovery.html'),
			output: {
				inlineDynamicImports: true,
			},
		},
	},
})
