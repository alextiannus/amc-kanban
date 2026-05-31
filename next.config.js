const path = require('path')

module.exports = {
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
