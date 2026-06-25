const path = require('path')

module.exports = {
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
}
