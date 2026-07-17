import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const SUBSCRIPTION_TERMS_VERSION = 'AMC-SMSA-v1.04'
export const SUBSCRIPTION_TERMS_TITLE = 'AI Marketing Crew Service Terms / AI Marketing Crew 服务条款'
export const SUBSCRIPTION_TERMS_EN_FILENAME = 'AI-Marketing-Crew-Service-Terms-English.pdf'
export const SUBSCRIPTION_TERMS_ZH_FILENAME = 'AI-Marketing-Crew-Service-Terms-Chinese.pdf'
export const SUBSCRIPTION_TERMS_FILENAME = SUBSCRIPTION_TERMS_EN_FILENAME
export const SUBSCRIPTION_TERMS_FILENAMES = {
  en: SUBSCRIPTION_TERMS_EN_FILENAME,
  zh: SUBSCRIPTION_TERMS_ZH_FILENAME,
} as const

export type SubscriptionTermsLanguage = keyof typeof SUBSCRIPTION_TERMS_FILENAMES

const TERMS_RELATIVE_PATH = join('src', 'content', 'service-terms.md')
const TERMS_PDF_RELATIVE_DIR = join('public', 'legal')

function projectPath(relativePath: string): string {
  return join(process.cwd(), relativePath)
}

export function getSubscriptionTermsMarkdown(language?: SubscriptionTermsLanguage): string {
  const markdown = readFileSync(projectPath(TERMS_RELATIVE_PATH), 'utf8').trim()
  if (!language) return markdown

  const [english, chinese] = markdown.split(/\n---\n/, 2)
  return (language === 'zh' ? chinese || markdown : english || markdown).trim()
}

export const SUBSCRIPTION_TERMS_FULL_TEXT = getSubscriptionTermsMarkdown()

export const SUBSCRIPTION_TERMS_NOTICE =
  'Please read the full service terms and tick to agree before creating a payment order. By subscribing, paying, creating a brand workspace or continuing to use AMC, you acknowledge and agree to the full Service Terms, including GenAI risk, data rights and protection, IP responsibilities and limitation of liability. 请完整阅读服务条款并勾选同意，方可创建支付订单。订阅、付款、创建品牌工作区或继续使用 AMC，即表示您确认并同意完整服务条款，包括 GenAI 风险、数据权利与保护、知识产权责任和责任限制。'

export function getSubscriptionTermsPdfPath(language: SubscriptionTermsLanguage = 'en'): string {
  return projectPath(join(TERMS_PDF_RELATIVE_DIR, SUBSCRIPTION_TERMS_FILENAMES[language]))
}

export function getSubscriptionTermsPdf(language: SubscriptionTermsLanguage = 'en'): Buffer {
  const pdfPath = getSubscriptionTermsPdfPath(language)
  const sourcePath = projectPath(TERMS_RELATIVE_PATH)

  if (existsSync(pdfPath) && statSync(pdfPath).mtimeMs >= statSync(sourcePath).mtimeMs) {
    return readFileSync(pdfPath)
  }

  if (language === 'en') {
    return buildSubscriptionTermsPdf(getSubscriptionTermsMarkdown('en'))
  }

  throw new Error(
    `Standard ${language} service terms PDF is missing or older than ${TERMS_RELATIVE_PATH}. Run npm run generate:service-terms-pdfs.`,
  )
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line]
  const words = line.split(/\s+/)
  const result: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word
    } else {
      result.push(current)
      current = word
    }
  }
  if (current) result.push(current)
  return result.length ? result : [line]
}

function buildPdf(objects: string[], rootObjectId: number): Buffer {
  const chunks: string[] = ['%PDF-1.4\n']
  const offsets: number[] = [0]
  let offset = chunks[0].length

  objects.forEach((body, index) => {
    offsets[index + 1] = offset
    const objectText = `${index + 1} 0 obj\n${body}\nendobj\n`
    chunks.push(objectText)
    offset += Buffer.byteLength(objectText, 'binary')
  })

  const xrefOffset = offset
  const xrefRows = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
  for (let i = 1; i <= objects.length; i += 1) {
    xrefRows.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `)
  }
  const trailer = [
    ...xrefRows,
    'trailer',
    `<< /Size ${objects.length + 1} /Root ${rootObjectId} 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
  ].join('\n')
  chunks.push(trailer)
  return Buffer.from(chunks.join(''), 'binary')
}

export function buildSubscriptionTermsPdf(markdown = getSubscriptionTermsMarkdown()): Buffer {
  const plain = markdownToPlainText(markdown)
  const pageWidth = 595
  const pageHeight = 842
  const marginX = 54
  const marginTop = 58
  const lineHeight = 13
  const maxLinesPerPage = Math.floor((pageHeight - marginTop - 48) / lineHeight)
  const maxChars = 82

  const allLines = plain.split('\n').flatMap((line) => {
    if (!line.trim()) return ['']
    return wrapLine(line, maxChars)
  })

  const pageLineGroups: string[][] = []
  let current: string[] = []
  for (const line of allLines) {
    if (current.length >= maxLinesPerPage) {
      pageLineGroups.push(current)
      current = []
    }
    current.push(line)
  }
  if (current.length) pageLineGroups.push(current)

  const objects: string[] = []
  const catalogId = 1
  const pagesId = 2
  objects.push('') // catalog
  objects.push('') // pages
  const pageIds: number[] = []

  for (const lines of pageLineGroups) {
    const contentOps = [
      'BT',
      '/F1 8 Tf',
      `${marginX} ${pageHeight - marginTop} Td`,
      `${lineHeight} TL`,
      ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      'ET',
    ].join('\n')
    const streamObject = `<< /Length ${Buffer.byteLength(contentOps, 'binary')} >>\nstream\n${contentOps}\nendstream`
    objects.push(streamObject)
    const contentId = objects.length
    const pageObject = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentId} 0 R >>`
    objects.push(pageObject)
    pageIds.push(objects.length)
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

  return buildPdf(objects, catalogId)
}
