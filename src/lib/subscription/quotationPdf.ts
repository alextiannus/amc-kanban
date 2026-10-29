import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { quotationMoney, type QuotationSnapshot } from './quotation'

// A4 template, shared by initial delivery and every retry. The saved PDF is
// immutable; changes to the catalogue or template cannot rewrite a sent quote.
export async function renderQuotationPdf(quote: QuotationSnapshot): Promise<Buffer> {
  // Normalize compatibility glyphs (for example Kangxi radicals copied from PDFs)
  // for display only. Keep the persisted commercial snapshot unchanged.
  const display = (value: string) => value.normalize('NFKC')
  quote = { ...quote, customer: display(quote.customer), uen: quote.uen ? display(quote.uen) : quote.uen,
    recipient: display(quote.recipient), brandName: display(quote.brandName), address: display(quote.address),
    planName: display(quote.planName), services: quote.services.map(display),
    lines: quote.lines.map(line => ({ ...line, description: display(line.description) })) }
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`AMC Quotation ${quote.number}`)
  doc.setAuthor('DELIVERYCHINATOWN PTE. LTD.')
  doc.setCreationDate(new Date(quote.issuedAt))
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const values = [quote.customer, quote.uen || '', quote.recipient, quote.brandName, quote.address, quote.planName, ...quote.services, ...quote.lines.map(line => line.description)]
  const unicode = values.some(value => /[^\x20-\xff]/.test(value))
    ? await doc.embedFont(await readFile(join(process.cwd(), 'public/fonts/quotation-noto-sans-sc.ttf')), { subset: false })
    : normal
  const glyphs = new Set(unicode.getCharacterSet())
  const fontFor = (value: string, strong = false) => /[^\x20-\xff]/.test(value) ? unicode : strong ? bold : normal
  // Fail visibly instead of shipping a customer name rendered as empty boxes.
  for (const value of values) {
    for (const char of value) {
      if (char.codePointAt(0)! > 126 && !glyphs.has(char.codePointAt(0)!)) throw new Error('Quotation font does not support a customer character')
    }
  }
  const ink = rgb(.12, .14, .17), muted = rgb(.37, .40, .43), rule = rgb(.77, .79, .81)
  let page: PDFPage, y = 0
  const text = (value: string, x: number, top: number, size = 10, strong = false) => {
    page.drawText(value, { x, y: 842 - top - size, size, font: fontFor(value, strong), color: ink })
  }
  const line = (top: number) => page.drawLine({ start: { x: 40, y: 842 - top }, end: { x: 555, y: 842 - top }, thickness: .6, color: rule })
  const newPage = () => {
    page = doc.addPage([595, 842]); y = 60
    text('AMC', 40, 28, 14, true)
    text(`QUOTATION  ${quote.number}`, 115, 32, 8)
    line(51)
  }
  const ensure = (height: number) => { if (y + height > 782) newPage() }
  const wrap = (value: string, width: number, size: number, font: PDFFont) => {
    const output: string[] = []; let current = ''
    for (const token of value.replace(/\s+/g, ' ').match(/\S+\s*/gu) || []) {
      if (font.widthOfTextAtSize(current + token, size) <= width) { current += token; continue }
      if (current.trim()) { output.push(current.trimEnd()); current = '' }
      for (const char of token) {
        if (current && font.widthOfTextAtSize(current + char, size) > width) { output.push(current.trimEnd()); current = '' }
        current += char
      }
    }
    if (current.trim()) output.push(current.trimEnd())
    return output.length ? output : ['']
  }
  const paragraph = (value: string, { x = 40, width = 515, size = 10, strong = false, gap = 6 } = {}) => {
    if (strong) ensure(50)
    for (const part of wrap(value, width, size, fontFor(value, strong))) { ensure(size + 6); text(part, x, y, size, strong); y += size + 5 }
    y += gap
  }
  newPage()
  text('QUOTATION', 40, 71, 26)
  text('DELIVERYCHINATOWN PTE. LTD.', 325, 75, 10, true)
  ;['22 Sin Ming Lane #06-76', 'Midview City, Singapore 573969', 'UEN: 201835327N', 'GST Reg No: 201835327N'].forEach((value, i) => text(value, 325, 95 + i * 15, 9))
  y = 113
  paragraph(quote.customer, { width: 265, strong: true })
  if (quote.brandName && quote.brandName !== quote.customer) paragraph(quote.brandName, { width: 265 })
  if (quote.uen) paragraph(`UEN: ${quote.uen}`, { width: 265, size: 9 })
  if (quote.address) paragraph(quote.address, { width: 265, size: 9 })
  paragraph(quote.recipient, { width: 265, size: 9 })
  y = Math.max(y + 10, 182)
  const date = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(quote.issuedAt))
  paragraph(`Quotation date: ${date}     Subscription term: ${quote.durationMonths} months`, { size: 9 })
  paragraph(`Reference: ${quote.number}`, { size: 9 })
  y += 8
  const tableHeader = () => {
    ensure(35); line(y); y += 9
    text('Description', 40, y, 9, true); text('Quantity', 350, y, 9, true)
    text('Unit price', 413, y, 9, true); text('Amount SGD', 495, y, 9, true)
    y += 20; line(y); y += 9
  }
  tableHeader()
  for (const item of quote.lines) {
    const rows = wrap(item.description, 295, 10, fontFor(item.description))
    if (y + rows.length * 15 + 16 > 782) { newPage(); tableHeader() }
    text(String(item.quantity), 365, y, 9)
    const unit = quotationMoney(item.unitCents), amount = quotationMoney(item.amountCents)
    text(unit, 470 - normal.widthOfTextAtSize(unit, 9), y, 9)
    text(amount, 555 - normal.widthOfTextAtSize(amount, 9), y, 9)
    for (const row of rows) { text(row, 40, y, 10); y += 15 }
    y += 8; line(y); y += 10
  }
  ensure(116)
  for (const [label, amount, strong] of [
    ...(quote.discountCents ? [['Discount', -quote.discountCents, false]] : []),
    ['Subtotal', quote.subtotalCents, false], ['GST 9%', quote.gstCents, false], ['TOTAL SGD', quote.totalCents, true],
  ] as [string, number, boolean][]) {
    text(label, 350, y, 10, strong)
    const value = quotationMoney(amount), font = strong ? bold : normal
    text(value, 555 - font.widthOfTextAtSize(value, 10), y, 10, strong); y += 23
  }
  y += 14
  paragraph('Software', { strong: true, size: 12 })
  for (const service of quote.services) paragraph(`- ${service}`, { size: 9, gap: 2 })
  y += 5
  paragraph('Professional Service', { strong: true, size: 12 })
  paragraph('Initial account setup, branding evaluation and merchant context setup. Online customer support and fine-tuning during the subscription term.')
  paragraph('Training', { strong: true, size: 12 })
  paragraph('Training for users to manage the AI Marketing Crew and use the software. Online learning support during the subscription term.')
  y += 8
  paragraph('This quotation is not a tax invoice or proof of payment. Payment, trial and activation follow the subscription order and AMC Service Terms. Third-party fees and media spend are excluded unless expressly included above.', { size: 9 })
  doc.getPages().forEach((p, index, pages) => {
    p.drawText(`DELIVERYCHINATOWN PTE. LTD.  |  ${index + 1} / ${pages.length}`, { x: 40, y: 24, size: 8, font: normal, color: muted })
  })
  return Buffer.from(await doc.save())
}
