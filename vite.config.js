import path from 'node:path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) ?? `${Date.now()}`

export default defineConfig({
	plugins: [solid()],
	define: {
		global: 'globalThis',
		__APP_BUILD_ID__: JSON.stringify(BUILD_ID),
	},
	resolve: {
		alias: {
			'@bcts/known-values': path.resolve(__dirname, 'src/vendor/bcts-known-values-lite.js'),
		},
	},
	build: {
		rollupOptions: {
			plugins: [
				{
					name: 'emit-build-version-json',
					generateBundle() {
						this.emitFile({
							type: 'asset',
							fileName: 'version.json',
							source: `${JSON.stringify({ buildId: BUILD_ID }, null, 2)}\n`,
						})
					},
				},
			],
		},
	},
	server: {
		host: true,
		port: 3000,
		allowedHosts: true,
	},
})
