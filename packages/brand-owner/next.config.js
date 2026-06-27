/** @type {import('next').NextConfig} */
const nextConfig = {
  // brand-owner does not use react-markdown or micromark — those live
  // in the root package only. Listing packages here that are not in
  // this package's own node_modules causes build failures when deployed
  // standalone (rootDir: packages/brand-owner on Render).

  // Proxy all /api/* requests to the main AMC Kanban app
  // This allows brand-owner (amc-mm) to share the same
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
