const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins: ['127.0.0.1'],
	transpilePackages: [
		'react-markdown',
		'remark-gfm',
		'micromark-extension-gfm',
		'micromark-extension-gfm-strikethrough',
		'micromark-extension-gfm-autolink-literal',
		'micromark-extension-gfm-footnote',
		'micromark-extension-gfm-table',
		'micromark-extension-gfm-tagfilter',
		'micromark-util-combine-extensions',
		'micromark-util-subtokenize'
	],
	turbopack: {
		root: path.resolve(__dirname),
	},
	// Turbopack is opt-in for local dev only (next dev --turbopack).
	// Removed from here to allow production webpack builds to succeed
	// (framer-motion has a module resolution issue under Turbopack).
	experimental: {
		serverActions: { bodySizeLimit: '10mb' },
	},
}

// PWA configuration — disabled in dev to avoid Service Worker interference
let config = nextConfig
if (process.env.NODE_ENV === 'production') {
	try {
		const withPWA = require('@ducanh2912/next-pwa').default({
			dest: 'public',
			disable: false,
			register: true,
			skipWaiting: true,
			cacheOnFrontEndNav: true,
			aggressiveFrontEndNavCaching: true,
			reloadOnOnline: true,
			swcMinify: true,
			workboxOptions: {
				disableDevLogs: true,
			},
			// Do NOT cache API routes or auth endpoints in the SW
			exclude: [
				/api\//,
				/auth\//,
				/_next\/static\/chunks\/pages\/api/,
			],
		})
		config = withPWA(nextConfig)
	} catch (e) {
		// Package not yet installed — fall through to plain config
		console.warn('[next.config] @ducanh2912/next-pwa not found, skipping PWA setup:', e.message)
	}
}

module.exports = config

