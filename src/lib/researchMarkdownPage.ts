import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export function renderResearchMarkdownPage(input: { brandName: string; markdown: string; downloadBase: string; hasPdf: boolean }) {
  const headings: Array<{ id: string; title: string; level: number }> = []
  const used = new Map<string, number>()
  const article = micromark(input.markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml()],
    allowDangerousHtml: false, allowDangerousProtocol: false })
  .replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_match, rawLevel, content) => {
    const level = Number(rawLevel)
    const title = content.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_: string, hex: string, decimal: string) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)))
    const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section'
    const count = (used.get(slug) || 0) + 1; used.set(slug, count)
    const id = count === 1 ? slug : `${slug}-${count}`
    headings.push({ id, title, level })
    return `<h${level} id="${escape(id)}">${content}</h${level}>`
  }).replace(/<table>([\s\S]*?)<\/table>/g, '<div class="table-scroll"><table>$1</table></div>')
  const toc = headings.filter(h => h.level > 1).map(h => `<a class="level-${h.level}" href="#${escape(h.id)}">${escape(h.title)}</a>`).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(input.brandName)} · 商家调研报告 V5</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f6f8fa;color:#1e293b;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;line-height:1.9}.toolbar{padding:16px 24px;background:white;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.toolbar nav{display:flex;gap:16px}a{color:#0f766e;text-decoration:none}a:hover{text-decoration:underline}.layout{max-width:1180px;margin:32px auto;display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;padding:0 24px}.toc{position:sticky;top:24px;align-self:start;max-height:88vh;overflow:auto;font-size:14px}.toc a{display:block;padding:5px 0}.toc .level-3{padding-left:12px;color:#64748b}article{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:40px 48px;min-width:0;overflow-wrap:anywhere}h1{font-size:30px;line-height:1.45;margin:0 0 26px}h2{font-size:24px;margin:36px 0 16px;border-bottom:1px solid #e2e8f0;padding-bottom:10px}h3{font-size:19px;margin:26px 0 12px}h1,h2,h3{scroll-margin-top:20px}p,ul,ol{margin:12px 0}li{margin:5px 0}blockquote{border-left:3px solid #99c9c3;padding-left:16px;color:#64748b;margin-left:0}.table-scroll{overflow:auto;max-width:100%}table{border-collapse:collapse;font-size:14px;width:100%}th,td{border:1px solid #e2e8f0;padding:10px 12px;text-align:left;min-width:100px}th{background:#f8fafc}pre{overflow:auto;background:#f8fafc;padding:16px}img{max-width:100%;height:auto}.mobile-toc{display:none}@media(max-width:760px){.layout{display:block;padding:0 12px;margin:16px auto}.toc{display:none}.mobile-toc{display:block;background:white;padding:12px 16px;border-radius:8px;margin-bottom:12px}.mobile-toc a{display:block;font-size:14px}article{padding:24px 20px}h1{font-size:25px}h2{font-size:21px}.toolbar{padding:14px 16px;font-size:14px}}
</style></head><body><header class="toolbar"><span>${escape(input.brandName)} · V5</span><nav><a href="${escape(input.downloadBase)}?format=markdown">下载 Markdown</a>${input.hasPdf ? `<a href="${escape(input.downloadBase)}?format=pdf">下载 PDF</a>` : ''}</nav></header><main class="layout"><aside class="toc"><strong>目录</strong>${toc}</aside><div><details class="mobile-toc"><summary>目录</summary>${toc}</details><article>${article}</article></div></main></body></html>`
}
