const path = require('path')

module.exports = {
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
