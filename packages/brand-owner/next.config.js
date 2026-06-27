const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },

  // Proxy all /api/* requests to the main AMC Kanban app (port 3000)
  // This allows the brand-owner app (port 3001) to share the same
  // authentication, session cookies, and backend APIs.
  async rewrites() {
    const mainAppUrl = process.env.MAIN_APP_URL || 'http://localhost:3000'
    return [
      {
        source: '/api/:path*',
        destination: `${mainAppUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
